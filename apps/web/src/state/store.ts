import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@password-manager/api-client";
import type { VaultItemContent } from "@password-manager/core-domain";
import type { Keypair } from "@password-manager/core-crypto";

export type Screen =
  | "welcome"
  | "signup-credentials"
  | "signup-secretkey"
  | "unlock"
  | "vault"
  | "item"
  | "generator"
  | "security"
  | "import-export"
  | "shared"
  | "settings";

export interface DecryptedItem {
  row: Database["public"]["Tables"]["vault_items"]["Row"];
  content: VaultItemContent;
}

export interface ToastState {
  message: string;
  tone: "default" | "success" | "warning" | "danger";
}

interface AppState {
  screen: Screen;
  session: Session | null;
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null;

  // In-memory only — NEVER persisted to localStorage/IndexedDB. Cleared on
  // lock, tab close, or auto-lock timeout. See build plan §2.
  vmk: Uint8Array | null;
  keypair: Keypair | null;

  vaultId: string | null;
  items: DecryptedItem[];
  activeItemId: string | null;

  pendingSecretKey: string | null; // transient — only alive during the signup reveal step
  toast: ToastState | null;

  setScreen: (screen: Screen) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: AppState["profile"]) => void;
  setUnlocked: (vmk: Uint8Array, keypair: Keypair) => void;
  setVaultId: (id: string) => void;
  setItems: (items: DecryptedItem[]) => void;
  upsertItem: (item: DecryptedItem) => void;
  removeItem: (itemId: string) => void;
  setActiveItemId: (id: string | null) => void;
  setPendingSecretKey: (key: string | null) => void;
  showToast: (toast: ToastState) => void;
  clearToast: () => void;
  /** Clears everything security-sensitive from memory. Does NOT sign out of
   * Supabase — locking and signing out are different actions (design plan
   * §4.2 / desktop §4.1). */
  lock: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "welcome",
  session: null,
  profile: null,
  vmk: null,
  keypair: null,
  vaultId: null,
  items: [],
  activeItemId: null,
  pendingSecretKey: null,
  toast: null,

  setScreen: (screen) => set({ screen }),
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setUnlocked: (vmk, keypair) => set({ vmk, keypair }),
  setVaultId: (vaultId) => set({ vaultId }),
  setItems: (items) => set({ items }),
  upsertItem: (item) =>
    set((state) => ({
      items: [item, ...state.items.filter((existing) => existing.row.id !== item.row.id)],
    })),
  removeItem: (itemId) =>
    set((state) => ({ items: state.items.filter((existing) => existing.row.id !== itemId) })),
  setActiveItemId: (activeItemId) => set({ activeItemId }),
  setPendingSecretKey: (pendingSecretKey) => set({ pendingSecretKey }),
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: null }),
  lock: () =>
    set({
      vmk: null,
      keypair: null,
      items: [],
      activeItemId: null,
      screen: "unlock",
    }),
}));
