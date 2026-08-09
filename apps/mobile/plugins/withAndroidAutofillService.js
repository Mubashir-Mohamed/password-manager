const {
  withDangerousMod,
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
  withMainApplication,
} = require("@expo/config-plugins");
const path = require("path");
const fs = require("fs");

const PACKAGE_DIR = "com/yourorg/passwordmanager/autofill"; // must match the Kotlin `package` declarations below
const SOURCE_DIR = "native/android/autofill";

/**
 * Copies the committed Kotlin sources (apps/mobile/native/android/) into the
 * generated `android/` project on every `expo prebuild`, registers the
 * AutofillService + unlock Activity in AndroidManifest.xml, adds the
 * Bouncy Castle + androidx.biometric Gradle dependencies, and registers
 * VaultAutofillBridgePackage with React Native — build plan §7 step 7.
 *
 * Android has no "extension target" concept the way @bacons/apple-targets
 * gives iOS — the autofill service is just another component inside the
 * same app module, so this plugin does by hand (file copy + manifest/gradle
 * edits) what @bacons/apple-targets does declaratively for the Xcode side.
 */
module.exports = function withAndroidAutofillService(config) {
  config = withCopiedSources(config);
  config = withManifestEntries(config);
  config = withKotlinVersionFix(config);
  config = withGradleDependencies(config);
  config = withPackageRegistration(config);
  return config;
};

function withCopiedSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const androidRoot = config.modRequest.platformProjectRoot;

      const javaDest = path.join(androidRoot, "app", "src", "main", "java", PACKAGE_DIR);
      fs.mkdirSync(javaDest, { recursive: true });
      const sourceDir = path.join(projectRoot, SOURCE_DIR);
      for (const file of fs.readdirSync(sourceDir)) {
        if (file.endsWith(".kt")) {
          fs.copyFileSync(path.join(sourceDir, file), path.join(javaDest, file));
        }
      }

      const resSrc = path.join(projectRoot, "native", "android", "res");
      const resDest = path.join(androidRoot, "app", "src", "main", "res");
      for (const sub of ["xml", "layout"]) {
        const destDir = path.join(resDest, sub);
        fs.mkdirSync(destDir, { recursive: true });
        for (const file of fs.readdirSync(path.join(resSrc, sub))) {
          fs.copyFileSync(path.join(resSrc, sub, file), path.join(destDir, file));
        }
      }

      return config;
    },
  ]);
}

function withManifestEntries(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.service) app.service = [];
    if (!app.activity) app.activity = [];

    const servicePresent = app.service.some(
      (s) => s.$["android:name"] === ".autofill.PasswordManagerAutofillService",
    );
    if (!servicePresent) {
      app.service.push({
        $: {
          "android:name": ".autofill.PasswordManagerAutofillService",
          "android:label": "Vault Autofill",
          "android:permission": "android.permission.BIND_AUTOFILL_SERVICE",
          "android:exported": "true",
        },
        "intent-filter": [{ action: [{ $: { "android:name": "android.service.autofill.AutofillService" } }] }],
        "meta-data": [{ $: { "android:name": "android.autofill", "android:resource": "@xml/autofill_service" } }],
      });
    }

    const activityPresent = app.activity.some((a) => a.$["android:name"] === ".autofill.AutofillUnlockActivity");
    if (!activityPresent) {
      app.activity.push({
        $: {
          "android:name": ".autofill.AutofillUnlockActivity",
          "android:exported": "false",
          "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
          "android:launchMode": "singleTask",
        },
      });
    }

    return config;
  });
}

/**
 * Pre-existing Expo SDK 52 / RN 0.76 template issue, unrelated to autofill —
 * hit while building this feature, not caused by it, and it blocks ANY
 * Android Kotlin compilation on this template, so it's fixed here rather
 * than left for the next person to rediscover.
 *
 * The generated root android/build.gradle declares
 * `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')` with NO version,
 * which Gradle resolves independently of `ext.kotlinVersion` (used
 * elsewhere only for artifact coordinates, e.g.
 * "org.jetbrains.kotlin:kotlin-stdlib:$kotlinVersion") — in practice it
 * resolves to 1.9.24 (transitively, via react-native-gradle-plugin), while
 * expo-modules-core 2.2.3's Compose integration requires the Compose
 * Compiler that only supports Kotlin 1.9.25+. Pinning the classpath
 * dependency explicitly (and forcing it repo-wide, since transitive
 * resolution can otherwise still win) fixes it.
 */
function withKotlinVersionFix(config) {
  return withProjectBuildGradle(config, (config) => {
    const marker = "withAndroidAutofillService kotlin version fix";
    if (config.modResults.contents.includes(marker)) return config;

    const originalBlock = `    dependencies {
        classpath('com.android.tools.build:gradle')
        classpath('com.facebook.react:react-native-gradle-plugin')
        classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
    }`;
    const fixedBlock = `    // ${marker}
    dependencies {
        classpath('com.android.tools.build:gradle')
        classpath('com.facebook.react:react-native-gradle-plugin')
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion")
    }
    configurations.all {
        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion"
        }
    }`;

    if (!config.modResults.contents.includes(originalBlock)) {
      console.warn(
        "[withAndroidAutofillService] Couldn't find the expected buildscript dependencies block in android/build.gradle — Expo's template may have changed. Skipping the Kotlin version fix; a Compose/Kotlin version mismatch build failure may follow.",
      );
      return config;
    }
    config.modResults.contents = config.modResults.contents.replace(originalBlock, fixedBlock);
    return config;
  });
}

function withGradleDependencies(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = "// withAndroidAutofillService dependencies";
    if (config.modResults.contents.includes(marker)) return config;
    config.modResults.contents = config.modResults.contents.replace(
      /dependencies\s*\{/,
      `dependencies {\n    ${marker}\n    implementation("org.bouncycastle:bcprov-jdk18on:1.85.2") // XChaCha20-Poly1305 — see VaultCrypto.kt's header comment\n    implementation("androidx.biometric:biometric:1.1.0")\n`,
    );
    return config;
  });
}

function withPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const marker = "VaultAutofillBridgePackage";
    if (config.modResults.contents.includes(marker)) return config;

    let contents = config.modResults.contents;
    const importLine = "import com.yourorg.passwordmanager.autofill.VaultAutofillBridgePackage\n";
    if (!contents.includes(importLine.trim())) {
      contents = contents.replace(/^(package .+\n)/, `$1\n${importLine}`);
    }
    // PackageList(this).packages is the standard Expo-generated autolinking
    // list — appending here rather than replacing keeps every autolinked
    // module intact.
    contents = contents.replace(
      /(val packages = PackageList\(this\)\.packages)/,
      `$1.apply { add(${marker}()) }`,
    );
    config.modResults.contents = contents;
    return config;
  });
}
