import { useRef, useState } from "react";
import { Button, Card, TextField } from "@password-manager/ui";
import { parseCsvLogins, type VaultItemContent } from "@password-manager/core-domain";
import { createVaultItem } from "@password-manager/api-client";
import { encryptNewItem } from "../lib/vaultCrypto.js";
import { downloadExportFile, exportVaultEncrypted, importVaultEncrypted } from "../lib/vaultExport.js";
import { supabase } from "../lib/supabase.js";
import { useAppStore } from "../state/store.js";

export function ImportExportScreen() {
  const vaultId = useAppStore((s) => s.vaultId);
  const vmk = useAppStore((s) => s.vmk);
  const items = useAppStore((s) => s.items);
  const upsertItem = useAppStore((s) => s.upsertItem);
  const setScreen = useAppStore((s) => s.setScreen);
  const showToast = useAppStore((s) => s.showToast);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [exportPassword, setExportPassword] = useState("");
  const [exporting, setExporting] = useState(false);

  const [importPassword, setImportPassword] = useState("");
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvSummary, setCsvSummary] = useState<string | null>(null);

  async function bulkCreateItems(contents: VaultItemContent[]) {
    if (!vaultId || !vmk) return;
    for (const content of contents) {
      const { id, wrappedItemKey, encryptedContent } = await encryptNewItem(content, vmk);
      const row = await createVaultItem(supabase, {
        id,
        vault_id: vaultId,
        type: content.kind,
        wrapped_item_key: wrappedItemKey,
        content: encryptedContent,
      });
      upsertItem({ row, content });
    }
  }

  async function handleCsvFile(file: File) {
    setCsvBusy(true);
    setCsvSummary(null);
    try {
      const text = await file.text();
      const result = parseCsvLogins(text);
      await bulkCreateItems(result.items);
      setCsvSummary(
        `Imported ${result.items.length} item${result.items.length === 1 ? "" : "s"}` +
          (result.skipped > 0 ? ` (${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped — missing title/password)` : ""),
      );
      showToast({ message: "Import complete", tone: "success" });
    } catch (err) {
      setCsvSummary(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  async function handleExport() {
    if (!exportPassword) return;
    setExporting(true);
    try {
      const contents = items.map((i) => i.content);
      const json = await exportVaultEncrypted(contents, exportPassword);
      downloadExportFile(json);
      showToast({ message: `Exported ${contents.length} items`, tone: "success" });
      setExportPassword("");
    } finally {
      setExporting(false);
    }
  }

  async function handleImportEncrypted() {
    if (!pendingImportFile || !importPassword) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await pendingImportFile.text();
      const contents = await importVaultEncrypted(text, importPassword);
      await bulkCreateItems(contents);
      showToast({ message: `Imported ${contents.length} items`, tone: "success" });
      setPendingImportFile(null);
      setImportPassword("");
      if (importFileInputRef.current) importFileInputRef.current.value = "";
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-5 py-6">
      <button className="self-start text-sm text-white/60 hover:text-white/85" onClick={() => setScreen("settings")}>
        ← Back
      </button>
      <h1 className="text-lg font-semibold text-white/95">Import & Export</h1>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white/85">Import from CSV</h2>
        <p className="text-xs text-white/60">
          Works with exports from Chrome, Bitwarden, and most password managers — columns like title/name, username,
          password, and url are detected automatically.
        </p>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
          disabled={csvBusy || !vaultId}
          className="text-sm text-white/85 file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {csvBusy && <p className="text-xs text-white/60">Importing…</p>}
        {csvSummary && <p className="text-xs text-white/85">{csvSummary}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white/85">Export encrypted vault</h2>
        <p className="text-xs text-white/60">
          Choose a password for this export file — a different one than your master password. Anyone with the file
          still needs this password to read it.
        </p>
        <TextField
          label="Export password"
          type="password"
          value={exportPassword}
          onChange={(e) => setExportPassword(e.target.value)}
        />
        <Button onClick={handleExport} disabled={exporting || !exportPassword || items.length === 0}>
          {exporting ? "Encrypting…" : `Export ${items.length} items`}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-white/85">Import encrypted export</h2>
        <input
          ref={importFileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => setPendingImportFile(e.target.files?.[0] ?? null)}
          className="text-sm text-white/85 file:mr-3 file:rounded-sm file:border-0 file:bg-accent/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-accent"
        />
        {pendingImportFile && (
          <>
            <TextField
              label="Export password"
              type="password"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              error={importError ?? undefined}
            />
            <Button variant="secondary" onClick={handleImportEncrypted} disabled={importing || !importPassword}>
              {importing ? "Decrypting…" : "Import"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
