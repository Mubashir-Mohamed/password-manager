package com.yourorg.passwordmanager.autofill

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Android Keystore-backed cache for the VMK (build plan §7 step 7, mirrors
 * targets/credentials-provider's SharedVaultStore.swift on iOS). AES-256-GCM
 * with a hardware-Keystore key that never leaves the secure element/TEE — the
 * VMK itself is only ever encrypted-at-rest under it, stored in plain
 * SharedPreferences (the encryption is what protects it, not the storage
 * location).
 *
 * Deliberately NOT `setUserAuthenticationRequired(true)` on the key itself —
 * that would force a *second* biometric prompt on the main app immediately
 * after every unlock (once to unlock the vault, once to write this cache),
 * which is bad UX for little real gain here. Same posture as desktop's
 * Electron `safeStorage` (see apps/web/src/lib/desktopBridge.ts's header
 * comment): the biometric gate that matters is
 * AutofillUnlockActivity's own BiometricPrompt call before it *reads* this
 * cache, not a hardware-enforced per-use key policy. Defense in depth
 * (Keystore encryption at rest) plus an app-level gate, not two device
 * prompts for one action.
 */
object VaultKeystore {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "com.yourorg.passwordmanager.autofill.vmk-wrap-key"
    private const val PREFS_NAME = "com.yourorg.passwordmanager.autofill.vmk-cache"
    private const val PREF_KEY = "wrapped_vmk"
    private const val GCM_TAG_BITS = 128

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    /** Called from the RN bridge module right after a successful unlock. */
    fun saveVmk(context: Context, vmkBase64: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(vmkBase64.toByteArray(Charsets.UTF_8))
        // iv || ciphertext(+tag) — GCM's IV is never secret, storing it
        // alongside the ciphertext it belongs to is the standard pattern.
        val payload = cipher.iv + ciphertext

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString(PREF_KEY, Base64.encodeToString(payload, Base64.NO_WRAP))
            .apply()
    }

    /** Called from AutofillUnlockActivity after BiometricPrompt succeeds.
     * Returns null if nothing has been cached yet (main app never unlocked
     * on this device) or the cache is unreadable. */
    fun readVmk(context: Context): String? {
        val encoded = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREF_KEY, null) ?: return null
        return try {
            val payload = Base64.decode(encoded, Base64.NO_WRAP)
            val ivSize = 12 // AES-GCM standard IV size
            val iv = payload.copyOfRange(0, ivSize)
            val ciphertext = payload.copyOfRange(ivSize, payload.size)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(GCM_TAG_BITS, iv))
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    fun clearVmk(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
