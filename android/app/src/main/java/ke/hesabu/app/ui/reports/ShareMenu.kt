package ke.hesabu.app.ui.reports

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.reports.ReportArtefacts
import ke.hesabu.app.ui.theme.HesabuTheme

/**
 * The report's share action: a 48 dp icon button that opens two options, "Share image" (the WhatsApp hero PNG) and
 * "Share PDF". An option whose file the server has not made yet is disabled and says why in a second line.
 * The menu is a sheet with a rule border, no shadow.
 */
@Composable
fun ShareMenu(artefacts: ReportArtefacts, enabled: Boolean, onShare: (ShareKind) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }, enabled = enabled, modifier = Modifier.size(48.dp)) {
            Icon(Icons.Outlined.Share, contentDescription = stringResource(R.string.report_share), tint = HesabuTheme.colors.biro)
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            shape = RoundedCornerShape(8.dp),
            containerColor = HesabuTheme.colors.sheet,
            tonalElevation = 0.dp,
            shadowElevation = 0.dp,
            border = BorderStroke(1.dp, HesabuTheme.colors.rule),
        ) {
            ShareOption(
                label = stringResource(R.string.report_share_image),
                missingReason = stringResource(R.string.report_share_image_missing),
                available = !artefacts.heroPngUrl.isNullOrBlank(),
                onClick = { open = false; onShare(ShareKind.Image) },
            )
            ShareOption(
                label = stringResource(R.string.report_share_pdf),
                missingReason = stringResource(R.string.report_share_pdf_missing),
                available = !artefacts.pdfUrl.isNullOrBlank(),
                onClick = { open = false; onShare(ShareKind.Pdf) },
            )
        }
    }
}

@Composable
private fun ShareOption(label: String, missingReason: String, available: Boolean, onClick: () -> Unit) {
    DropdownMenuItem(
        enabled = available,
        onClick = onClick,
        text = {
            Column {
                Text(
                    label,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (available) HesabuTheme.colors.ink else HesabuTheme.colors.inkSoft,
                )
                if (!available) {
                    Text(missingReason, style = MaterialTheme.typography.bodySmall, color = HesabuTheme.colors.inkSoft)
                }
            }
        },
    )
}
