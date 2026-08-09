import { useEffect, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { currentTotpCode } from "@password-manager/core-crypto";
import type { LoginContent } from "@password-manager/core-domain";
import type { DecryptedItem } from "./VaultHomeScreen.js";

export interface ItemDetailScreenProps {
  existing: DecryptedItem | null;
  busy: boolean;
  onBack: () => void;
  onSave: (content: LoginContent) => Promise<void>;
  onDelete: () => Promise<void>;
}

const emptyLogin: LoginContent = { kind: "login", title: "", username: "", password: "", urls: [], notes: "" };

/** Add/edit a login item — mirrors apps/web's ItemDetailScreen (build plan §7
 * step 6 "Mobile core"). MVP scope covers the `login` item type end-to-end,
 * matching web; note/card/identity share the same encryptNewItem/
 * encryptUpdatedItem path and just need their own form fields later. */
export function ItemDetailScreen({ existing, busy, onBack, onSave, onDelete }: ItemDetailScreenProps) {
  const [form, setForm] = useState<LoginContent>(
    existing && existing.content.kind === "login" ? existing.content : emptyLogin,
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!form.totp) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [form.totp]);

  async function copy(label: string, text: string) {
    await Clipboard.setStringAsync(text);
    setTimeout(() => Clipboard.setStringAsync("").catch(() => {}), 30_000);
    Alert.alert(`${label} copied`, "Clears from clipboard in 30s.");
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

      <Text className="mb-1 text-xs text-white/50">Password</Text>
      <View className="mb-4 flex-row items-center gap-2">
        <TextInput
          placeholder="Password"
          placeholderTextColor="#ffffff59"
          autoCapitalize="none"
          value={form.password}
          onChangeText={(password) => setForm({ ...form, password })}
          className="flex-1 rounded-xl border border-white/10 bg-surface px-4 py-3 font-mono text-white"
        />
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

      {totp && (
        <Pressable
          onPress={() => copy("Code", totp.code)}
          className="mb-4 flex-row items-center justify-between rounded-xl border border-white/10 bg-surface px-4 py-3"
        >
          <Text className="font-mono text-lg tracking-widest text-white">{totp.code}</Text>
          <Text className="text-xs text-white/50">{totp.remainingSeconds}s</Text>
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
    </View>
  );
}
