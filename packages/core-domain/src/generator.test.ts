import { describe, expect, it } from "vitest";
import {
  estimatePasswordEntropyBits,
  generatePassphrase,
  generatePassword,
} from "./generator.js";

describe("generatePassword", () => {
  it("produces the requested length", () => {
    expect(generatePassword({ length: 24 })).toHaveLength(24);
  });

  it("includes at least one character from every enabled set", () => {
    const pw = generatePassword({
      length: 40,
      useUpper: true,
      useLower: true,
      useNumbers: true,
      useSymbols: true,
    });
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
  });

  it("respects a disabled character set", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword({ length: 30, useSymbols: false, useUpper: true, useLower: true, useNumbers: true });
      expect(/[^a-zA-Z0-9]/.test(pw)).toBe(false);
    }
  });

  it("excludes ambiguous characters when requested", () => {
    for (let i = 0; i < 30; i++) {
      const pw = generatePassword({ length: 40, avoidAmbiguous: true });
      expect(/[Il1O0]/.test(pw)).toBe(false);
    }
  });

  it("is not deterministic across calls", () => {
    const a = generatePassword({ length: 20 });
    const b = generatePassword({ length: 20 });
    expect(a).not.toEqual(b);
  });

  it("throws if length is too short to fit one of each required set", () => {
    expect(() =>
      generatePassword({ length: 2, useUpper: true, useLower: true, useNumbers: true, useSymbols: true }),
    ).toThrow();
  });
});

describe("estimatePasswordEntropyBits", () => {
  it("scales with length and charset size", () => {
    const short = estimatePasswordEntropyBits("abcd", 26);
    const long = estimatePasswordEntropyBits("abcdefgh", 26);
    expect(long).toBeGreaterThan(short);
  });
});

describe("generatePassphrase", () => {
  it("produces the requested word count", () => {
    const phrase = generatePassphrase({ wordCount: 6, includeNumber: false });
    expect(phrase.split("-")).toHaveLength(6);
  });

  it("capitalizes words when requested", () => {
    const phrase = generatePassphrase({ wordCount: 4, capitalize: true, includeNumber: false });
    for (const word of phrase.split("-")) {
      expect(word[0]).toEqual(word[0]!.toUpperCase());
    }
  });
});
