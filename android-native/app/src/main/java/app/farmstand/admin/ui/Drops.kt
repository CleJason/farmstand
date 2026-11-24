package app.farmstand.admin.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.Drop
import app.farmstand.admin.dayTimeText
import kotlinx.coroutines.launch
import java.time.Instant

@Composable
fun DropsScreen(api: Api, onAuthError: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var drops by remember { mutableStateOf<List<Drop>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<Drop>>("/api/drops") }?.let { drops = it }
    }
    LaunchedEffect(Unit) { load() }

    Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
        LazyColumn(Modifier.fillMaxWidth()) {
            item {
                ScreenTitle("Drops", "Tap a drop for what's sold") {
                    TextButton(onClick = { ctx.open(api.webUrl("/admin/drops")) }) { Text("Edit on web") }
                }
            }
            val list = drops
            if (list == null) {
                item { Muted("Loading…", Modifier.padding(16.dp)) }
                return@LazyColumn
            }
            val now = Instant.now()
            items(list, key = { it.id }) { d ->
                val state = when {
                    d.status == "DRAFT" -> "Draft"
                    d.isOpen(now) -> "Open now"
                    (d.opens?.isAfter(now) ?: false) -> "Opens ${d.opens!!.dayTimeText()}"
                    else -> "Closed"
                }
                val sold = d.dropProducts.sumOf { it.quantitySold }
                SectionCard(modifier = Modifier.clickable { expanded = if (expanded == d.id) null else d.id }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(d.title, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        Text(state, color = if (state == "Open now") Green else Stone)
                    }
                    Muted("Closes ${d.closes?.dayTimeText() ?: ""} · $sold sold")
                    if (expanded == d.id) {
                        d.dropProducts.forEach { dp ->
                            Row {
                                Text(dp.product?.name ?: "Item", Modifier.weight(1f))
                                Text(if (dp.quantityLimit != null) "${dp.quantitySold} / ${dp.quantityLimit}" else "${dp.quantitySold} sold")
                            }
                        }
                        if (d.pickupSlots.isNotEmpty()) {
                            Muted("Pickup: " + d.pickupSlots.joinToString("; ") { s ->
                                (app.farmstand.admin.parseInstant(s.pickupDate)?.dayTimeText() ?: "") + (s.location?.let { " · $it" } ?: "")
                            })
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
