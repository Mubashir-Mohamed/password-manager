import { BrowserWindow, Menu, app, globalShortcut, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import * as secureStorage from "./secureStorage.js";
import { createTray, setTrayLockState } from "./tray.js";
import { createMainWindow, createQuickAccessWindow } from "./windows.js";

let mainWindow: BrowserWindow | null = null;
let quickAccessWindow: BrowserWindow | null = null;

const QUICK_ACCESS_SHORTCUT = process.platform === "darwin" ? "Cmd+Shift+Space" : "Ctrl+Shift+Space";

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow();
  mainWindow.show();
  mainWindow.focus();
}

function toggleQuickAccess() {
  if (!quickAccessWindow || quickAccessWindow.isDestroyed()) {
    quickAccessWindow = createQuickAccessWindow();
  }
  if (quickAccessWindow.isVisible()) {
    quickAccessWindow.hide();
  } else {
    quickAccessWindow.show();
    quickAccessWindow.focus();
  }
}

function requestLock() {
  mainWindow?.webContents.send("app:lock-requested");
  quickAccessWindow?.webContents.send("app:lock-requested");
  setTrayLockState("locked");
}

function registerIpcHandlers() {
  ipcMain.handle("secure-storage:is-available", () => secureStorage.isAvailable());
  ipcMain.handle("secure-storage:set", (_e, plaintext: string) => secureStorage.setQuickUnlockPayload(plaintext));
  ipcMain.handle("secure-storage:get", () => secureStorage.getQuickUnlockPayload());
  ipcMain.handle("secure-storage:clear", () => secureStorage.clearQuickUnlockPayload());

  ipcMain.on("app:locked", () => setTrayLockState("locked"));
  ipcMain.on("app:unlocked", () => setTrayLockState("unlocked"));

  // The overlay renderer can't call BrowserWindow methods directly
  // (contextIsolation) — it asks the main process to hide it (Escape,
  // losing focus after an action) or grow/shrink to fit its current
  // content (search bar alone vs. search + result rows).
  ipcMain.on("quick-access:hide", () => {
    quickAccessWindow?.hide();
  });
  ipcMain.on("quick-access:resize", (_e, height: number) => {
    if (!quickAccessWindow || quickAccessWindow.isDestroyed()) return;
    const width = quickAccessWindow.getSize()[0] ?? 560;
    quickAccessWindow.setSize(width, Math.max(72, Math.round(height)));
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) return; // avoid noisy dev-mode update checks
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("updater:status", "ready-to-restart");
  });
  autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("[updater]", err));
}

function buildAppMenu() {
  // Minimal app menu — mainly so Cmd+C/Cmd+V etc. work at all on macOS,
  // where a missing application menu breaks standard Edit shortcuts.
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [{ label: app.getName(), submenu: [{ role: "about" as const }, { type: "separator" as const }, { role: "quit" as const }] }]
      : []),
    { label: "Edit", submenu: [{ role: "undo" as const }, { role: "redo" as const }, { type: "separator" as const }, { role: "cut" as const }, { role: "copy" as const }, { role: "paste" as const }, { role: "selectAll" as const }] },
    { label: "View", submenu: [{ role: "reload" as const }, { role: "toggleDevTools" as const }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildAppMenu();
  registerIpcHandlers();
  mainWindow = createMainWindow();

  createTray({
    onShowMainWindow: showMainWindow,
    onOpenQuickAccess: toggleQuickAccess,
    onLockNow: requestLock,
    onQuit: () => app.quit(),
  });

  const registered = globalShortcut.register(QUICK_ACCESS_SHORTCUT, toggleQuickAccess);
  if (!registered) {
    console.error(`[shortcuts] Failed to register ${QUICK_ACCESS_SHORTCUT} — likely already claimed by another app.`);
  }

  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {
  // Stay running in the tray (desktop design plan §1 "ambient, not modal")
  // rather than quitting — matches the "still running in the menu bar" toast
  // noted in §5 for the first close.
  if (process.platform !== "darwin") {
    // On Windows/Linux we still keep the tray-resident process alive; only an
    // explicit Quit from the tray menu calls app.quit().
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
