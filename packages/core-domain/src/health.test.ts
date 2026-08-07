import { describe, expect, it } from "vitest";
import { findReusedPasswords, findWeakPasswords, scorePasswordStrength } from "./health.js";

describe("scorePasswordStrength", () => {
  it("scores a common leaked password as very-weak", () => {
    expect(scorePasswordStrength("password").label).toEqual("very-weak");
  });

  it("scores a short simple password as weak", () => {
    const result = scorePasswordStrength("abc123");
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("scores a long random password as strong or very-strong", () => {
    const result = scorePasswordStrength("qX7!vR2#mK9$wZ4@pL6&nB8");
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("penalizes sequential characters", () => {
    const result = scorePasswordStrength("abcdefgh12345678");
    expect(result.reasons.some((r) => /sequential/i.test(r))).toBe(true);
  });

  it("penalizes a repeated single character", () => {
    const result = scorePasswordStrength("aaaaaaaaaaaa");
    expect(result.score).toEqual(0);
  });
});

describe("findReusedPasswords", () => {
  it("groups items that share the same password", () => {
    const groups = findReusedPasswords([
      { itemId: "1", title: "Gmail", password: "shared-pw" },
      { itemId: "2", title: "Netflix", password: "shared-pw" },
      { itemId: "3", title: "Bank", password: "unique-pw" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.itemId).sort()).toEqual(["1", "2"]);
  });

  it("returns nothing when all passwords are unique", () => {
    const groups = findReusedPasswords([
      { itemId: "1", title: "A", password: "one" },
      { itemId: "2", title: "B", password: "two" },
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("findWeakPasswords", () => {
  it("flags items at or below the score threshold", () => {
    const weak = findWeakPasswords([
      { itemId: "1", title: "Weak", password: "password" },
      { itemId: "2", title: "Strong", password: "qX7!vR2#mK9$wZ4@pL6&nB8" },
    ]);
    expect(weak.map((w) => w.itemId)).toEqual(["1"]);
  });
});
