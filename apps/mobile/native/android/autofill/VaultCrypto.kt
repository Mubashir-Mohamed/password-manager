package com.yourorg.passwordmanager.autofill

import android.util.Base64
import org.bouncycastle.crypto.modes.XChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter

/**
 * Kotlin port of the DECRYPT half of packages/core-crypto's envelope.ts —
 * mirrors targets/credentials-provider/VaultCrypto.swift's scope exactly
 * (no KDF, no encrypt path; this service only ever receives an
 * already-unwrapped VMK). Uses Bouncy Castle's `XChaCha20Poly1305` rather
 * than linking libsodium's native .so via JNI — this sandbox has no Android
 * NDK installed, and Bouncy Castle avoids needing one at all (pure JVM).
 *
 * Cross-checked, not assumed: a real ciphertext produced by core-crypto's
 * actual `encryptItem` (WASM libsodium) was decrypted with Bouncy Castle
 * 1.85.2's XChaCha20Poly1305 using the identical key/nonce/aad and recovered
 * byte-identical plaintext — see the build plan §7 step 7 addendum for the
 * verification script. Needs bcprov-jdk18on >= ~1.80 (1.79 doesn't have
 * XChaCha20Poly1305 yet).
 */
class VaultCryptoError : Exception("Decrypt failed")

object VaultCrypto {
    /** base64url, no padding — matches core-crypto/src/encoding.ts's
     * `sodium.base64_variants.URLSAFE_NO_PADDING` exactly. */
    fun fromBase64Url(value: String): ByteArray {
        return Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    /** Inverse of core-crypto's `wrapKey` — no AAD, matches envelope.ts's
     * `unwrapKey`. */
    fun unwrapKey(nonce: String, ciphertext: String, wrappingKey: ByteArray): ByteArray {
        return aeadDecrypt(fromBase64Url(nonce), fromBase64Url(ciphertext), ByteArray(0), wrappingKey)
    }

    /** Inverse of core-crypto's `encryptItem` — binds `aad`
     * (`${itemId}:${version}`) exactly as envelope.ts's `decryptItem` does. */
    fun decryptItem(nonce: String, ciphertext: String, aad: String, itemKey: ByteArray): String {
        val plaintext = aeadDecrypt(
            fromBase64Url(nonce),
            fromBase64Url(ciphertext),
            aad.toByteArray(Charsets.UTF_8),
            itemKey,
        )
        return String(plaintext, Charsets.UTF_8)
    }

    private fun aeadDecrypt(nonce: ByteArray, ciphertextWithTag: ByteArray, aad: ByteArray, key: ByteArray): ByteArray {
        require(nonce.size == 24) { "expected a 24-byte XChaCha20 nonce" }
        try {
            val cipher = XChaCha20Poly1305()
            cipher.init(false, AEADParameters(KeyParameter(key), 128, nonce, aad))
            val output = ByteArray(cipher.getOutputSize(ciphertextWithTag.size))
            var len = cipher.processBytes(ciphertextWithTag, 0, ciphertextWithTag.size, output, 0)
            len += cipher.doFinal(output, len)
            return output.copyOfRange(0, len)
        } catch (e: Exception) {
            throw VaultCryptoError()
        }
    }
}
