// The ONLY bridge between the sandboxed renderer (apps/web, contextIsolation:
// true, nodeIntegration: false) and Node/Electron APIs. Deliberately narrow —
// build plan §6 "minimal `contextBridge` API (secure storage, menu events,
// updater controls)". Nothing here can read the master password/VMK; that
// stays entirely inside the renderer's JS heap.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  secureStorage: {
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke("secure-storage:is-available"),
    set: (plaintext: string): Promise<void> => ipcRenderer.invoke("secure-storage:set", plaintext),
    get: (): Promise<string | null> => ipcRenderer.invoke("secure-storage:get"),
    clear: (): Promise<void> => ipcRenderer.invoke("secure-storage:clear"),
  },

  lock: {
    /** Renderer calls this after the user clicks "Lock now" so the tray
     * icon/main-window state and the Quick Access overlay's pulse (desktop
     * design plan §0 signature) all update together from one source of truth. */
    notifyLocked: (): void => ipcRenderer.send("app:locked"),
    notifyUnlocked: (): void => ipcRenderer.send("app:unlocked"),
    /** Main process → renderer: user picked "Lock now" from the tray menu. */
    onLockRequested: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on("app:lock-requested", listener);
      return () => ipcRenderer.removeListener("app:lock-requested", listener);
    },
  },

  updater: {
    onStatus: (callback: (status: string) => void): (() => void) => {
      const listener = (_event: unknown, status: string) => callback(status);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    },
  },

  /** Only meaningful from the Quick Access overlay renderer (desktop design
   * plan §4.2) — the main-window renderer never calls these. The overlay
   * can't touch its own BrowserWindow directly (contextIsolation), so hide/
   * resize go through the main process. */
  quickAccess: {
    hide: (): void => ipcRenderer.send("quick-access:hide"),
    resize: (height: number): void => ipcRenderer.send("quick-access:resize", height),
  },
});
