// Root build script for the Hesabu Android app.
// Plugins are declared here with `apply false` so the version catalog (gradle/libs.versions.toml)
// is the single place versions are pinned; modules apply them by alias.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.roborazzi) apply false
}
