import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Svg, { Circle } from "react-native-svg";
import { currentTotpCode } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import type { DecryptedItem } from "./VaultHomeScreen.js";
import { Toast, type ToastTone } from "../components/Toast.js";

export interface ItemDetailScreenProps {
  existing: DecryptedItem | null;
  busy: boolean;
  onBack: () => void;
  onSave: (content: LoginContent) => Promise<void>;
  onDelete: () => Promise<void>;
}

const emptyLogin: LoginContent = { kind: "login", title: "", username: "", password: "", urls: [], notes: "" };

/** Circular countdown ring + monospace code — mirrors packages/ui's
 * `TOTPCode` (web) so the "peak moment" (mobile design plan §5) reads the
 * same across surfaces: instant, like a boarding-pass QR code. */
function TOTPRing({ code, remainingSeconds, period = 30 }: { code: string; remainingSeconds: number; period?: number }) {
  const fraction = Math.max(0, Math.min(1, remainingSeconds / period));
  const isLow = remainingSeconds <= 5;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;

  return (
    <View className="mb-4 flex-row items-center justify-between rounded-xl border border-white/10 bg-surface px-4 py-3">
      <Text className="font-mono text-2xl tracking-[0.2em] text-white">{code.replace(/(\d{3})(\d{3,4})/, "$1 $2")}</Text>
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={radius} fill="none" stroke="#ffffff1f" strokeWidth={3} />
        <Circle
          cx={18}
          cy={18}
          r={radius}
          fill="none"
          stroke={isLow ? "#F5A524" : "#6C5CE7"}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          rotation={-90}
          origin="18, 18"
        />
      </Svg>
    </View>
  );
}

/** Add/edit a login item — mirrors apps/web's ItemDetailScreen (build plan §7
 * step 6 "Mobile core"). MVP scope covers the `login` item type end-to-end,
 * matching web; note/card/identity share the same encryptNewItem/
 * encryptUpdatedItem path and just need their own form fields later. */
export function ItemDetailScreen({ existing, busy, onBack, onSave, onDelete }: ItemDetailScreenProps) {
  const [form, setForm] = useState<LoginContent>(
    existing && existing.content.kind === "login" ? existing.content : emptyLogin,
  );
  const [now, setNow] = useState(Date.now());
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!form.totp) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [form.totp]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  function showToast(message: string, tone: ToastTone = "default") {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  async function copy(label: string, text: string) {
    await Clipboard.setStringAsync(text);
    setTimeout(() => Clipboard.setStringAsync("").catch(() => {}), 30_000);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast(`${label} copied — clears in 30s`, "success");
  }

  function confirmDelete() {
    Alert.alert("Delete this item?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void onDelete() },
    ]);
  }

  const totp = form.totp ? currentTotpCode(form.totp.secret, form.totp, now) : null;
  const canSave = Boolean(form.title && form.password) && !busy;

  return (
    <View className="flex-1 bg-base px-5 pt-14">
      <Pressable onPress={onBack} className="mb-4 self-start">
        <Text className="text-sm text-white/60">← Back</Text>
      </Pressable>
      <Text className="mb-5 text-lg font-semibold text-white">{existing ? form.title || "Edit item" : "Add login"}</Text>

      <Text className="mb-1 text-xs text-white/50">Name</Text>
      <TextInput
        placeholder="e.g. GitHub"
        placeholderTextColor="#ffffff59"
        value={form.title}
        onChangeText={(title) => setForm({ ...form, title })}
        className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
      />

      <Text className="mb-1 text-xs text-white/50">Username</Text>
      <TextInput
        placeholder="Username or email"
        placeholderTextColor="#ffffff59"
        autoCapitalize="none"
        value={form.username ?? ""}
        onChangeText={(username) => setForm({ ...form, username })}
        className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
      />

      {/* Masked by default, monospace once revealed — mobile design plan
          §4.4. A tappable "Show/Hide" label rather than a corner icon; the
          whole-field-is-the-toggle pattern from packages/ui's read-only
          PasswordField doesn't apply here since this field must stay
          typeable (add/edit form, not a view-only screen). */}
      <Text className="mb-1 text-xs text-white/50">Password</Text>
      <View className="mb-4 flex-row items-center gap-2">
        <TextInput
          placeholder="Password"
          placeholderTextColor="#ffffff59"
          autoCapitalize="none"
          secureTextEntry={!revealed}
          value={form.password}
          onChangeText={(password) => setForm({ ...form, password })}
          className={`flex-1 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white ${revealed ? "font-mono" : ""}`}
        />
        <Pressable
          onPress={() => setRevealed((r) => !r)}
          accessibilityLabel={revealed ? "Password, visible. Tap to hide." : "Password, hidden. Tap to reveal."}
          className="items-center justify-center rounded-xl border border-white/10 bg-surface px-4 py-3"
        >
          <Text className="text-xs font-semibold text-white/70">{revealed ? "Hide" : "Show"}</Text>
        </Pressable>
        <Pressable
          onPress={() => form.password && copy("Password", form.password)}
          className="items-center justify-center rounded-xl border border-white/10 bg-surface px-4 py-3"
        >
          <Text className="text-sm text-white/85">Copy</Text>
        </Pressable>
      </View>

      <Text className="mb-1 text-xs text-white/50">Website</Text>
      <TextInput
        placeholder="https://example.com"
        placeholderTextColor="#ffffff59"
        autoCapitalize="none"
        keyboardType="url"
        value={form.urls[0] ?? ""}
        onChangeText={(url) => setForm({ ...form, urls: url ? [url] : [] })}
        className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
      />

      <Text className="mb-1 text-xs text-white/50">Notes</Text>
      <TextInput
        placeholder="Optional"
        placeholderTextColor="#ffffff59"
        multiline
        value={form.notes ?? ""}
        onChangeText={(notes) => setForm({ ...form, notes })}
        className="mb-4 min-h-[80px] rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
        textAlignVertical="top"
      />

      {totp && (
        <Pressable onPress={() => copy("Code", totp.code)}>
          <TOTPRing code={totp.code} remainingSeconds={totp.remainingSeconds} period={form.totp?.period} />
        </Pressable>
      )}

      <View className="mt-2 flex-row gap-3">
        <Pressable
          onPress={() => void onSave(form)}
          disabled={!canSave}
          className="flex-1 items-center rounded-xl bg-accent px-6 py-3 disabled:opacity-40"
        >
          <Text className="font-semibold text-white">{busy ? "Saving…" : "Save"}</Text>
        </Pressable>
        {existing && (
          <Pressable onPress={confirmDelete} className="items-center rounded-xl border border-danger/40 px-6 py-3">
            <Text className="font-semibold text-danger">Delete</Text>
          </Pressable>
        )}
      </View>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </View>
  );
}
