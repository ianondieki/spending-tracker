import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.roborazzi)
}

android {
    namespace = "ke.hesabu.app"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "ke.hesabu.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-day-one"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            // Minification is deliberately off for the sprint build; turn on with keep rules before a store release.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        viewBinding = false
        buildConfig = true
    }

    testOptions {
        // Robolectric needs the merged resources and manifest on the unit-test classpath.
        unitTests.isIncludeAndroidResources = true
        unitTests.all { test ->
            // Tests that check parity with the frozen contracts (tokens, packs) read them straight from the repo.
            test.systemProperty("hesabu.contractsDir", contractsDir.absolutePath)
            test.systemProperty("hesabu.repoDir", contractsDir.parentFile.absolutePath)
            test.maxHeapSize = "2g"
            // Screenshot tests always record, so a plain unit-test run refreshes android/screenshots/.
            test.systemProperty("roborazzi.test.record", "true")
            test.systemProperty("hesabu.screenshotsDir", rootProject.file("screenshots").absolutePath)
        }
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/hesabuAssets"))

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "META-INF/INDEX.LIST", "META-INF/io.netty.versions.properties")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

ksp {
    // Exported Room schemas are committed so migrations can be tested against real history.
    arg("room.schemaLocation", "$projectDir/schemas")
}

dependencies {
    implementation(libs.androidx.core.ktx)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    // Storage: Room on top of SQLCipher via the androidx.sqlite SupportSQLiteOpenHelper API
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.sqlite)
    implementation(libs.androidx.sqlite.ktx)
    implementation(libs.sqlcipher.android)

    // Background work, settings, key material
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)

    // Kotlin
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)

    // Network
    implementation(libs.bundles.ktor)

    // Unit tests (JVM)
    testImplementation(libs.junit)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    testImplementation(libs.roborazzi)
    testImplementation(libs.ktor.client.mock)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.roborazzi.junit.rule)
    testImplementation(libs.robolectric)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.androidx.test.ext.junit)

    // Instrumented tests (device / emulator)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
}

/** The frozen sprint contracts, one level above android/. Provider packs are copied from here into the APK. */
val contractsDir: File = rootProject.file("../contracts")
val generatedAssets: File = layout.buildDirectory.dir("generated/hesabuAssets").get().asFile

/**
 * Copies contracts/provider-packs/*.json into assets/provider-packs/ and packages/taxonomy/dist/*.json into
 * assets/taxonomy/ at build time, so the app always ships the packs and taxonomy from the integration branch.
 * Both sources may be absent early in the sprint; the task then produces an empty directory and the engine
 * falls back to the inline packs under src/main/assets.
 */
val copyContractAssets by tasks.registering(Sync::class) {
    description = "Copies provider packs and the taxonomy from the monorepo into the app's assets"
    from(contractsDir.resolve("provider-packs")) { include("*.json"); into("provider-packs") }
    from(rootProject.file("../packages/taxonomy/dist")) { include("*.json"); into("taxonomy") }
    from(rootProject.file("../corpus/demo")) { include("demo-inbox.jsonl"); into("demo") }
    into(generatedAssets)
    includeEmptyDirs = false
}

// Every variant's asset merge (and the unit-test resource step) sees the copied contracts first.
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach { dependsOn(copyContractAssets) }
tasks.matching { it.name.startsWith("generate") && it.name.endsWith("Assets") }.configureEach { dependsOn(copyContractAssets) }
tasks.matching { it.name.startsWith("package") && it.name.endsWith("Assets") }.configureEach { dependsOn(copyContractAssets) }
tasks.matching { it.name.startsWith("lintVital") || it.name.startsWith("lintAnalyze") || it.name == "lint" }.configureEach { dependsOn(copyContractAssets) }
tasks.withType<Test>().configureEach { dependsOn(copyContractAssets) }

roborazzi {
    // Screenshots are committed under android/screenshots/ so the orchestrator can review the design.
    outputDir.set(rootProject.file("screenshots"))
}
