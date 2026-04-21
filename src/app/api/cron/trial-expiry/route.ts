import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/trial-expiry
 *
 * Daily cron (see vercel.json crons).
 *
 * Finds users whose trial has expired (trial_ends_at < now()) and are not on
 * an active paid subscription, and downgrades them to plan='free'. This closes
 * the revenue-leak gap where trial users retained Business/Pro features
 * indefinitely after trial end because no Stripe webhook would fire unless
 * they explicitly subscribed.
 *
 * Downgrade criteria (all must hold):
 *   - plan != 'free'
 *   - trial_ends_at IS NOT NULL
 *   - trial_ends_at < now()
 *   - subscription_status NOT IN ('active', 'trialing') (or NULL)
 *
 * Update payload:
 *   - plan = 'free'
 *   - trial_ends_at = NULL (trial is consumed; no reprovisioning)
 *
 * Protected by CRON_SECRET (Bearer) to prevent unauthorized invocation.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceRoleKey);
  const nowIso = new Date().toISOString();

  // 1) 候補抽出: 期限切れ + 非有料
  const { data: candidates, error: queryError } = await supabase
    .from("profiles")
    .select("id, email, plan, trial_ends_at, subscription_status")
    .lt("trial_ends_at", nowIso)
    .neq("plan", "free");

  if (queryError) {
    console.error("[cron/trial-expiry] Query error:", queryError.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ downgraded: 0, message: "No expired trials" });
  }

  // 有料契約中 (subscription_status IN ('active','trialing')) は除外
  const toDowngrade = candidates.filter((p) => {
    const s = (p.subscription_status as string | null) ?? null;
    return s !== "active" && s !== "trialing";
  });

  if (toDowngrade.length === 0) {
    return NextResponse.json({
      downgraded: 0,
      skipped_paid: candidates.length,
      message: "All expired-trial users have active paid subscriptions",
    });
  }

  const ids = toDowngrade.map((p) => p.id as string);

  const { error: updateError, count } = await supabase
    .from("profiles")
    .update({ plan: "free", trial_ends_at: null }, { count: "exact" })
    .in("id", ids);

  if (updateError) {
    console.error("[cron/trial-expiry] Update error:", updateError.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  console.info(
    `[cron/trial-expiry] Downgraded ${count ?? ids.length} users (skipped ${
      candidates.length - toDowngrade.length
    } paid)`
  );

  return NextResponse.json({
    downgraded: count ?? ids.length,
    skipped_paid: candidates.length - toDowngrade.length,
  });
}
