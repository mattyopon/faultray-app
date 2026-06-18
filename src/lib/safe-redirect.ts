/**
 * SEC: validate a post-auth `redirectTo` as a SAME-ORIGIN internal path.
 *
 * Used by both the login page and the OAuth callback so they agree on what is
 * accepted (previously the callback used a narrow hard-coded allow-list that
 * silently dropped valid deep links like `/people-risk/actions` to
 * `/dashboard`, while the login page accepted them — an inconsistency).
 *
 * The redirect target is always built same-origin (`${origin}${path}`), so any
 * internal path that passes these checks is safe from open-redirect. We reject:
 *   - non-strings / empty
 *   - values with leading/trailing whitespace (must be a clean path)
 *   - protocol-relative (`//host`) and backslash variants (browsers fold `\`→`/`,
 *     enabling `//host`)
 *   - path traversal (`..`)
 *   - anything that doesn't resolve to the same origin
 */
export function isSafeInternalPath(raw: string | null | undefined): boolean {
  if (typeof raw !== "string" || raw.length === 0) return false;
  if (raw !== raw.trim()) return false;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return false;
  if (raw.includes("\\") || raw.includes("..")) return false;
  try {
    const base = "https://faultray.invalid";
    return new URL(raw, base).origin === base;
  } catch {
    return false;
  }
}
