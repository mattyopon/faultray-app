/**
 * GET /api/status — live health for external consumers + /status page (#37).
 * Thin wrapper over lib/health-probes (shared with the /status SSR page).
 *
 * #86 (P3-1): unauthenticated callers receive only the overall status to
 *   avoid leaking per-vendor latency / config presence (used for dependency
 *   mapping and timing abuse). `?detailed=true` requires an authenticated
 *   session to return per-service details. The /status SSR page reads the
 *   detailed shape directly from probeAll() with the SSR cookie context, so
 *   the user-facing dashboard is unaffected.
 */
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { probeAll } from "@/lib/health-probes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsDetailed = url.searchParams.get("detailed") === "true";

  // (review-loop 1, P2): auth check を probe より前に置く。さもないと unauth
  // caller でも全 vendor probe が triggered され、overall response の latency
  // から per-vendor timing を推定できてしまう (本 PR の info-disclosure 対策が
  // 形骸化)。upstream services への load も軽減。
  if (wantsDetailed) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required for detailed status." },
        { status: 401 }
      );
    }
    return NextResponse.json(await probeAll());
  }

  // 未認証 (公開): overall status と timestamp のみ。per-vendor latency / config
  // は隠す。overall を出すために probe は走らせる必要がある。
  const result = await probeAll();
  return NextResponse.json({
    overall: result.overall,
    checked_at: result.checked_at,
  });
}
