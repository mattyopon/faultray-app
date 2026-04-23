/**
 * Nonce-based CSP scaffolding (#32).
 *
 * Generates a per-request nonce and exposes it via the `x-faultray-nonce`
 * request header for downstream layout/pages. Enables migration away
 * from `unsafe-inline` without breaking the current inline-script
 * surface overnight.
 *
 * Migration plan (progressive, not a single cutover):
 *   1. [done] This middleware generates a nonce per request.
 *   2. [wip]  Root layout + `<Script>` usages consume the nonce.
 *   3. [todo] next.config.ts CSP switches from 'unsafe-inline' to
 *             `'nonce-${nonce}'` once all inline script sites carry
 *             the nonce attribute.
 *
 * Until step 3 ships, the middleware is additive — no behavior change
 * for routes that don't read the nonce. See `docs/csp-nonce-plan.md`.
 */

import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = _generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-faultray-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Echo the nonce to the response so client-side components can
  // discover it via `headers()`.
  response.headers.set("x-faultray-nonce", nonce);
  return response;
}

function _generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
}

// Only run the middleware on page + API routes. Static assets bypass so
// we don't inflate per-asset request overhead.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
