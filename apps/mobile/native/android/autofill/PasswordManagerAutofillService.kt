package com.yourorg.passwordmanager.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId
import android.widget.RemoteViews

/** Registered in AndroidManifest.xml (android:autofill meta-data →
 * res/xml/autofill_service.xml) — build plan §7 step 7. Login-item autofill
 * only for now, matching every other surface's login-first MVP scope (and
 * targets/credentials-provider's iOS equivalent).
 *
 * Never decrypts anything itself — it only locates the fields to fill and
 * hands off to AutofillUnlockActivity (via Dataset.Builder#setAuthentication)
 * for the biometric gate + actual decrypt + credential choice. That's the
 * standard Android autofill pattern for gated credentials, not a shortcut:
 * https://developer.android.com/reference/android/service/autofill/Dataset.Builder#setAuthentication(android.content.IntentSender)
 */
class PasswordManagerAutofillService : AutofillService() {
    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        val structure = request.fillContexts.lastOrNull()?.structure
        if (structure == null) {
            callback.onSuccess(null)
            return
        }

        val fields = findAutofillFields(structure)
        if (fields.isEmpty()) {
            callback.onSuccess(null)
            return
        }

        // Best-effort domain/package hint for AutofillUnlockActivity's list
        // filtering (mirrors CredentialListView.swift's service-identifier
        // matching) — falls back gracefully if neither is present.
        val rootNode = structure.getWindowNodeAt(0).rootViewNode
        val webDomain = rootNode.webDomain
        val requestingPackage = structure.activityComponent?.packageName

        val autofillIds = ArrayList(fields.map { it.autofillId })
        val isPasswordFlags = fields.map { it.isPassword }.toBooleanArray()

        val authIntent = Intent(this, AutofillUnlockActivity::class.java).apply {
            putParcelableArrayListExtra(AutofillUnlockActivity.EXTRA_FIELD_IDS, autofillIds)
            putExtra(AutofillUnlockActivity.EXTRA_FIELD_IS_PASSWORD, isPasswordFlags)
            putExtra(AutofillUnlockActivity.EXTRA_WEB_DOMAIN, webDomain)
            putExtra(AutofillUnlockActivity.EXTRA_REQUESTING_PACKAGE, requestingPackage)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            request.id,
            authIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

        val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, "Unlock Password Manager")
        }

        val datasetBuilder = Dataset.Builder()
        fields.forEach { field -> datasetBuilder.setValue(field.autofillId, null, presentation) }
        datasetBuilder.setAuthentication(pendingIntent.intentSender)

        val response = FillResponse.Builder().addDataset(datasetBuilder.build()).build()
        callback.onSuccess(response)
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // "Save this new password?" isn't built yet — matches build plan §7's
        // fill-only scope for this first pass. Declining (rather than
        // silently no-op'ing) is the correct signal to the OS/keyboard.
        callback.onFailure("Not supported yet")
    }

    private data class Field(val autofillId: AutofillId, val isPassword: Boolean)

    private fun findAutofillFields(structure: AssistStructure): List<Field> {
        val fields = mutableListOf<Field>()
        for (i in 0 until structure.windowNodeCount) {
            visit(structure.getWindowNodeAt(i).rootViewNode, fields)
        }
        return fields
    }

    private fun visit(node: AssistStructure.ViewNode, out: MutableList<Field>) {
        val autofillId = node.autofillId
        if (autofillId != null) {
            val hints = node.autofillHints
            val isPassword = hints?.any { it == View.AUTOFILL_HINT_PASSWORD } == true || isPasswordInputType(node.inputType)
            val isUsername = hints?.any {
                it == View.AUTOFILL_HINT_USERNAME || it == View.AUTOFILL_HINT_EMAIL_ADDRESS
            } == true
            if (isPassword || isUsername || (hints?.isNotEmpty() == true)) {
                out.add(Field(autofillId, isPassword))
            }
        }
        for (i in 0 until node.childCount) {
            visit(node.getChildAt(i), out)
        }
    }

    private fun isPasswordInputType(inputType: Int): Boolean {
        val variation = inputType and InputType.TYPE_MASK_VARIATION
        val isTextPassword = variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
            variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
        val isNumericPin = (inputType and InputType.TYPE_MASK_CLASS) == InputType.TYPE_CLASS_NUMBER &&
            (inputType and InputType.TYPE_NUMBER_VARIATION_PASSWORD) == InputType.TYPE_NUMBER_VARIATION_PASSWORD
        return isTextPassword || isNumericPin
    }
}
