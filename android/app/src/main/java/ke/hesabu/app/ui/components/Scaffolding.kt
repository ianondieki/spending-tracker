package ke.hesabu.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import ke.hesabu.app.R
import ke.hesabu.app.ui.theme.HesabuTheme

/*
 * Quiet scaffolding shared by every screen. Paper behind, sheets on top, separated by colour alone. No shadows,
 * no eyebrows, no all-caps. Touch targets 48 dp. Each screen states its title as a heading for TalkBack.
 */

/** A screen: title as a heading, optional back arrow, scrolling column with 16 dp gutters. */
@Composable
fun HesabuScreen(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onBack: (() -> Unit)? = null,
    actions: (@Composable () -> Unit)? = null,
    scrollable: Boolean = true,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxSize()
            .background(HesabuTheme.colors.paper),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(start = if (onBack != null) 4.dp else 16.dp, end = 8.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.action_back))
                }
            }
            Column(Modifier.weight(1f).padding(vertical = 12.dp)) {
                Text(title, style = MaterialTheme.typography.headlineLarge, color = HesabuTheme.colors.ink, modifier = Modifier.semantics { heading() })
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 4.dp))
                }
            }
            if (actions != null) actions()
        }
        Column(
            Modifier
                .fillMaxWidth()
                .weight(1f)
                .then(if (scrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                .padding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Spacer(Modifier.height(0.dp))
            content()
            Spacer(Modifier.height(24.dp))
        }
    }
}

/** A raised ledger sheet: sheet colour, radius 8, 16 dp padding, no shadow. */
@Composable
fun Sheet(
    modifier: Modifier = Modifier,
    title: String? = null,
    padding: PaddingValues = PaddingValues(16.dp),
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier
            .fillMaxWidth()
            .background(HesabuTheme.colors.sheet, RoundedCornerShape(8.dp))
            .padding(padding),
    ) {
        if (title != null) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = HesabuTheme.colors.ink, modifier = Modifier.padding(bottom = 8.dp).semantics { heading() })
        }
        content()
    }
}

/** The one accent: a filled biro button, 48 dp tall, radius 4, no arrow appended. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.buttonColors(containerColor = HesabuTheme.colors.biro, contentColor = HesabuTheme.colors.onBiro),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(4.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = HesabuTheme.colors.biro),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun QuietButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    TextButton(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 48.dp), shape = RoundedCornerShape(4.dp)) {
        Text(text, style = MaterialTheme.typography.labelLarge, color = HesabuTheme.colors.biro)
    }
}

/** Empty state: what is missing, in one sentence, and the action that fills it. */
@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Sheet(modifier) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = HesabuTheme.colors.ink)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.padding(top = 4.dp))
        if (actionLabel != null && onAction != null) {
            SecondaryButton(actionLabel, onAction, Modifier.padding(top = 12.dp))
        }
    }
}

/** Loading: a short line of text and a small biro spinner. Skeleton rows come from [SkeletonRows]. */
@Composable
fun LoadingState(text: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 24.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(Modifier.size(20.dp), color = HesabuTheme.colors.biro, strokeWidth = 2.dp)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft)
    }
}

/** Skeleton ledger rows: rule-coloured bars where the label and amount will be. */
@Composable
fun SkeletonRows(count: Int = 4, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        repeat(count) {
            Row(Modifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(0.55f).height(12.dp).background(HesabuTheme.colors.rule, RoundedCornerShape(2.dp)))
                Spacer(Modifier.weight(0.25f))
                Spacer(Modifier.weight(0.2f).height(12.dp).background(HesabuTheme.colors.rule, RoundedCornerShape(2.dp)))
            }
            Rule()
        }
    }
}

/** Error: what happened and what to do. Warn colour is reserved for this. */
@Composable
fun ErrorState(title: String, body: String, modifier: Modifier = Modifier, retryLabel: String? = null, onRetry: (() -> Unit)? = null) {
    Sheet(modifier) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = HesabuTheme.colors.warn)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.ink, modifier = Modifier.padding(top = 4.dp))
        if (retryLabel != null && onRetry != null) SecondaryButton(retryLabel, onRetry, Modifier.padding(top = 12.dp))
    }
}

/** A labelled line of prose inside a sheet (a setting, a fact). */
@Composable
fun KeyValue(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = HesabuTheme.colors.inkSoft, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyLarge, color = HesabuTheme.colors.ink)
    }
}
