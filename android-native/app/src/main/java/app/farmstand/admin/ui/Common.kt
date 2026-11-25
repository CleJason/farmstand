package app.farmstand.admin.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.farmstand.admin.ApiException
import androidx.compose.material.icons.filled.ArrowBack
import androidx.lifecycle.repeatOnLifecycle

fun Context.toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

fun Context.open(url: String) {
    runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}

fun Context.call(phone: String) = open("tel:$phone")
fun Context.email(address: String) = open("mailto:$address")

/** Runs an API call; a signed-out answer sends you back to sign in, other errors show a message. */
suspend fun <T> Context.attempt(onAuthError: () -> Unit, quiet: Boolean = false, block: suspend () -> T): T? = try {
    block()
} catch (e: ApiException) {
    if (e.code == 401) onAuthError() else if (!quiet) toast(e.message ?: "Something went wrong")
    null
}

/**
 * Re-runs `block` every `everyMs` while the app is on screen (not in the
 * background). `first` is true on the first run after coming back, so only
 * that one reports errors; later background refreshes stay quiet.
 */
@Composable
fun AutoRefresh(key: Any?, everyMs: Long, block: suspend (first: Boolean) -> Unit) {
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.LaunchedEffect(key, owner) {
        owner.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            var first = true
            while (true) {
                block(first)
                first = false
                kotlinx.coroutines.delay(everyMs)
            }
        }
    }
}

@Composable
fun ScreenTitle(text: String, sub: String? = null, action: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 16.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            if (sub != null) Text(sub, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        action?.invoke()
    }
}

@Composable
fun SectionCard(title: String? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (title != null) Text(title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            content()
        }
    }
}

@Composable
fun StatusChip(status: String) {
    val (bg, fg) = when (status) {
        "PAID" -> Color(0x2210B981) to Green
        "AWAITING_CONFIRM" -> Color(0x22F59E0B) to AmberDark
        "READY" -> Color(0x223B82F6) to Blue
        "CANCELLED" -> Color(0x22EF4444) to Red
        "REFUNDED" -> Color(0x22A855F7) to Color(0xFF9333EA)
        else -> Color(0x2278716C) to Stone
    }
    Box(Modifier.background(bg, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Text(app.farmstand.admin.statusLabel(status), color = fg, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier) =
    Text(text, modifier = modifier, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
fun SmallAction(text: String, onClick: () -> Unit) =
    TextButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)) { Text(text) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Refreshable(refreshing: Boolean, onRefresh: () -> Unit, content: @Composable () -> Unit) {
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) { content() }
}

private val dateFmt = java.time.format.DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", java.util.Locale.US)
private val timeFmt = java.time.format.DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.US)

/** A tappable field that opens the phone's date picker. */
@Composable
fun DateField(label: String, date: java.time.LocalDate?, modifier: Modifier = Modifier, onChange: (java.time.LocalDate) -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    PickerField(label, date?.format(dateFmt) ?: "Pick a date", modifier) {
        val d = date ?: java.time.LocalDate.now()
        android.app.DatePickerDialog(ctx, { _, y, m, day -> onChange(java.time.LocalDate.of(y, m + 1, day)) }, d.year, d.monthValue - 1, d.dayOfMonth).show()
    }
}

/** A tappable field that opens the phone's time picker. */
@Composable
fun TimeField(label: String, time: java.time.LocalTime?, modifier: Modifier = Modifier, onChange: (java.time.LocalTime) -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    PickerField(label, time?.format(timeFmt) ?: "Pick a time", modifier) {
        val t = time ?: java.time.LocalTime.of(16, 0)
        android.app.TimePickerDialog(ctx, { _, h, min -> onChange(java.time.LocalTime.of(h, min)) }, t.hour, t.minute, false).show()
    }
}

@Composable
private fun PickerField(label: String, value: String, modifier: Modifier, onClick: () -> Unit) {
    androidx.compose.material3.OutlinedCard(onClick = onClick, modifier = modifier) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
            Muted(label)
            Text(value)
        }
    }
}

/** Plain text field used across the editors. */
@Composable
fun Field(
    label: String,
    value: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    number: Boolean = false,
    decimal: Boolean = false,
    lines: Int = 1,
    placeholder: String? = null,
    onChange: (String) -> Unit,
) {
    androidx.compose.material3.OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        singleLine = lines == 1,
        minLines = lines,
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            keyboardType = when {
                decimal -> androidx.compose.ui.text.input.KeyboardType.Decimal
                number -> androidx.compose.ui.text.input.KeyboardType.Number
                else -> androidx.compose.ui.text.input.KeyboardType.Text
            },
            capitalization = if (number || decimal) androidx.compose.ui.text.input.KeyboardCapitalization.None
            else androidx.compose.ui.text.input.KeyboardCapitalization.Sentences,
        ),
        modifier = modifier,
    )
}

/** Header for a full-screen editor: back arrow, title, and an action on the right. */
@Composable
fun EditorBar(title: String, onBack: () -> Unit, action: (@Composable () -> Unit)? = null) {
    Column {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            androidx.compose.material3.IconButton(onClick = onBack) {
                androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Filled.ArrowBack, "Back")
            }
            Text(title, Modifier.weight(1f), fontWeight = FontWeight.Bold, fontSize = 18.sp)
            action?.invoke()
        }
        androidx.compose.material3.HorizontalDivider()
    }
}

/** Yes/no question; `onYes` runs when confirmed. */
@Composable
fun ConfirmDialog(title: String, text: String, yes: String, onDismiss: () -> Unit, onYes: () -> Unit) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onDismiss(); onYes() }) { Text(yes) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

fun dollarsText(cents: Int?): String = cents?.let { "%.2f".format(java.util.Locale.US, it / 100.0) } ?: ""
fun centsOf(text: String): Int? = text.trim().removePrefix("$").toDoubleOrNull()?.let { Math.round(it * 100).toInt() }
