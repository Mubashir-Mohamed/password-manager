package com.yourorg.passwordmanager.autofill

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * The RN-facing half of Android autofill's VMK cache — apps/mobile/src/lib/
 * autofillSync.ts calls this after every unlock, mirroring iOS's
 * biometrics.ts writing into a shared Keychain Access Group. On Android
 * there's no cross-app boundary to cross (the autofill service runs in the
 * same app package), so this is a plain native module rather than anything
 * involving App Groups.
 */
class VaultAutofillBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "VaultAutofillBridge"

    @ReactMethod
    fun saveVmk(vmkBase64: String, promise: Promise) {
        try {
            VaultKeystore.saveVmk(reactApplicationContext, vmkBase64)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("save_vmk_failed", e)
        }
    }

    @ReactMethod
    fun clearVmk(promise: Promise) {
        try {
            VaultKeystore.clearVmk(reactApplicationContext)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("clear_vmk_failed", e)
        }
    }
}
