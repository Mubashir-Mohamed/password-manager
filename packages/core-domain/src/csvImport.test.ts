import { describe, expect, it } from "vitest";
import { parseCsvLogins } from "./csvImport.js";

describe("parseCsvLogins", () => {
  it("parses a simple Chrome-style export", () => {
    const csv = `name,url,username,password\nGitHub,https://github.com,alice,hunter2\nGmail,https://mail.google.com,alice@gmail.com,correcthorse`;
    const result = parseCsvLogins(csv);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      kind: "login",
      title: "GitHub",
      username: "alice",
      password: "hunter2",
      urls: ["https://github.com"],
      notes: undefined,
    });
    expect(result.skipped).toBe(0);
  });

  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const csv = `title,username,password,notes\n"Acme, Inc.",bob,"pa""ss,word","line one"`;
    const result = parseCsvLogins(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe("Acme, Inc.");
    expect(result.items[0]!.password).toBe('pa"ss,word');
  });

  it("recognizes Bitwarden-style column names", () => {
    const csv = `login_username,login_password,login_uri,name\nbob,secret,https://example.com,Example`;
    const result = parseCsvLogins(csv);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ username: "bob", password: "secret", urls: ["https://example.com"] });
  });

  it("skips rows with no title/url and no password", () => {
    const csv = `title,username,password\nGood,alice,pw\n,bob,\n,,onlyusername`;
    const result = parseCsvLogins(csv);
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.totalRows).toBe(3);
  });

  it("falls back to the URL as title when no name/title column is present", () => {
    const csv = `url,username,password\nhttps://example.com,alice,pw`;
    const result = parseCsvLogins(csv);
    expect(result.items[0]!.title).toBe("https://example.com");
  });

  it("returns empty for empty input", () => {
    expect(parseCsvLogins("")).toEqual({ items: [], skipped: 0, totalRows: 0 });
  });
});
