import { HOTP, Secret, TOTP } from "otpauth";

/** Thin wrapper around `otpauth` (build plan §2 "TOTP: … via the `otpauth`
 * package") so the rest of the app depends on this module, not the third-party
 * API shape directly — keeps a future algorithm/library swap contained. */

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export interface TotpCodeInfo {
  code: string;
  /** Seconds remaining until this code rotates — drives the countdown ring in
   * the mobile/desktop item-detail UI. */
  remainingSeconds: number;
}

export function currentTotpCode(
  base32Secret: string,
  opts: { digits?: number; period?: number; algorithm?: "SHA1" | "SHA256" | "SHA512" } = {},
  atMs: number = Date.now(),
): TotpCodeInfo {
  const period = opts.period ?? 30;
  const totp = new TOTP({
    secret: Secret.fromBase32(base32Secret),
    digits: opts.digits ?? 6,
    period,
    algorithm: opts.algorithm ?? "SHA1",
  });
  const code = totp.generate({ timestamp: atMs });
  const elapsed = Math.floor(atMs / 1000) % period;
  return { code, remainingSeconds: period - elapsed };
}

/** Exposed for the RFC 6238 known-answer tests — HOTP is the primitive TOTP is
 * built on (TOTP = HOTP with a time-derived counter). */
export function hotpCode(
  base32Secret: string,
  counter: number,
  opts: { digits?: number; algorithm?: "SHA1" | "SHA256" | "SHA512" } = {},
): string {
  const hotp = new HOTP({
    secret: Secret.fromBase32(base32Secret),
    digits: opts.digits ?? 6,
    algorithm: opts.algorithm ?? "SHA1",
  });
  return hotp.generate({ counter });
}

export function otpauthUri(label: string, issuer: string, base32Secret: string): string {
  const totp = new TOTP({
    label,
    issuer,
    secret: Secret.fromBase32(base32Secret),
  });
  return totp.toString();
}
