package com.yourorg.passwordmanager.autofill

import android.content.Context

sealed class VaultLoadResult {
    data class Loaded(val items: List<LoginItem>) : VaultLoadResult()
    /** No cached VMK — the main app hasn't been unlocked on this device yet. */
    object NeedsMainApp : VaultLoadResult()
}

/** Ties SharedVaultStore (ciphertext cache) + VaultKeystore (VMK) +
 * VaultCrypto (decrypt) + LoginItemParser together — the same orchestration
 * CredentialListView.swift's `load()` does on iOS. Call only after
 * BiometricPrompt has already succeeded (AutofillUnlockActivity). */
object VaultLoader {
    fun load(context: Context): VaultLoadResult {
        val vmkBase64 = VaultKeystore.readVmk(context) ?: return VaultLoadResult.NeedsMainApp
        val vmk = VaultCrypto.fromBase64Url(vmkBase64)

        val items = SharedVaultStore.readCachedItems(context)
            .filter { it.type == "login" }
            .mapNotNull { row ->
                try {
                    val itemKey = VaultCrypto.unwrapKey(row.wrappedItemKey.nonce, row.wrappedItemKey.ciphertext, vmk)
                    val plaintext = VaultCrypto.decryptItem(row.content.nonce, row.content.ciphertext, row.content.aad, itemKey)
                    LoginItemParser.parse(plaintext)
                } catch (_: Exception) {
                    null // one bad row shouldn't blank the whole list
                }
            }
        return VaultLoadResult.Loaded(items)
    }
}
