# Hesabu — Android app

The on-device half of Hesabu (working name, `[[NAME-REVIEW]]`): reads money SMS (M-Pesa, Airtel Money, T-Kash,
banks) on the phone, parses them into an encrypted ledger, and shows reports. Raw messages never leave the phone;
only derived ledger rows sync to the API.

## Layout

```
android/
├── settings.gradle.kts         # pluginManagement + repositories (google, mavenCentral); include(":app")
├── build.gradle.kts            # plugin declarations (apply false); versions live in the catalog
├── gradle/libs.versions.toml   # the version catalog — the only place versions are pinned
├── gradle/wrapper/             # Gradle 8.9 wrapper
└── app/
    ├── build.gradle.kts        # applicationId ke.hesabu.app, minSdk 26, target/compileSdk 35, JVM 17, Compose
    ├── schemas/                # exported Room schemas (committed; migrations are tested against them)
    └── src/
        ├── main/java/ke/hesabu/app/
        │   ├── ui/             # Compose shell: bottom nav + NavHost (Home, Transactions, Reports, Settings)
        │   ├── ui/theme/       # Material3 HesabuTheme — placeholder colours; contracts/design-tokens.json wins
        │   ├── ingest/         # SmsReceiver (SMS_RECEIVED) and, later, the backfill reader
        │   ├── parse/          # deterministic parsing helpers (Money) and the provider-pack engine
        │   ├── data/           # Room on SQLCipher (HesabuDatabase, TransactionEntity), DataStore settings, key storage
        │   ├── sync/           # Ktor SyncClient + WorkManager SyncWorker
        │   └── reports/        # report archive repository
        ├── test/               # JVM unit tests (JUnit 4, Robolectric)
        └── androidTest/        # instrumented Compose tests (need a device or emulator)
```

## Toolchain

| Tool | Version |
|---|---|
| JDK | 17 or newer (the container has OpenJDK 21) |
| Gradle | 8.9 via the wrapper (`./gradlew`) |
| Android Gradle Plugin | 8.7.3 |
| Kotlin / Compose compiler | 2.0.21 |
| KSP | 2.0.21-1.0.28 |
| compileSdk / targetSdk / minSdk | 35 / 35 / 26 |
| Build-tools | 35.0.0 |

In this container the Android SDK lives at **`/opt/android-sdk`** (command-line tools, `platform-tools`,
`platforms;android-35`, `build-tools;35.0.0`). `android/local.properties` points Gradle at it with
`sdk.dir=/opt/android-sdk`; that file is machine-specific and git-ignored, so on another machine either create it
with your own `sdk.dir` or export `ANDROID_HOME`.

## Build

```sh
cd android
export ANDROID_HOME=/opt/android-sdk          # or wherever your SDK is; local.properties also works

./gradlew assembleDebug --no-daemon           # debug APK
./gradlew testDebugUnitTest --no-daemon       # JVM unit tests (JUnit + Robolectric)
./gradlew assembleDebug testDebugUnitTest --no-daemon   # both, as CI does
./gradlew lint --no-daemon                    # Android lint report
```

The debug APK lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

The first build downloads the Gradle distribution and all dependencies (a few hundred MB); later builds are
incremental. Set `GRADLE_USER_HOME` if you want the cache somewhere specific.

## Install on a phone

Enable developer options and USB debugging on the phone, connect it, then:

```sh
/opt/android-sdk/platform-tools/adb devices                       # the phone should be listed as "device"
/opt/android-sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
/opt/android-sdk/platform-tools/adb shell am start -n ke.hesabu.app/.MainActivity
```

`-r` reinstalls over an existing debug build and keeps its data. To remove it: `adb uninstall ke.hesabu.app`.
On Tecno, Infinix and Xiaomi phones turn battery optimisation off for the app so the SMS receiver keeps running.

Instrumented tests need a connected device or emulator: `./gradlew connectedDebugAndroidTest`.

## How the pieces fit

- **Packs.** `contracts/provider-packs/*.json` and `packages/taxonomy/dist/*.json` are copied into the APK's assets
  by the `copyContractAssets` Gradle task on every build. The built-in fallbacks under `src/main/assets/*-builtin/`
  are dropped per sender as soon as a contract pack claims that sender. Every example in every pack is a test
  (`PackExamplesTest`), and `CorpusCoverageTest` runs `corpus/` through the loaded packs.
- **Pipeline.** Every entry point (live SMS, inbox backfill, six-hourly reconciliation, share-to-app, paste import,
  demo mode) calls `IngestPipeline.ingest`: parse, dedupe, categorise, store, pair transfers, check the balance
  chain, queue for sync. Message bodies are never logged; unknown ones are stored encrypted for "Teach Hesabu".
- **Sync.** `Syncer` registers the device and uploads queued rows in batches of 500 through `SyncClient`; without
  a server address in Settings nothing is sent. The wire models have no field for a message body.
- **Demo mode.** Settings toggle; feeds the demo inbox through the real pipeline with the tag `demo`, and removes
  exactly those rows when turned off.
- **Screenshots.** `./gradlew testDebugUnitTest` re-records `screenshots/` (Roborazzi always records here).

## Permissions

`RECEIVE_SMS` and `READ_SMS` are declared for live ingestion and the one-off inbox backfill, requested at runtime
only after the prominent-disclosure screen; `POST_NOTIFICATIONS` for report-ready notices; `INTERNET` for sync.
Backup is disabled (`android:allowBackup="false"`) so the ledger never goes to cloud backup.

## Signing

Debug builds use the default debug keystore. Release signing material (`*.jks`, `*.keystore`) is git-ignored
and must never be committed; configure it through `local.properties` or environment variables when the signed
`v0.1-day-one` build is cut.

## Troubleshooting

- **`Received status code 429 from server: Too Many Requests` from `repo.maven.apache.org`** — Maven Central is
  rate-limiting the first-build dependency burst. Nothing is wrong with the project; wait a few seconds and rerun,
  each attempt caches more artifacts. (Gradle does not cache 429s as "missing".)
- **Robolectric tests fail with `Failed to fetch maven artifact org.robolectric:android-all-instrumented:…`** —
  Robolectric downloads its Android runtime jars at test time (for the `@Config(sdk=…)` level *and* the manifest's
  `targetSdk`), outside Gradle's cache, so the same rate limit can hit them. Pre-seed its cache once and rerun:

  ```sh
  V=14-robolectric-10818077-i7      # SDK 34; SDK 35 is 15-robolectric-12650502-i7
  D=~/.m2/repository/org/robolectric/android-all-instrumented/$V; mkdir -p "$D"
  for f in android-all-instrumented-$V.pom android-all-instrumented-$V.pom.sha512 \
           android-all-instrumented-$V.jar android-all-instrumented-$V.jar.sha512; do
    curl -sSL --retry 8 --retry-delay 15 --retry-all-errors -o "$D/$f" \
      "https://repo1.maven.org/maven2/org/robolectric/android-all-instrumented/$V/$f"
  done
  ```

  In CI, cache `~/.m2/repository/org/robolectric` alongside `~/.gradle/caches`.
- **`UnsatisfiedLinkError: no sqlcipher in java.library.path` in a JVM test** — something called
  `HesabuDatabase.loadNativeLibrary()`/`open()` on the JVM. SQLCipher only exists on a device; keep database code
  behind an interface in unit tests or run it as an instrumented test.
- **`sdk.dir` not found** — create `android/local.properties` with `sdk.dir=/path/to/sdk` or export `ANDROID_HOME`.
