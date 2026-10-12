package ke.hesabu.app.ui.onboarding

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.annotation.StringRes
import ke.hesabu.app.R

/**
 * Background-restriction guidance per OEM (master prompt §6: receivers get killed on Tecno, Infinix, Xiaomi).
 * Pure data plus the intents that open the right settings screen; the screen renders it.
 */
object OemGuidance {

    enum class Oem(@StringRes val nameRes: Int, @StringRes val stepsRes: Int) {
        Transsion(R.string.oem_transsion, R.string.oem_steps_transsion),
        Xiaomi(R.string.oem_xiaomi, R.string.oem_steps_xiaomi),
        Oppo(R.string.oem_oppo, R.string.oem_steps_oppo),
        Vivo(R.string.oem_vivo, R.string.oem_steps_vivo),
        Huawei(R.string.oem_huawei, R.string.oem_steps_huawei),
        Samsung(R.string.oem_samsung, R.string.oem_steps_samsung),
        Other(R.string.oem_other, R.string.oem_steps_other),
    }

    fun detect(manufacturer: String = Build.MANUFACTURER, brand: String = Build.BRAND): Oem {
        val m = (manufacturer + " " + brand).lowercase()
        return when {
            listOf("tecno", "infinix", "itel", "transsion").any { it in m } -> Oem.Transsion
            listOf("xiaomi", "redmi", "poco").any { it in m } -> Oem.Xiaomi
            listOf("oppo", "realme", "oneplus").any { it in m } -> Oem.Oppo
            "vivo" in m || "iqoo" in m -> Oem.Vivo
            "huawei" in m || "honor" in m -> Oem.Huawei
            "samsung" in m -> Oem.Samsung
            else -> Oem.Other
        }
    }

    /** The system's own "allow background activity" screen for this app; falls back to app details. */
    fun batterySettingsIntent(context: Context): Intent {
        val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        val ignore = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        return if (ignore.resolveActivity(context.packageManager) != null) ignore else details
    }

    fun appDetailsIntent(context: Context): Intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
}
