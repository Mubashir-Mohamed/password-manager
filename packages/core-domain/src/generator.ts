// Password/passphrase generation. Pure functions — no crypto primitives live
// here (that's core-crypto's job); this module only needs a CSPRNG source,
// which it takes as an injected `randomInt` so the same logic runs identically
// in the browser (crypto.getRandomValues) and Node/Electron/tests.

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";
const AMBIGUOUS = /[Il1O0]/g;

export interface PasswordOptions {
  length: number;
  useUpper: boolean;
  useLower: boolean;
  useNumbers: boolean;
  useSymbols: boolean;
  avoidAmbiguous: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  useUpper: true,
  useLower: true,
  useNumbers: true,
  useSymbols: true,
  avoidAmbiguous: false,
};

/** Uniform random index in [0, max) via rejection sampling against
 * `crypto.getRandomValues` — avoids the modulo-bias that a naive
 * `Math.random() * max | 0` (or `byte % max`) would introduce. Works in both
 * browser/Electron/extension (Web Crypto is global) and Node ≥19 (also
 * exposes `globalThis.crypto.getRandomValues`). */
function randomIndex(max: number): number {
  if (max <= 0) throw new Error("max must be > 0");
  const range = 256 - (256 % max);
  const buf = new Uint8Array(1);
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= range);
  return x % max;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function generatePassword(options: Partial<PasswordOptions> = {}): string {
  const opts = { ...DEFAULT_PASSWORD_OPTIONS, ...options };
  let charset = "";
  const required: string[] = [];

  const pools: Array<[boolean, string]> = [
    [opts.useLower, LOWER],
    [opts.useUpper, UPPER],
    [opts.useNumbers, DIGITS],
    [opts.useSymbols, SYMBOLS],
  ];

  for (const [enabled, pool] of pools) {
    if (!enabled) continue;
    const cleanPool = opts.avoidAmbiguous ? pool.replace(AMBIGUOUS, "") : pool;
    if (cleanPool.length === 0) continue;
    charset += cleanPool;
    required.push(cleanPool[randomIndex(cleanPool.length)]!);
  }

  if (charset.length === 0) {
    throw new Error("At least one character set must be enabled");
  }
  if (opts.length < required.length) {
    throw new Error(`length must be >= ${required.length} to include one of each enabled set`);
  }

  const rest: string[] = [];
  for (let i = required.length; i < opts.length; i++) {
    rest.push(charset[randomIndex(charset.length)]!);
  }

  return shuffle([...required, ...rest]).join("");
}

/** Shannon-entropy-style estimate in bits, for the generator UI's "strength"
 * display (build plan §4 "entropy display"). Assumes a uniformly random
 * charset — accurate for `generatePassword`'s output, which is what this is
 * meant to score. */
export function estimatePasswordEntropyBits(password: string, charsetSize: number): number {
  if (password.length === 0 || charsetSize <= 1) return 0;
  return Math.round(password.length * Math.log2(charsetSize) * 10) / 10;
}

// A compact word list for passphrase generation. NOTE: for production, swap
// this in for the full EFF long wordlist (7,776 words, ~12.9 bits/word) —
// this list is intentionally small for the Phase 1 scaffold and should not
// ship as-is (too few words materially weakens passphrase entropy).
export const PASSPHRASE_WORDLIST = [
  "amber", "anchor", "arcade", "atlas", "aurora", "banjo", "basil", "beacon",
  "birch", "bishop", "blaze", "bramble", "canyon", "cedar", "cinder", "clover",
  "coast", "comet", "copper", "coral", "cosmic", "cove", "crane", "crest",
  "delta", "denim", "dune", "ember", "falcon", "fable", "fern", "flint",
  "forest", "fossil", "garnet", "glacier", "granite", "grove", "harbor",
  "hazel", "hollow", "indigo", "ivory", "jasper", "juniper", "kestrel",
  "lagoon", "lantern", "lark", "lichen", "linen", "lotus", "lumen", "maple",
  "marble", "meadow", "mesa", "mint", "mirage", "moss", "nectar", "nimbus",
  "nomad", "oasis", "obsidian", "onyx", "opal", "orbit", "orchid", "otter",
  "pebble", "peony", "petal", "pine", "plaza", "plume", "quartz", "quill",
  "raven", "reef", "ridge", "river", "robin", "rowan", "sable", "saffron",
  "sage", "sandal", "shale", "shore", "sienna", "silt", "slate", "sparrow",
  "spruce", "storm", "summit", "sundew", "swan", "tandem", "thistle", "tide",
  "timber", "topaz", "trail", "tundra", "umber", "vale", "velvet", "violet",
  "walnut", "warble", "willow", "wren", "yarrow", "zephyr", "zenith",
] as const;

export interface PassphraseOptions {
  wordCount: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  wordCount: 5,
  separator: "-",
  capitalize: true,
  includeNumber: true,
};

export function generatePassphrase(options: Partial<PassphraseOptions> = {}): string {
  const opts = { ...DEFAULT_PASSPHRASE_OPTIONS, ...options };
  const words: string[] = [];
  for (let i = 0; i < opts.wordCount; i++) {
    const word = PASSPHRASE_WORDLIST[randomIndex(PASSPHRASE_WORDLIST.length)]!;
    words.push(opts.capitalize ? word[0]!.toUpperCase() + word.slice(1) : word);
  }
  if (opts.includeNumber) {
    const pos = randomIndex(words.length);
    words[pos] = words[pos] + String(randomIndex(100));
  }
  return words.join(opts.separator);
}

export function estimatePassphraseEntropyBits(wordCount: number): number {
  return Math.round(wordCount * Math.log2(PASSPHRASE_WORDLIST.length) * 10) / 10;
}
