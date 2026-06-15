/**
 * Behavioral regression suite for the Stripe webhook security hardening
 * (#77 / #82, epic #77). Covers three findings:
 *
 *   1. #77 P1-3 — forged `metadata.user_id` must NOT be able to mutate another
 *      user's plan. The webhook resolves users by `stripe_customer_id` for
 *      subscription/invoice events and cross-checks the bootstrap path, so a
 *      checkout session carrying a victim's user_id but a customer already
 *      bound to a different profile is rejected (customer_mismatch).
 *
 *   2. #82 / P2-4 — last-write-wins / TOCTOU. An older event (smaller
 *      `event.created`) arriving after a newer one for the same customer must
 *      NOT overwrite the newer state. Gated via `event_created_at` high-water
 *      mark in `processed_stripe_events`.
 *
 *   3. #77 P2-3 — a customer_id mapping miss must be surfaced, not silently
 *      200'd. For `customer.subscription.deleted` against an unmapped customer
 *      we emit a structured `console.warn` (visible/alertable) while keeping
 *      the 200 ack so the legitimate account-delete flow is not broken. For the
 *      other customer-keyed events an unmapped customer throws → 500 → Stripe
 *      retries.
 *
 * These are BEHAVIORAL tests (drive POST end-to-end with mocked Stripe +
 * Supabase), complementing the static-source tests in
 * stripe-webhook-plan-preserve.test.ts / stripe-webhook-no-any.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── rate-limit: always allow ────────────────────────────────────────────────
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => undefined,
}));

// ── Stripe SDK stub ─────────────────────────────────────────────────────────
// constructEvent returns whatever the test stages in `_nextEvent`. Signature
// verification is assumed to have passed (the route calls constructEvent and we
// short-circuit it). subscriptions.retrieve returns a staged subscription.
let _nextEvent: unknown = null;
let _constructThrows = false;
const _retrievedSubscription = {
  items: { data: [{ price: { id: "price_pro_test" } }] },
};
vi.mock("stripe", () => {
  class StripeStub {
    webhooks = {
      constructEvent: (_raw: string, _sig: string, _secret: string) => {
        if (_constructThrows) throw new Error("bad signature");
        return _nextEvent;
      },
    };
    subscriptions = {
      retrieve: vi.fn(async (_id: string) => _retrievedSubscription),
    };
    constructor(..._args: unknown[]) {}
  }
  return { default: StripeStub };
});

// ── Supabase admin client stub ──────────────────────────────────────────────
// In-memory ledger + profiles, with a chainable query builder that supports
// every call shape the route uses.
type LedgerRow = {
  event_id: string;
  event_type: string;
  customer_id: string | null;
  status: "processing" | "processed" | "failed";
  event_created_at: string | null;
  updated_at: string;
  last_error?: string | null;
};
type ProfileRow = {
  id: string;
  stripe_customer_id: string | null;
  plan?: string | null;
  subscription_status?: string | null;
};

let _ledger: LedgerRow[] = [];
let _profiles: ProfileRow[] = [];
// Force the ledger INSERT to report a unique-violation (simulate duplicate).
let _ledgerInsertConflict = false;
// Captured profile updates so tests can assert plan/status writes.
const _profileUpdates: Array<{ id: string; payload: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  // Accumulated state across the fluent chain.
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  let mode: "select" | "insert" | "update" = "select";
  let updatePayload: Record<string, unknown> | null = null;
  let orderDesc = false;
  let orderCol: string | null = null;
  let limitN: number | null = null;

  const matches = (row: Record<string, unknown>) =>
    filters.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return v === f.val;
      if (f.op === "neq") return v !== f.val;
      if (f.op === "lt") return (v as string) < (f.val as string);
      return true;
    });

  const rowsFor = (): Record<string, unknown>[] => {
    const store: Record<string, unknown>[] =
      table === "processed_stripe_events"
        ? (_ledger as unknown as Record<string, unknown>[])
        : (_profiles as unknown as Record<string, unknown>[]);
    let rows = store.filter(matches);
    if (orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = (a[orderCol!] ?? "") as string;
        const bv = (b[orderCol!] ?? "") as string;
        return orderDesc ? (av < bv ? 1 : av > bv ? -1 : 0) : av < bv ? -1 : av > bv ? 1 : 0;
      });
    }
    if (limitN !== null) rows = rows.slice(0, limitN);
    return rows;
  };

  const builder: Record<string, unknown> = {
    select(_cols?: string) {
      if (mode === "select") mode = "select";
      return builder;
    },
    insert(payload: Record<string, unknown>) {
      mode = "insert";
      // INSERT resolves immediately (no further chain) — return a thenable.
      return {
        then: (resolve: (v: { error: unknown }) => void) => {
          if (table === "processed_stripe_events") {
            if (
              _ledgerInsertConflict ||
              _ledger.some((r) => r.event_id === payload.event_id)
            ) {
              resolve({ error: { code: "23505", message: "unique_violation" } });
              return;
            }
            _ledger.push(payload as unknown as LedgerRow);
          }
          resolve({ error: null });
        },
      };
    },
    update(payload: Record<string, unknown>) {
      mode = "update";
      updatePayload = payload;
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push({ op: "eq", col, val });
      return builder;
    },
    neq(col: string, val: unknown) {
      filters.push({ op: "neq", col, val });
      return builder;
    },
    lt(col: string, val: unknown) {
      filters.push({ op: "lt", col, val });
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderCol = col;
      orderDesc = opts?.ascending === false;
      return builder;
    },
    limit(n: number) {
      limitN = n;
      return builder;
    },
    async maybeSingle() {
      const rows = rowsFor();
      return { data: rows[0] ?? null, error: null };
    },
    // `.select(...)` that terminates an UPDATE chain (returns affected rows).
    // The route calls `.update(...).eq(...).select("event_id")` etc. We model
    // the terminal `.select()` returning a thenable of affected rows.
    then(resolve: (v: { data?: unknown; error: unknown }) => void) {
      // This `then` handles UPDATE chains that are awaited directly
      // (e.g. updateUserPlan's `.update().eq()` and the markFailed/markProcessed).
      if (mode === "update") {
        const rows = rowsFor();
        for (const row of rows) {
          Object.assign(row, updatePayload);
          if (table === "profiles") {
            _profileUpdates.push({
              id: row.id as string,
              payload: { ...(updatePayload as Record<string, unknown>) },
            });
          }
        }
        resolve({ data: rows, error: null });
        return;
      }
      resolve({ data: null, error: null });
    },
  };

  // `.select()` after `.update()` must return a thenable resolving to affected
  // rows. We override select to detect post-update terminal selects.
  const origSelect = builder.select as (cols?: string) => unknown;
  builder.select = (cols?: string) => {
    if (mode === "update") {
      // terminal: return thenable of affected rows after applying the update.
      return {
        then: (resolve: (v: { data: unknown; error: unknown }) => void) => {
          const rows = rowsFor();
          for (const row of rows) {
            Object.assign(row, updatePayload);
            if (table === "profiles") {
              _profileUpdates.push({
                id: row.id as string,
                payload: { ...(updatePayload as Record<string, unknown>) },
              });
            }
          }
          resolve({ data: rows, error: null });
        },
      };
    }
    return origSelect(cols);
  };

  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

// ── Test harness ────────────────────────────────────────────────────────────
const ORIG_ENV = { ...process.env };

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function invoke(event: unknown) {
  _nextEvent = event;
  const { POST } = await import("@/app/api/stripe/webhook/route");
  const req = new Request("https://test.local/api/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
  });
  const res = await POST(req);
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

describe("Stripe webhook hardening (#77 / #82)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    _ledger = [];
    _profiles = [];
    _profileUpdates.length = 0;
    _ledgerInsertConflict = false;
    _nextEvent = null;
    _constructThrows = false;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"; // pragma: allowlist secret
    process.env.STRIPE_SECRET_KEY = "sk_test_real"; // pragma: allowlist secret
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_real"; // pragma: allowlist secret
    process.env.STRIPE_PRO_PRICE_IDS = "price_pro_test";
    process.env.STRIPE_STARTER_PRICE_IDS = "price_starter_test";
    process.env.STRIPE_BUSINESS_PRICE_IDS = "price_business_test";
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // ── Finding 1: #77 P1-3 — forged metadata.user_id ────────────────────────
  describe("#77 P1-3: forged metadata.user_id cannot hijack another user", () => {
    it("rejects checkout where metadata.user_id maps to a customer-mismatched profile", async () => {
      // Victim already has a different stripe_customer_id bound to their profile.
      _profiles = [
        { id: "victim-user", stripe_customer_id: "cus_victim_real" },
      ];
      const event = {
        id: "evt_forge_1",
        type: "checkout.session.completed",
        created: 1_700_000_000,
        data: {
          object: {
            metadata: { user_id: "victim-user", plan: "business" },
            // Attacker-controlled customer that does NOT match victim's bound one.
            customer: "cus_attacker_controlled",
          },
        },
      };
      const { status } = await invoke(event);
      // 200 ack (no retry storm), but plan was NOT mutated.
      expect(status).toBe(200);
      const victimUpdates = _profileUpdates.filter(
        (u) => u.id === "victim-user" && "plan" in u.payload
      );
      expect(victimUpdates).toHaveLength(0);
      // The mismatch was surfaced as an error log (attack indicator).
      const loggedMismatch = errorSpy.mock.calls
        .flat()
        .some((a: unknown) => typeof a === "string" && a.includes("customer_mismatch"));
      expect(loggedMismatch).toBe(true);
    });

    it("subscription.updated resolves user by customer_id, ignoring any metadata", async () => {
      // The legitimate owner of cus_legit. metadata is irrelevant for this path.
      _profiles = [{ id: "owner-user", stripe_customer_id: "cus_legit" }];
      const event = {
        id: "evt_subupd_1",
        type: "customer.subscription.updated",
        created: 1_700_000_100,
        data: {
          object: {
            // Even if metadata claimed someone else, the route never reads it here.
            metadata: { user_id: "attacker-target-user" },
            customer: "cus_legit",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      // Only the customer-resolved owner was updated.
      const updated = _profileUpdates.filter((u) => u.id === "owner-user");
      expect(updated.length).toBeGreaterThan(0);
      expect(
        _profileUpdates.some((u) => u.id === "attacker-target-user")
      ).toBe(false);
    });

    it("legitimate checkout (matching/unset customer) still applies the plan", async () => {
      _profiles = [{ id: "new-user", stripe_customer_id: null }];
      const event = {
        id: "evt_legit_checkout",
        type: "checkout.session.completed",
        created: 1_700_000_200,
        data: {
          object: {
            metadata: { user_id: "new-user", plan: "pro" },
            customer: "cus_new",
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      const planUpdate = _profileUpdates.find(
        (u) => u.id === "new-user" && u.payload.plan === "pro"
      );
      expect(planUpdate).toBeTruthy();
    });
  });

  // ── Finding 2: #82 P2-4 — ordering / last-write-wins ─────────────────────
  describe("#82 P2-4: older events do not overwrite newer state", () => {
    it("an older subscription.updated does NOT overwrite a newer applied event", async () => {
      _profiles = [{ id: "u1", stripe_customer_id: "cus_seq" }];
      // Seed: a NEWER event already processed for this customer (high-water mark).
      _ledger = [
        {
          event_id: "evt_newer",
          event_type: "customer.subscription.deleted",
          customer_id: "cus_seq",
          status: "processed",
          event_created_at: new Date(1_700_000_500 * 1000).toISOString(),
          updated_at: nowIso(),
        },
      ];
      // Incoming: an OLDER subscription.updated (smaller created).
      const event = {
        id: "evt_older",
        type: "customer.subscription.updated",
        created: 1_700_000_100, // older than evt_newer's 1_700_000_500
        data: {
          object: {
            customer: "cus_seq",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      // Stale update skipped: no plan/status write to u1.
      expect(_profileUpdates.filter((u) => u.id === "u1")).toHaveLength(0);
      // Skip was surfaced.
      const skipped = warnSpy.mock.calls
        .flat()
        .some((a: unknown) => typeof a === "string" && a.includes("superseded by newer"));
      expect(skipped).toBe(true);
    });

    it("a newer event DOES apply over an older high-water mark", async () => {
      _profiles = [{ id: "u2", stripe_customer_id: "cus_seq2" }];
      _ledger = [
        {
          event_id: "evt_old_applied",
          event_type: "customer.subscription.updated",
          customer_id: "cus_seq2",
          status: "processed",
          event_created_at: new Date(1_700_000_100 * 1000).toISOString(),
          updated_at: nowIso(),
        },
      ];
      const event = {
        id: "evt_new_incoming",
        type: "customer.subscription.updated",
        created: 1_700_000_900, // newer
        data: {
          object: {
            customer: "cus_seq2",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      const updates = _profileUpdates.filter((u) => u.id === "u2");
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.some((u) => u.payload.subscription_status === "active")).toBe(
        true
      );
    });

    it("an older subscription.deleted does NOT cancel after a newer active event", async () => {
      _profiles = [{ id: "u3", stripe_customer_id: "cus_seq3", plan: "pro" }];
      _ledger = [
        {
          event_id: "evt_active_new",
          event_type: "invoice.payment_succeeded",
          customer_id: "cus_seq3",
          status: "processed",
          event_created_at: new Date(1_700_001_000 * 1000).toISOString(),
          updated_at: nowIso(),
        },
      ];
      const event = {
        id: "evt_delete_old",
        type: "customer.subscription.deleted",
        created: 1_700_000_500, // older than the active event
        data: { object: { customer: "cus_seq3", status: "canceled" } },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      // The stale cancel must NOT downgrade u3 to free/canceled.
      const downgrade = _profileUpdates.find(
        (u) => u.id === "u3" && u.payload.plan === "free"
      );
      expect(downgrade).toBeUndefined();
    });

    it("recency gate fails OPEN when event.created is missing (still applies)", async () => {
      _profiles = [{ id: "u4", stripe_customer_id: "cus_seq4" }];
      _ledger = [
        {
          event_id: "evt_hw",
          event_type: "customer.subscription.updated",
          customer_id: "cus_seq4",
          status: "processed",
          event_created_at: new Date(1_700_001_000 * 1000).toISOString(),
          updated_at: nowIso(),
        },
      ];
      const event = {
        id: "evt_no_created",
        type: "customer.subscription.updated",
        // created intentionally omitted → gate cannot compare → fail-open.
        data: {
          object: {
            customer: "cus_seq4",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(200);
      expect(_profileUpdates.filter((u) => u.id === "u4").length).toBeGreaterThan(0);
    });
  });

  // ── Finding 3: #77 P2-3 — customer mapping miss is surfaced ───────────────
  describe("#77 P2-3: unmapped customer is surfaced, not silently lost", () => {
    it("subscription.deleted for an unmapped customer warns (not silent) and still 200s", async () => {
      _profiles = []; // nobody maps to this customer
      const event = {
        id: "evt_unmapped_delete",
        type: "customer.subscription.deleted",
        created: 1_700_002_000,
        data: { object: { customer: "cus_orphan", status: "canceled" } },
      };
      const { status } = await invoke(event);
      // 200 preserved (account-delete flow must not break / no retry storm),
      expect(status).toBe(200);
      // but the miss is SURFACED as a warn referencing the unmapped customer.
      const surfaced = warnSpy.mock.calls
        .flat()
        .some(
          (a: unknown) =>
            typeof a === "string" &&
            a.includes("UNMAPPED") &&
            a.includes("cus_orphan")
        );
      expect(surfaced).toBe(true);
    });

    it("subscription.updated for an unmapped customer 500s so Stripe retries", async () => {
      _profiles = [];
      const event = {
        id: "evt_unmapped_update",
        type: "customer.subscription.updated",
        created: 1_700_002_100,
        data: {
          object: {
            customer: "cus_orphan2",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status } = await invoke(event);
      // Not a silent 200 — surfaced as a 500 so Stripe retries.
      expect(status).toBe(500);
      // Ledger row marked failed (reclaimable on retry).
      const row = _ledger.find((r) => r.event_id === "evt_unmapped_update");
      expect(row?.status).toBe("failed");
    });

    it("payment_succeeded for an unmapped customer 500s so Stripe retries", async () => {
      _profiles = [];
      const event = {
        id: "evt_unmapped_pay",
        type: "invoice.payment_succeeded",
        created: 1_700_002_200,
        data: {
          object: {
            customer: "cus_orphan3",
            // subscription id present so the handler attempts a mutation.
            parent: { subscription_details: { subscription: "sub_x" } },
          },
        },
      };
      const { status } = await invoke(event);
      expect(status).toBe(500);
      const row = _ledger.find((r) => r.event_id === "evt_unmapped_pay");
      expect(row?.status).toBe("failed");
    });
  });

  // ── Idempotency / ledger integrity preserved ──────────────────────────────
  describe("ledger integrity (regression guard for the 2-state ledger)", () => {
    it("a duplicate already-processed event returns 200 duplicate without re-mutating", async () => {
      _profiles = [{ id: "u9", stripe_customer_id: "cus_dup" }];
      _ledger = [
        {
          event_id: "evt_dup",
          event_type: "customer.subscription.updated",
          customer_id: "cus_dup",
          status: "processed",
          event_created_at: new Date(1_700_003_000 * 1000).toISOString(),
          updated_at: nowIso(),
        },
      ];
      const event = {
        id: "evt_dup",
        type: "customer.subscription.updated",
        created: 1_700_003_000,
        data: {
          object: {
            customer: "cus_dup",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      const { status, body } = await invoke(event);
      expect(status).toBe(200);
      expect(body.duplicate).toBe(true);
      expect(_profileUpdates.filter((u) => u.id === "u9")).toHaveLength(0);
    });

    it("new event records event_created_at in the ledger row", async () => {
      _profiles = [{ id: "u10", stripe_customer_id: "cus_rec" }];
      const event = {
        id: "evt_rec",
        type: "customer.subscription.updated",
        created: 1_700_004_000,
        data: {
          object: {
            customer: "cus_rec",
            status: "active",
            items: { data: [{ price: { id: "price_pro_test" } }] },
          },
        },
      };
      await invoke(event);
      const row = _ledger.find((r) => r.event_id === "evt_rec");
      expect(row).toBeTruthy();
      expect(row?.event_created_at).toBe(new Date(1_700_004_000 * 1000).toISOString());
    });
  });
});
