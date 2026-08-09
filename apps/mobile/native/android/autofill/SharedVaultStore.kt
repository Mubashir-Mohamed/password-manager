package com.yourorg.passwordmanager.autofill

import android.content.Context
import org.json.JSONArray

/**
 * Reads the ciphertext item cache apps/mobile/src/lib/autofillSync.ts writes
 * via react-native-shared-group-preferences (`useAndroidSharedPreferences:
 * true` — a plain private SharedPreferences file named after the "app
 * group" string, same package/process so no real cross-app sharing is
 * needed on Android, unlike iOS). Still ciphertext at rest — the same
 * wrapped_item_key/content shape vault_items has server-side.
 */
data class CachedWrappedPayload(val nonce: String, val ciphertext: String)
data class CachedItemCiphertext(val nonce: String, val ciphertext: String, val aad: String)
data class CachedVaultItem(
    val id: String,
    val type: String,
    val wrappedItemKey: CachedWrappedPayload,
    val content: CachedItemCiphertext,
)

object SharedVaultStore {
    // Must match apps/mobile/src/lib/autofillSync.ts's APP_GROUP/CACHE_KEY exactly.
    private const val APP_GROUP = "group.com.yourorg.passwordmanager.shared"
    private const val CACHE_KEY = "vault_items_cache"

    fun readCachedItems(context: Context): List<CachedVaultItem> {
        val json = context.getSharedPreferences(APP_GROUP, Context.MODE_PRIVATE)
            .getString(CACHE_KEY, null) ?: return emptyList()
        return try {
            val array = JSONArray(json)
            (0 until array.length()).mapNotNull { i ->
                val row = array.optJSONObject(i) ?: return@mapNotNull null
                val wrappedKey = row.optJSONObject("wrappedItemKey") ?: return@mapNotNull null
                val content = row.optJSONObject("content") ?: return@mapNotNull null
                CachedVaultItem(
                    id = row.optString("id"),
                    type = row.optString("type"),
                    wrappedItemKey = CachedWrappedPayload(
                        nonce = wrappedKey.optString("nonce"),
                        ciphertext = wrappedKey.optString("ciphertext"),
                    ),
                    content = CachedItemCiphertext(
                        nonce = content.optString("nonce"),
                        ciphertext = content.optString("ciphertext"),
                        aad = content.optString("aad"),
                    ),
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
