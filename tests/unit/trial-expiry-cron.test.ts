/**
 * L2: Unit Test — /api/cron/trial-expiry (Issue #30)
 *
 * Locks in the behavior introduced by PR:
 *   - Trial expired + not active paid subscription → downgrade to plan='free'
 *   - Trial expired + active paid subscription → skip (no downgrade)
 *   - No auth / wrong secret → 401
 *   - No Supabase config → 503
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────
// rate-limit: always pass
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: () => undefined,
}));

// supabase-js: build a query builder stub whose chained methods return
// preset rows / errors per-test.
type Row = {
  id: string;
  email: string;
  plan: string;
  trial_ends_at: string | null;
  subscription_status: string | null;
};

let selectRows: Row[] = [];
let selectError: { message: string } | null = null;
let updateError: { message: string } | null = null;
let updateCount: number | null = null;
let capturedUpdatePayload: Record<string, unknown> | null = null;
let capturedUpdateIds: string[] | null = null;

function makeFromStub() {
  // .update(...).in(...) returns { error, count }
  const updateChain = {
    in: vi.fn((_col: string, ids: string[]) => {
      capturedUpdateIds = ids;
      return Promise.resolve({ error: updateError, count: updateCount });
    }),
  };

  // .select(...).lt(...).neq(...) returns { data, error }
  const selectChain = {
    lt: vi.fn(() => selectChain),
    neq: vi.fn(() =>
      Promise.resolve({ data: selectRows, error: selectError })
    ),
  };

  return {
    select: vi.fn(() => selectChain),
    update: vi.fn((payload: Record<string, unknown>) => {
      capturedUpdatePayload = payload;
      return updateChain;
    }),
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => makeFromStub()),
  })),
}));

describe("L2: /api/cron/trial-expiry", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    selectRows = [];
    selectError = null;
    updateError = null;
    updateCount = null;
    capturedUpdatePayload = null;
    capturedUpdateIds = null;
    process.env.CRON_SECRET = "test-secret";  // pragma: allowlist secret
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";  // pragma: allowlist secret
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function invoke(headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/cron/trial-expiry/route");
    const req = new Request("https://test.local/api/cron/trial-expiry", {
      method: "POST",
      headers,
    });
    const res = await POST(req);
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body };
  }

  it("returns 401 without authorization header", async () => {
    const { status, body } = await invoke();
    expect(status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong bearer token", async () => {
    const { status } = await invoke({ authorization: "Bearer wrong" });
    expect(status).toBe(401);
  });

  it("returns 503 when Supabase env is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(503);
    expect(body.error).toBe("Supabase not configured");
  });

  it("returns downgraded:0 when no expired trials found", async () => {
    selectRows = [];
    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(200);
    expect(body.downgraded).toBe(0);
  });

  it("downgrades expired-trial users without active subscription", async () => {
    selectRows = [
      {
        id: "u1",
        email: "u1@test.local",
        plan: "business",
        trial_ends_at: "2026-01-01T00:00:00Z",
        subscription_status: null,
      },
      {
        id: "u2",
        email: "u2@test.local",
        plan: "pro",
        trial_ends_at: "2026-01-01T00:00:00Z",
        subscription_status: "canceled",
      },
    ];
    updateCount = 2;

    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(200);
    expect(body.downgraded).toBe(2);
    expect(body.skipped_paid).toBe(0);
    expect(capturedUpdatePayload).toEqual({
      plan: "free",
      trial_ends_at: null,
    });
    expect(capturedUpdateIds).toEqual(["u1", "u2"]);
  });

  it("skips users with active paid subscription", async () => {
    selectRows = [
      {
        id: "paying",
        email: "paid@test.local",
        plan: "business",
        trial_ends_at: "2026-01-01T00:00:00Z",
        subscription_status: "active",
      },
    ];

    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(200);
    expect(body.downgraded).toBe(0);
    expect(body.skipped_paid).toBe(1);
    // update should not have been called for any id
    expect(capturedUpdateIds).toBeNull();
  });

  it("also skips subscription_status='trialing' (paid trial via Stripe)", async () => {
    selectRows = [
      {
        id: "stripe-trial",
        email: "strial@test.local",
        plan: "business",
        trial_ends_at: "2026-01-01T00:00:00Z",
        subscription_status: "trialing",
      },
    ];

    const { body } = await invoke({ authorization: "Bearer test-secret" });
    expect(body.downgraded).toBe(0);
    expect(body.skipped_paid).toBe(1);
  });

  it("returns 500 on query error", async () => {
    selectError = { message: "db down" };
    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(500);
    expect(body.error).toBe("Query failed");
  });

  it("returns 500 on update error", async () => {
    selectRows = [
      {
        id: "u1",
        email: "u1@test.local",
        plan: "business",
        trial_ends_at: "2026-01-01T00:00:00Z",
        subscription_status: null,
      },
    ];
    updateError = { message: "constraint violation" };

    const { status, body } = await invoke({
      authorization: "Bearer test-secret",
    });
    expect(status).toBe(500);
    expect(body.error).toBe("Update failed");
  });
});
