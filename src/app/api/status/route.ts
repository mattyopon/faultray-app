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

  // 未認証 (公開): 既存 contract (overall / services / checked_at) は維持し、
  // services の各要素から per-vendor latency_ms / note を削除して
  // dependency mapping / timing abuse を防ぐ。external dashboard 等の既存
  // 利用者は services 配列の name/status だけが見えれば壊れない。
  // (review-loop 2, P2): 完全に shape を変えると外部 monitor が即時 break するため
  // strip 方式を取る。
  const result = await probeAll();
  return NextResponse.json({
    overall: result.overall,
    services: result.services.map((s) => ({ name: s.name, status: s.status })),
    checked_at: result.checked_at,
  });
}
