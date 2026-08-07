import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { getQuickUnlockSecret, isBiometricAvailable } from "../lib/biometrics.js";
import type { Database } from "@password-manager/api-client";

export interface UnlockScreenProps {
  hasSession: boolean;
  onUnlock: (params: { email: string; masterPassword: string; secretKey: string }) => Promise<void>;
  onQuickUnlock: (vmkBase64: string) => Promise<boolean>;
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  busy: boolean;
  error: string | null;
}

/** Minimal, understated — biometric prompt auto-triggers on focus, master-
 * password fallback always visible below it (mobile design plan §4.2). */
export function UnlockScreen({ hasSession, onUnlock, onQuickUnlock, profile, busy, error }: UnlockScreenProps) {
  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBiometricAvailable);
  }, []);

  useEffect(() => {
    // Auto-trigger biometric unlock on screen focus when we have a cached
    // secret — same expectation as the design doc's "auto-triggered on
    // screen focus" note.
    if (!biometricAvailable || !hasSession) return;
    getQuickUnlockSecret().then((cached) => {
      if (cached) onQuickUnlock(cached);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricAvailable, hasSession]);

  async function handleSubmit() {
    await onUnlock({ email, masterPassword, secretKey });
  }

  return (
    <View className="flex-1 justify-center bg-base px-6">
      <View className="mb-8 items-center">
        <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
          <Text className="text-2xl">🔒</Text>
        </View>
        <Text className="text-lg font-semibold text-white">Unlock your vault</Text>
        {profile?.email && <Text className="mt-1 text-sm text-white/60">{profile.email}</Text>}
      </View>

      {!hasSession && (
        <TextInput
          placeholder="Email"
          placeholderTextColor="#ffffff59"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
        />
      )}
      <TextInput
        placeholder="Master password"
        placeholderTextColor="#ffffff59"
        secureTextEntry
        value={masterPassword}
        onChangeText={setMasterPassword}
        className="mb-4 rounded-xl border border-white/10 bg-surface px-4 py-3 text-white"
      />
      <TextInput
        placeholder="Secret Key"
        placeholderTextColor="#ffffff59"
        autoCapitalize="characters"
        value={secretKey}
        onChangeText={setSecretKey}
        className="mb-2 rounded-xl border border-white/10 bg-surface px-4 py-3 font-mono text-white"
      />
      {error && <Text className="mb-4 text-sm text-danger">{error}</Text>}

      <Pressable
        onPress={handleSubmit}
        disabled={busy || !masterPassword || !secretKey || (!hasSession && !email)}
        className="mt-4 items-center rounded-xl bg-accent px-6 py-3 disabled:opacity-40"
      >
        <Text className="font-semibold text-white">{busy ? "Unlocking…" : "Unlock"}</Text>
      </Pressable>

      {biometricAvailable && (
        <Text className="mt-6 text-center text-xs text-white/35">Face ID / Touch ID unlock available</Text>
      )}
    </View>
  );
}
