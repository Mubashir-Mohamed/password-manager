import { BrowserWindow, app, screen } from "electron";
import path from "node:path";

const DEV_SERVER_URL = "http://localhost:5173";
const WEB_DIST_INDEX = path.join(__dirname, "..", "..", "web", "dist", "index.html");

function rendererURL(query?: string): string {
  const base = app.isPackaged ? `file://${WEB_DIST_INDEX}` : DEV_SERVER_URL;
  return query ? `${base}?${query}` : base;
}

const PRELOAD_PATH = path.join(__dirname, "preload.js");

/** Main window — three-pane vault browser (desktop design plan §4.1). Native
 * title-bar treatment differs by platform (§3): hidden-inset traffic lights
 * on macOS with a custom toolbar underneath, frameless custom chrome on
 * Windows. Loads the SAME `apps/web` build as the browser/desktop surface —
 * per the build plan, desktop is a thin wrapper, not a parallel React app. */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0E0F13", // matches bg/base dark token — avoids a white flash on load
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    frame: process.platform === "darwin",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(rendererURL());
  return win;
}

/** The signature Quick Access overlay (desktop design plan §0/§4.2): a
 * separate frameless, always-on-top, transparent-background window — NOT a
 * modal inside the main window — which is what lets it float over other
 * applications when summoned by the global shortcut.
 *
 * `apps/web`'s `main.tsx` branches on the `?quickAccess=1` query param this
 * window passes and renders `QuickAccessApp` instead of the full app shell —
 * a genuinely separate renderer process/JS heap from the main window, which
 * bootstraps its own session/unlock state (shared Supabase session +
 * OS-level quick-unlock cache, not a live IPC relay of the main window's
 * in-memory VMK). See QuickAccessApp.tsx's header comment for the full
 * story. Unverified against an actual OS window — no display in the
 * sandbox this shipped from. */
export function createQuickAccessWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const width = 560;
  const height = 72;

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + display.workArea.height * 0.25),
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(rendererURL("quickAccess=1"));
  win.on("blur", () => win.hide());
  return win;
}
