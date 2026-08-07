import type { LoginContent } from "./schemas.js";

// Minimal CSV parser for login import (build plan §5 "CSV/1Password/
// Bitwarden import"). Deliberately hand-rolled rather than pulling in a CSV
// library — Phase 1 only needs to handle the common flat export shape
// (title/name, username, password, url columns, optionally quoted fields
// with escaped quotes and embedded commas/newlines), not arbitrary RFC 4180
// edge cases like inconsistent column counts across malformed files.

/** Column names this parser recognizes, mapped from the header row
 * (case-insensitive). Covers Chrome/Bitwarden/1Password/generic exports —
 * broader per-vendor mapping tables are a fast-follow (build plan §4). */
const COLUMN_ALIASES: Record<string, keyof ParsedRow> = {
  name: "title",
  title: "title",
  username: "username",
  login_username: "username",
  password: "password",
  login_password: "password",
  url: "url",
  login_uri: "url",
  uri: "url",
  website: "url",
  notes: "notes",
};

interface ParsedRow {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
}

export interface CsvImportResult {
  items: LoginContent[];
  skipped: number;
  totalRows: number;
}

/** Parses a single CSV record stream into rows, handling quoted fields
 * (RFC 4180 double-quote escaping: `""` inside a quoted field is a literal
 * `"`) and commas/newlines embedded within quotes. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.length > 0)) rows.push(row);
  }

  return rows;
}

/** Parses CSV text into login items ready for `encryptNewItem`. Rows missing
 * both a title and a password are skipped (not meaningfully importable). */
export function parseCsvLogins(text: string): CsvImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { items: [], skipped: 0, totalRows: 0 };

  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const columnMap: Array<keyof ParsedRow | null> = header.map((h) => COLUMN_ALIASES[h] ?? null);

  const items: LoginContent[] = [];
  let skipped = 0;

  for (const rawRow of rows.slice(1)) {
    const parsed: ParsedRow = {};
    columnMap.forEach((key, i) => {
      if (key && rawRow[i] !== undefined) parsed[key] = rawRow[i];
    });

    const title = parsed.title?.trim() || parsed.url?.trim();
    if (!title || !parsed.password) {
      skipped++;
      continue;
    }

    items.push({
      kind: "login",
      title,
      username: parsed.username?.trim() || undefined,
      password: parsed.password,
      urls: parsed.url ? [parsed.url.trim()] : [],
      notes: parsed.notes?.trim() || undefined,
    });
  }

  return { items, skipped, totalRows: rows.length - 1 };
}
