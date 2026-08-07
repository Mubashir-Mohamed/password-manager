import { describe, expect, it } from "vitest";
import type { VaultItemContent } from "@password-manager/core-domain";
import { exportVaultEncrypted, importVaultEncrypted } from "./vaultExport.js";

const items: VaultItemContent[] = [
  { kind: "login", title: "GitHub", username: "alice", password: "correct-horse-battery", urls: ["https://github.com"] },
  { kind: "note", title: "Wifi password", body: "hunter2" },
];

describe("exportVaultEncrypted / importVaultEncrypted — real crypto round trip", () => {
  it("round-trips a vault through an encrypted export file", async () => {
    const file = await exportVaultEncrypted(items, "export-password-42!");
    const parsed = JSON.parse(file);
    expect(parsed.format).toBe("password-manager-encrypted-export");
    // The plaintext titles/passwords must never appear in the exported file.
    expect(file).not.toContain("correct-horse-battery");
    expect(file).not.toContain("GitHub");

    const imported = await importVaultEncrypted(file, "export-password-42!");
    expect(imported).toEqual(items);
  });

  it("rejects the wrong export password", async () => {
    const file = await exportVaultEncrypted(items, "right-password");
    await expect(importVaultEncrypted(file, "wrong-password")).rejects.toThrow("Incorrect export password.");
  });

  it("rejects a file that isn't a recognized export", async () => {
    await expect(importVaultEncrypted(JSON.stringify({ hello: "world" }), "any")).rejects.toThrow(
      "Not a recognized Password Manager export file.",
    );
  });

  it("rejects unparseable input", async () => {
    await expect(importVaultEncrypted("not json at all", "any")).rejects.toThrow("Not a valid export file");
  });
});
