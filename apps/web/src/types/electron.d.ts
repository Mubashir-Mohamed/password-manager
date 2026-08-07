// Ambient type for the bridge apps/desktop's preload script exposes (see
// apps/desktop/electron/preload.ts). Undefined when running as a plain web
// app or in the browser extension — always feature-detect:
//   if (window.electronAPI) { ... }
export interface ElectronAPI {
  platform: NodeJS.Platform;
  secureStorage: {
    isAvailable(): Promise<boolean>;
    set(plaintext: string): Promise<void>;
    get(): Promise<string | null>;
    clear(): Promise<void>;
  };
  lock: {
    notifyLocked(): void;
    notifyUnlocked(): void;
    onLockRequested(callback: () => void): () => void;
  };
  updater: {
    onStatus(callback: (status: string) => void): () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
