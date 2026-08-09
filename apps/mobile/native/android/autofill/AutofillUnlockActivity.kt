package com.yourorg.passwordmanager.autofill

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ListView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import android.service.autofill.Dataset

/**
 * Launched via the PendingIntent set on the "locked" Dataset
 * PasswordManagerAutofillService returns — this IS the biometric unlock
 * step (mobile design plan §4.2 "always defer to the OS sheet"), and once
 * unlocked, the whole autofill picker UI. Auto-triggers BiometricPrompt on
 * create, matching UnlockScreen's (mobile/web) "auto-triggered on screen
 * focus" note.
 */
class AutofillUnlockActivity : FragmentActivity() {
    companion object {
        const val EXTRA_FIELD_IDS = "field_ids"
        const val EXTRA_FIELD_IS_PASSWORD = "field_is_password"
        const val EXTRA_WEB_DOMAIN = "web_domain"
        const val EXTRA_REQUESTING_PACKAGE = "requesting_package"
    }

    private lateinit var progress: ProgressBar
    private lateinit var message: TextView
    private lateinit var search: EditText
    private lateinit var listView: ListView

    private var allItems: List<LoginItem> = emptyList()
    private var fieldIds: List<AutofillId> = emptyList()
    private var isPasswordFlags: BooleanArray = BooleanArray(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(resources.getIdentifier("activity_autofill_unlock", "layout", packageName))

        progress = findViewById(resources.getIdentifier("progress", "id", packageName))
        message = findViewById(resources.getIdentifier("message", "id", packageName))
        search = findViewById(resources.getIdentifier("search", "id", packageName))
        listView = findViewById(resources.getIdentifier("items", "id", packageName))

        @Suppress("DEPRECATION")
        fieldIds = intent.getParcelableArrayListExtra<AutofillId>(EXTRA_FIELD_IDS) ?: emptyList()
        isPasswordFlags = intent.getBooleanArrayExtra(EXTRA_FIELD_IS_PASSWORD) ?: BooleanArray(0)

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = renderList()
        })
        listView.setOnItemClickListener { _, _, position, _ ->
            (listView.adapter as? ArrayAdapter<LoginItem>)?.getItem(position)?.let(::complete)
        }

        promptBiometric()
    }

    private fun promptBiometric() {
        val executor = ContextCompat.getMainExecutor(this)
        val prompt = BiometricPrompt(
            this,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    loadVault()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    cancel()
                }

                override fun onAuthenticationFailed() {
                    // Let the user retry within the same prompt — BiometricPrompt
                    // itself handles the retry UI, we only act on a terminal error/cancel.
                }
            },
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock your vault")
            .setSubtitle("Unlock to autofill")
            .setAllowedAuthenticators(
                androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
            .build()
        prompt.authenticate(info)
    }

    private fun loadVault() {
        when (val result = VaultLoader.load(applicationContext)) {
            is VaultLoadResult.NeedsMainApp -> showMessage("Open Password Manager and unlock it at least once on this device first.")
            is VaultLoadResult.Loaded -> {
                allItems = result.items
                progress.visibility = View.GONE
                search.visibility = View.VISIBLE
                listView.visibility = View.VISIBLE
                renderList()
            }
        }
    }

    private fun renderList() {
        val webDomain = intent.getStringExtra(EXTRA_WEB_DOMAIN)
        val requestingPackage = intent.getStringExtra(EXTRA_REQUESTING_PACKAGE)

        var candidates = allItems
        if (!webDomain.isNullOrEmpty() || !requestingPackage.isNullOrEmpty()) {
            val domainMatches = allItems.filter { item ->
                item.urls.any { url ->
                    val host = hostOf(url)
                    (webDomain != null && host.equals(webDomain, ignoreCase = true)) ||
                        (requestingPackage != null && host.contains(requestingPackage, ignoreCase = true))
                }
            }
            if (domainMatches.isNotEmpty()) candidates = domainMatches
        }

        val query = search.text?.toString()?.trim()?.lowercase().orEmpty()
        val filtered = if (query.isEmpty()) {
            candidates
        } else {
            candidates.filter {
                it.title.lowercase().contains(query) || (it.username?.lowercase()?.contains(query) == true)
            }
        }

        // A typed adapter (not just ArrayAdapter<String>) so onItemClick can
        // hand back the actual LoginItem, not just its rendered text.
        listView.adapter = object : ArrayAdapter<LoginItem>(this, android.R.layout.simple_list_item_2, android.R.id.text1, filtered) {
            override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View {
                val view = super.getView(position, convertView, parent)
                val item = getItem(position)
                view.findViewById<TextView>(android.R.id.text1).text = item?.title
                view.findViewById<TextView>(android.R.id.text2).text = item?.username.orEmpty()
                return view
            }
        }
    }

    private fun hostOf(raw: String): String {
        return try {
            android.net.Uri.parse(raw).host ?: raw
        } catch (_: Exception) {
            raw
        }
    }

    private fun showMessage(text: String) {
        progress.visibility = View.GONE
        message.visibility = View.VISIBLE
        message.text = text
    }

    private fun complete(item: LoginItem) {
        val datasetBuilder = Dataset.Builder()
        fieldIds.forEachIndexed { index, id ->
            val isPassword = isPasswordFlags.getOrElse(index) { false }
            val value = if (isPassword) item.password else (item.username ?: item.title)
            datasetBuilder.setValue(id, AutofillValue.forText(value))
        }
        val resultIntent = Intent().apply {
            putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, datasetBuilder.build())
        }
        setResult(RESULT_OK, resultIntent)
        finish()
    }

    private fun cancel() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
