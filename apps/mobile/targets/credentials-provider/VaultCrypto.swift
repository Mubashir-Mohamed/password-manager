import Clibsodium
import Foundation

/// Swift port of the DECRYPT half of packages/core-crypto's envelope.ts —
/// deliberately NOT a port of the KDF (Argon2id/crypto_kdf_derive_from_key)
/// or the encrypt path. This extension never sees the master password or
/// derives a KEK; it only ever receives an already-unwrapped VMK from the
/// shared Keychain (see SharedVaultStore.swift), so `unwrapKey`/`decryptItem`
/// below are the entire crypto surface it needs.
///
/// This links `Clibsodium.xcframework` — the SAME compiled libsodium binary
/// apps/mobile's main target already uses via react-native-libsodium (see
/// plugins/withCredentialsProviderPod.js) — rather than reimplementing
/// XChaCha20-Poly1305, so there's no second crypto implementation to drift
/// out of sync with core-crypto or get subtly wrong.
enum VaultCryptoError: Error {
    case invalidBase64
    case decryptFailed
    case invalidUtf8
}

enum VaultCrypto {
    /// base64url, no padding — matches core-crypto/src/encoding.ts exactly
    /// (`sodium.base64_variants.URLSAFE_NO_PADDING`). Uses libsodium's own
    /// decoder rather than Foundation's `Data(base64Encoded:)` so there's no
    /// risk of a variant/padding mismatch between the two implementations.
    static func fromBase64(_ string: String) throws -> [UInt8] {
        let input = Array(string.utf8)
        var output = [UInt8](repeating: 0, count: input.count) // decoded is always <= encoded length
        var decodedLen: Int = 0
        let rc = input.withUnsafeBufferPointer { inputPtr -> Int32 in
            output.withUnsafeMutableBufferPointer { outputPtr -> Int32 in
                sodium_base642bin(
                    outputPtr.baseAddress, outputPtr.count,
                    inputPtr.baseAddress, inputPtr.count,
                    nil, &decodedLen, nil,
                    sodium_base64_VARIANT_URLSAFE_NO_PADDING
                )
            }
        }
        guard rc == 0 else { throw VaultCryptoError.invalidBase64 }
        return Array(output.prefix(decodedLen))
    }

    /// Inverse of core-crypto's `wrapKey` — unwraps a per-item key (or the
    /// VMK-under-KEK, though this extension never handles that case) with
    /// XChaCha20-Poly1305, no AAD, matching envelope.ts's `unwrapKey`.
    static func unwrapKey(nonce: String, ciphertext: String, wrappingKey: [UInt8]) throws -> [UInt8] {
        let nonceBytes = try fromBase64(nonce)
        let cipherBytes = try fromBase64(ciphertext)
        guard nonceBytes.count == Int(crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) else {
            throw VaultCryptoError.decryptFailed
        }
        var plaintext = [UInt8](repeating: 0, count: cipherBytes.count)
        var plaintextLen: UInt64 = 0
        let rc = crypto_aead_xchacha20poly1305_ietf_decrypt(
            &plaintext, &plaintextLen,
            nil,
            cipherBytes, UInt64(cipherBytes.count),
            nil, 0,
            nonceBytes,
            wrappingKey
        )
        guard rc == 0 else { throw VaultCryptoError.decryptFailed }
        return Array(plaintext.prefix(Int(plaintextLen)))
    }

    /// Inverse of core-crypto's `encryptItem` — decrypts a vault item's
    /// content, binding `aad` (`${itemId}:${version}`) exactly as
    /// envelope.ts's `decryptItem` does, so a ciphertext copied onto a
    /// different item/version row still fails to authenticate here too.
    static func decryptItem(nonce: String, ciphertext: String, aad: String, itemKey: [UInt8]) throws -> String {
        let nonceBytes = try fromBase64(nonce)
        let cipherBytes = try fromBase64(ciphertext)
        let aadBytes = Array(aad.utf8)
        guard nonceBytes.count == Int(crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) else {
            throw VaultCryptoError.decryptFailed
        }
        var plaintext = [UInt8](repeating: 0, count: cipherBytes.count)
        var plaintextLen: UInt64 = 0
        let rc = crypto_aead_xchacha20poly1305_ietf_decrypt(
            &plaintext, &plaintextLen,
            nil,
            cipherBytes, UInt64(cipherBytes.count),
            aadBytes, aadBytes.count,
            nonceBytes,
            itemKey
        )
        guard rc == 0 else { throw VaultCryptoError.decryptFailed }
        guard let text = String(bytes: plaintext.prefix(Int(plaintextLen)), encoding: .utf8) else {
            throw VaultCryptoError.invalidUtf8
        }
        return text
    }
}
