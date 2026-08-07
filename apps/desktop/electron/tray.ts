// Menu-bar/tray presence with a 3-state glyph (locked/unlocked/syncing) —
// desktop design plan §2/§4.6. Real icon assets (per-state, light/dark menu
// bar variants) are a design deliverable, not something to compute at
// runtime (design plan §8) — this falls back to a text-only tray title
// (macOS) when no icon file is present under build/icons/, so the app still
// runs correctly before those assets exist.
import { Menu, Tray, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";

export type LockGlyphState = "locked" | "unlocked" | "syncing";

const GLYPH_FALLBACK: Record<LockGlyphState, string> = {
  locked: "🔒",
  unlocked: "🔓",
  syncing: "🔄",
};

let tray: Tray | null = null;

function iconFor(state: LockGlyphState): Electron.NativeImage {
  const iconPath = path.join(__dirname, "..", "build", "icons", `tray-${state}.png`);
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    image.setTemplateImage(true); // adapts to light/dark menu bar on macOS
    return image;
  }
  return nativeImage.createEmpty();
}

export function createTray(opts: {
  onLockNow: () => void;
  onOpenQuickAccess: () => void;
  onShowMainWindow: () => void;
  onQuit: () => void;
}): Tray {
  tray = new Tray(iconFor("locked"));
  if (iconFor("locked").isEmpty()) tray.setTitle(GLYPH_FALLBACK.locked);
  tray.setToolTip("Password Manager");

  const menu = Menu.buildFromTemplate([
    { label: "Open", click: opts.onShowMainWindow },
    { label: "Quick Access\tGlobal shortcut", click: opts.onOpenQuickAccess },
    { type: "separator" },
    { label: "Lock now", click: opts.onLockNow },
    { type: "separator" },
    { label: "Quit", click: opts.onQuit },
  ]);
  tray.setContextMenu(menu);

  return tray;
}

export function setTrayLockState(state: LockGlyphState): void {
  if (!tray) return;
  const icon = iconFor(state);
  tray.setImage(icon);
  if (icon.isEmpty()) tray.setTitle(GLYPH_FALLBACK[state]);
}
