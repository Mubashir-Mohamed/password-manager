// Client-side password health scoring (build plan §4 "Password health:
// reused/weak detection"). Deliberately NOT zxcvbn — that's a large dependency
// (frequency-ranked dictionaries) that's overkill for a Phase 1 scaffold; this
// is a compact heuristic scorer good enough to flag genuinely weak passwords.
// Swapping in zxcvbn (or zxcvbn-ts, which has no native deps) later is a
// drop-in replacement for `scorePasswordStrength`'s body only.

export type StrengthLabel = "very-weak" | "weak" | "fair" | "strong" | "very-strong";

export interface StrengthResult {
  /** 0–4, mirrors zxcvbn's scale so a future swap doesn't ripple through the UI. */
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
  /** Rough bits-of-entropy estimate, for the strength-meter's numeric readout. */
  entropyBits: number;
  reasons: string[];
}

const COMMON_PASSWORDS = new Set([
  "password", "123456", "123456789", "qwerty", "abc123", "letmein",
  "welcome", "monkey", "dragon", "111111", "iloveyou", "admin",
  "password1", "1234567890", "sunshine", "princess", "football",
]);

const LABELS: StrengthLabel[] = ["very-weak", "weak", "fair", "strong", "very-strong"];

export function scorePasswordStrength(password: string): StrengthResult {
  const reasons: string[] = [];

  if (password.length === 0) {
    return { score: 0, label: "very-weak", entropyBits: 0, reasons: ["Empty"] };
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    reasons.push("This is one of the most commonly leaked passwords");
    return { score: 0, label: "very-weak", entropyBits: 0, reasons };
  }

  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 33;
  charsetSize = Math.max(charsetSize, 1);

  let entropyBits = password.length * Math.log2(charsetSize);

  // Penalize obvious low-entropy patterns that a naive charset-size formula
  // would otherwise over-credit.
  if (/^(.)\1+$/.test(password)) {
    reasons.push("Repeated single character");
    entropyBits = Math.min(entropyBits, 8);
  }
  if (isSequential(lower)) {
    reasons.push("Sequential characters (e.g. abcd, 1234)");
    entropyBits *= 0.4;
  }
  const repeatRatio = 1 - new Set(lower).size / lower.length;
  if (repeatRatio > 0.5) {
    reasons.push("Low character variety");
    entropyBits *= 0.7;
  }
  if (password.length < 8) {
    reasons.push("Shorter than 8 characters");
    entropyBits = Math.min(entropyBits, 20);
  }

  entropyBits = Math.round(entropyBits * 10) / 10;

  let score: StrengthResult["score"];
  if (entropyBits < 28) score = 0;
  else if (entropyBits < 36) score = 1;
  else if (entropyBits < 60) score = 2;
  else if (entropyBits < 80) score = 3;
  else score = 4;

  if (reasons.length === 0 && score >= 3) reasons.push("Good length and character variety");

  return { score, label: LABELS[score]!, entropyBits, reasons };
}

function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  let ascRun = 1;
  let descRun = 1;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    ascRun = diff === 1 ? ascRun + 1 : 1;
    descRun = diff === -1 ? descRun + 1 : 1;
    if (ascRun >= 4 || descRun >= 4) return true;
  }
  return false;
}

export interface HealthCheckItem {
  itemId: string;
  title: string;
  password: string;
}

export interface ReusedPasswordGroup {
  items: Array<{ itemId: string; title: string }>;
}

/** Groups items that share the exact same password — the "reused passwords"
 * card in the Security Dashboard (mobile design plan §4.7 / desktop §4.4). */
export function findReusedPasswords(items: HealthCheckItem[]): ReusedPasswordGroup[] {
  const byPassword = new Map<string, HealthCheckItem[]>();
  for (const item of items) {
    if (!item.password) continue;
    const group = byPassword.get(item.password) ?? [];
    group.push(item);
    byPassword.set(item.password, group);
  }
  return [...byPassword.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ items: group.map(({ itemId, title }) => ({ itemId, title })) }));
}

export function findWeakPasswords(
  items: HealthCheckItem[],
  maxScore: StrengthResult["score"] = 1,
): Array<{ itemId: string; title: string; result: StrengthResult }> {
  return items
    .map((item) => ({ item, result: scorePasswordStrength(item.password) }))
    .filter(({ result }) => result.score <= maxScore)
    .map(({ item, result }) => ({ itemId: item.itemId, title: item.title, result }));
}
