package ke.hesabu.app.diagnostics

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import ke.hesabu.app.MainActivity
import ke.hesabu.app.R

/**
 * Shows the crash report [CrashReporter] produced. Plain views on purpose: the crash may be inside Compose, so this
 * screen depends on nothing the rest of the app does, and it runs in its own process (`:crash`, see the manifest).
 */
class CrashActivity : Activity() {

    companion object {
        const val EXTRA_REPORT = "ke.hesabu.app.CRASH_REPORT"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val report = intent.getStringExtra(EXTRA_REPORT) ?: getString(R.string.crash_no_report)
        val pad = dp(24)

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(text(getString(R.string.crash_title), 20f, bold = true))
        column.addView(text(getString(R.string.crash_body), 15f).apply { setPadding(0, dp(8), 0, dp(16)) })

        val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actions.addView(button(getString(R.string.crash_copy)) { copy(report) })
        actions.addView(button(getString(R.string.crash_share)) { share(report) })
        column.addView(actions)
        column.addView(button(getString(R.string.crash_restart)) { restart() })

        column.addView(
            text(report, 12f).apply {
                typeface = Typeface.MONOSPACE
                setTextIsSelectable(true)
                setPadding(0, dp(16), 0, 0)
            },
        )
        setContentView(ScrollView(this).apply { addView(column) })
    }

    private fun copy(report: String) {
        (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Hesabu crash", report))
        Toast.makeText(this, R.string.crash_copied, Toast.LENGTH_SHORT).show()
    }

    private fun share(report: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, getString(R.string.crash_title))
            .putExtra(Intent.EXTRA_TEXT, report)
        runCatching { startActivity(Intent.createChooser(send, getString(R.string.crash_share))) }
    }

    private fun restart() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        finish()
    }

    private fun text(value: String, sizeSp: Float, bold: Boolean = false) = TextView(this).apply {
        text = value
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun button(label: String, onClick: () -> Unit) = Button(this).apply {
        text = label
        minHeight = dp(48)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
