/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "credentials-provider",
  // Must match this directory's name — @bacons/apple-targets' Podfile loader
  // derives the CocoaPods target name from the directory basename
  // (`credentials-provider`), and CocoaPods requires that to exactly match
  // the actual Xcode target name for `pods.rb` (see ./pods.rb) to apply.
  name: "credentials-provider",
  displayName: "Vault Autofill",
  // Dot-prefix appends to the main app's bundle id, per @bacons/apple-targets
  // convention (`.credentialsprovider` suffix) — matches build plan §7 step 7
  // "iOS Credential Provider Extension".
  bundleIdentifier: ".credentialsprovider",
  deploymentTarget: "16.0", // ASCredentialProviderViewController's password-autofill APIs need iOS 16+ for the modern text-to-insert flow this uses
  frameworks: ["AuthenticationServices", "LocalAuthentication", "Security"],
  // Same two entitlements as the main app (app.json ios.entitlements) — this
  // is the ONLY channel data crosses the app/extension process boundary:
  // the Keychain-shared VMK (biometric-gated, see SharedVaultStore.swift)
  // and the App-Group-shared ciphertext cache. Never the master password,
  // never an unencrypted item — same posture as every other surface in this
  // product (build plan §2).
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
    "keychain-access-groups": config.ios.entitlements["keychain-access-groups"],
  },
});
