import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { QuickAccessApp } from "./QuickAccessApp.js";
import "./index.css";

// apps/desktop's Quick Access overlay (desktop design plan §4.2) loads this
// same build in a separate BrowserWindow with `?quickAccess=1` — see
// apps/desktop/electron/windows.ts. Everything else (plain browser tab, the
// Electron main window, the browser-extension popup if it ever reuses this
// bundle) gets the normal app shell.
const isQuickAccess = new URLSearchParams(window.location.search).has("quickAccess");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isQuickAccess ? <QuickAccessApp /> : <App />}</StrictMode>,
);
