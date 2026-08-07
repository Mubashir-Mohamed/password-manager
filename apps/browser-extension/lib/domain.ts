/** Normalizes a URL to a bare registrable-ish domain for matching against
 * saved login URLs. Deliberately simple (no public-suffix-list) for Phase 1
 * — good enough for "does this saved item belong on this site," not
 * cryptographically precise domain-matching. */
export function normalizeDomain(input: string): string {
  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input.toLowerCase();
  }
}
