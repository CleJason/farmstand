package app.farmstand.admin.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import app.farmstand.admin.Product
import app.farmstand.admin.dayTimeText
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant

private data class Editing(val drop: Drop?, val copy: Boolean)

class Ask(val title: String, val text: String, val action: () -> Unit)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DropsScreen(api: Api, onAuthError: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var drops by remember { mutableStateOf<List<Drop>?>(null) }
    var products by remember { mutableStateOf<List<Product>>(emptyList()) }
    var refreshing by remember { mutableStateOf(false) }
    var expanded by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Editing?>(null) }
    var confirm by remember { mutableStateOf<Ask?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<Drop>>("/api/drops") }?.let { drops = it }
        ctx.attempt(onAuthError, true) { api.getAs<List<Product>>("/api/products") }?.let { products = it }
    }
    LaunchedEffect(Unit) { load() }

    editing?.let { e ->
        DropEditor(api, onAuthError, e.drop, e.copy, products, pickupArea = "") { saved ->
            editing = null
            if (saved) scope.launch { load() }
        }
        return
    }

    confirm?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { confirm = null }, a.action) }

    fun setStatus(d: Drop, status: String) {
        scope.launch {
            ctx.attempt(onAuthError) { api.put("/api/drops/${d.id}", buildJsonObject { put("status", status) }) }?.let { load() }
        }
    }

    Box(Modifier.fillMaxSize()) {
        Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
            LazyColumn(Modifier.fillMaxWidth()) {
                item { ScreenTitle("Drops", "Tap a drop for details and actions") }
                val list = drops
                if (list == null) {
                    item { Muted("Loading…", Modifier.padding(16.dp)) }
                    return@LazyColumn
                }
                val now = Instant.now()
                items(list, key = { it.id }) { d ->
                    val closed = d.status == "CLOSED" || (d.closes?.isBefore(now) ?: false)
                    val state = when {
                        d.status == "DRAFT" -> "Draft"
                        closed -> "Closed"
                        (d.opens?.isAfter(now) ?: false) -> "Opens ${d.opens!!.dayTimeText()}"
                        else -> "Open now"
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
                                    (parseInstant(s.pickupDate)?.dayTimeText() ?: "") + (s.location?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "")
                                })
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                SmallAction("Edit") { editing = Editing(d, false) }
                                SmallAction("Copy") { editing = Editing(d, true) }
                                when {
                                    d.status == "DRAFT" -> SmallAction("Publish") {
                                        confirm = Ask("Publish \"${d.title}\"?", "Customers can see it and order when it opens.", { setStatus(d, "OPEN") })
                                    }
                                    !closed -> SmallAction("Close ordering") {
                                        confirm = Ask("Close this drop?", "Customers won't be able to order.", { setStatus(d, "CLOSED") })
                                    }
                                    d.status == "CLOSED" && !(d.closes?.isBefore(now) ?: true) -> SmallAction("Reopen") {
                                        confirm = Ask("Reopen \"${d.title}\"?", "Customers can order again until it closes.", { setStatus(d, "OPEN") })
                                    }
                                }
                                if (d.status != "DRAFT" && !closed && d.reminderSentAt == null) {
                                    SmallAction("Send last call now") {
                                        confirm = Ask(
                                            "Send the last call now?",
                                            "Everyone on Drop Alerts who hasn't ordered gets a text (or email). It only goes out once per drop.",
                                            {
                                                scope.launch {
                                                    ctx.attempt(onAuthError) { api.post("/api/drops/${d.id}/remind") }?.let { r ->
                                                        val o = runCatching { app.farmstand.admin.json.parseToJsonElement(r).jsonObject }.getOrNull()
                                                        ctx.toast("Reminder sent: ${o?.get("texts")?.jsonPrimitive?.intOrNull ?: 0} texts and ${o?.get("emails")?.jsonPrimitive?.intOrNull ?: 0} emails")
                                                        load()
                                                    }
                                                }
                                            },
                                        )
                                    }
                                }
                                SmallAction("Delete") {
                                    confirm = Ask("Delete \"${d.title}\"?", "This can't be undone.", {
                                        scope.launch { ctx.attempt(onAuthError) { api.delete("/api/drops/${d.id}") }?.let { load() } }
                                    })
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(88.dp)) }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { editing = Editing(null, false) },
            icon = { Icon(Icons.Filled.Add, null) },
            text = { Text("New drop") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
}
