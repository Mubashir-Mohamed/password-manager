import { getSodium } from "./sodium.js";

// Crockford-style alphabet with ambiguous characters (0/O, 1/I/L) removed, so a
// user copying the Secret Key by hand from a screen or printout is unlikely to
// mistranscribe it. 32 symbols = 5 bits/char.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

const SYMBOL_COUNT = 26; // 26 * log2(31) ≈ 128.7 bits of entropy

/** Generates a random 128-bit-class Secret Key, formatted 1Password-style
 * (`A3-XXXXXX-XXXXXX-XXXXXX-XXXXXX`) for readability. This value is shown to
 * the user exactly once at signup and is never transmitted to or derivable by
 * Supabase — see build plan §2 point 5 and §4 "Emergency Kit". Uses
 * `randombytes_uniform` (rejection-sampled, unbiased) rather than `byte %
 * alphabet.length`, since 256 isn't evenly divisible by the 31-symbol alphabet. */
export async function generateSecretKey(): Promise<string> {
  const sodium = await getSodium();
  let symbols = "";
  for (let i = 0; i < SYMBOL_COUNT; i++) {
    const index = sodium.randombytes_uniform(ALPHABET.length);
    symbols += ALPHABET[index];
  }
  const groups = [symbols.slice(0, 2), ...chunk(symbols.slice(2), 6)];
  return groups.join("-");
}

function chunk(str: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}

/** Strips formatting so a pasted/typed Secret Key can be fed into `deriveKeys`
 * regardless of dashes, spacing, or case. */
export function normalizeSecretKey(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
