package com.yourorg.passwordmanager.autofill

import org.json.JSONObject

/** Mirrors just the fields of core-domain's LoginContent autofill needs —
 * same scope as targets/credentials-provider/CredentialListView.swift's
 * `LoginItem`. Extra keys (totp, notes, kind) are ignored, not an error. */
data class LoginItem(val title: String, val username: String?, val password: String, val urls: List<String>)

object LoginItemParser {
    fun parse(json: String): LoginItem? {
        return try {
            val obj = JSONObject(json)
            val password = obj.optString("password", "")
            if (password.isEmpty()) return null
            val urlsArray = obj.optJSONArray("urls")
            val urls = if (urlsArray != null) (0 until urlsArray.length()).map { urlsArray.optString(it) } else emptyList()
            LoginItem(
                title = obj.optString("title", ""),
                username = if (obj.has("username")) obj.optString("username") else null,
                password = password,
                urls = urls,
            )
        } catch (_: Exception) {
            null
        }
    }
}
