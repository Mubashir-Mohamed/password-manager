import Foundation
import Security

/// The two things this extension reads across the process boundary from the
/// main app — never anything else. Both are written by the main app: the
/// VMK via react-native-keychain (apps/mobile/src/lib/biometrics.ts, with
/// its accessGroup pointed at SHARED_ACCESS_GROUP so this target can read
/// the same Keychain item), the ciphertext cache via a small native module
/// call from App.tsx whenever the decrypted `items` list changes (still
/// ciphertext at rest here — the exact same wrapped_item_key/content shape
/// vault_items already has server-side, no new plaintext exposure).
enum SharedVaultStoreError: Error {
    case keychainUnavailable(OSStatus)
    case cacheMissing
    case cacheUnreadable
}

/// Must match apps/mobile/app.json's `ios.entitlements` exactly (both the
/// main app's and this target's expo-target.config.js mirror the same
/// value) — see build plan §7 step 7 addendum on why an App Group +
/// Keychain Access Group are the only channel here, not a live IPC relay.
/// The RN side writes the cache via react-native-shared-group-preferences
/// (apps/mobile/src/lib/autofillSync.ts), which stores it as a string value
/// in this same App Group's UserDefaults suite — that's why this reads
/// UserDefaults rather than a raw file in the shared container.
enum SharedVaultConfig {
    static let appGroupID = "group.com.yourorg.passwordmanager.shared"
    static let keychainAccessGroup = "com.yourorg.passwordmanager.shared" // Xcode prefixes $(AppIdentifierPrefix) automatically for entitlement matching
    static let keychainService = "com.yourorg.passwordmanager.quick-unlock"
    static let keychainAccount = "vault"
    static let cacheDefaultsKey = "vault_items_cache"
}

/// Mirrors the (small, ciphertext-only) projection apps/mobile writes —
/// deliberately not the full vault_items row shape, just what autofill
/// needs. See App.tsx's cache-writing effect.
struct CachedWrappedPayload: Codable {
    let nonce: String
    let ciphertext: String
}

struct CachedItemCiphertext: Codable {
    let nonce: String
    let ciphertext: String
    let aad: String
}

struct CachedVaultItem: Codable {
    let id: String
    let type: String
    let wrappedItemKey: CachedWrappedPayload
    let content: CachedItemCiphertext
}

enum SharedVaultStore {
    /// Reading a BIOMETRY_CURRENT_SET-protected Keychain item triggers the
    /// system Face ID/Touch ID sheet automatically — no custom biometric UI
    /// here, matching mobile design plan §3's "always defer to the OS
    /// sheet" rule (same posture as apps/mobile/src/lib/biometrics.ts).
    static func readVmkBase64() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: SharedVaultConfig.keychainService,
            kSecAttrAccount as String: SharedVaultConfig.keychainAccount,
            kSecAttrAccessGroup as String: SharedVaultConfig.keychainAccessGroup,
            kSecReturnData as String: true,
            kSecUseOperationPrompt as String: "Unlock your vault to autofill",
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data, let vmkBase64 = String(data: data, encoding: .utf8) else {
            throw SharedVaultStoreError.keychainUnavailable(status)
        }
        return vmkBase64
    }

    static func readCachedItems() throws -> [CachedVaultItem] {
        guard let defaults = UserDefaults(suiteName: SharedVaultConfig.appGroupID) else {
            throw SharedVaultStoreError.cacheMissing
        }
        guard let json = defaults.string(forKey: SharedVaultConfig.cacheDefaultsKey),
            let data = json.data(using: .utf8)
        else {
            throw SharedVaultStoreError.cacheMissing
        }
        guard let items = try? JSONDecoder().decode([CachedVaultItem].self, from: data) else {
            throw SharedVaultStoreError.cacheUnreadable
        }
        return items
    }
}
