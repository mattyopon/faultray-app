import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface RedeemBody {
  code: string;
}

export async function POST(request: Request) {
  // API-08: レート制限 — 5 attempts / minute per IP (brute-force protection)
  const limited = await applyRateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  // Auth + CSRF gate (P1-2). Was using bare auth.getUser() so CSRF check was
  // skipped — a malicious cross-origin POST could redeem a victim's coupon.
  const { user, supabase, error: authError } = await requireAuth(request);
  if (authError) return authError;

  let body: Partial<RedeemBody>;
  try {
    body = (await request.json()) as Partial<RedeemBody>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string" || code.trim() === "") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  const normalizedCode = code.trim().toUpperCase();

  // 1. couponsテーブルからコードを検索 (RLS-protected user client)
  const { data: coupon, error: couponError } = await supabase
    .from("coupons")
    .select("id, code, tier, days, max_uses, current_uses, revoked")
    .eq("code", normalizedCode)
    .single();

  if (couponError || !coupon) {
    return NextResponse.json({ error: "Invalid coupon code" }, { status: 404 });
  }

  // 2. バリデーション
  if (coupon.revoked) {
    return NextResponse.json({ error: "This coupon has been revoked" }, { status: 400 });
  }
  if (coupon.max_uses > 0 && coupon.current_uses >= coupon.max_uses) {
    return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 400 });
  }

  // 3. クーポンのcurrent_usesを楽観的ロックでインクリメント（プロファイル更新の前に）
  // WHERE current_uses = coupon.current_uses で競合を検出。
  // プロファイル更新より先に行うことで、競合時にプランが無料アップグレードされるのを防ぐ。
  const { data: updatedCoupons, error: incrementError } = await supabase
    .from("coupons")
    .update({ current_uses: coupon.current_uses + 1 })
    .eq("id", coupon.id)
    .eq("current_uses", coupon.current_uses)
    .select("id");

  if (incrementError) {
    console.error("Failed to increment coupon uses:", incrementError);
    return NextResponse.json({ error: "Failed to record coupon usage" }, { status: 500 });
  }

  if (!updatedCoupons || updatedCoupons.length === 0) {
    return NextResponse.json(
      { error: "Coupon usage conflict. Please try again." },
      { status: 409 }
    );
  }

  // 4. profilesテーブルを更新（クーポン消費が確定した後）
  // P1-1: profiles.plan / trial_ends_at は migration 013 で user role の UPDATE
  // 権限が剥奪されている (billing bypass 防止)。サービスロール経由で更新する。
  const expiresAt = new Date(
    Date.now() + coupon.days * 24 * 60 * 60 * 1000
  ).toISOString();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[coupon/redeem] service role not configured");
    return NextResponse.json(
      { error: "Server configuration error. Please contact support." },
      { status: 503 }
    );
  }
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const admin = createAdminClient(supabaseUrl, serviceRoleKey);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ plan: coupon.tier, trial_ends_at: expiresAt })
    .eq("id", user.id);

  if (profileError) {
    console.error("[coupon/redeem] profile update failed:", profileError.message);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    tier: coupon.tier,
    expires_at: expiresAt,
  });
}
