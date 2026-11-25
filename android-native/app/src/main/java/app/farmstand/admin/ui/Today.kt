package app.farmstand.admin.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.sp
import app.farmstand.admin.Api
import app.farmstand.admin.Drop
import app.farmstand.admin.Order
import app.farmstand.admin.PAID_STATUSES
import app.farmstand.admin.Tab
import app.farmstand.admin.Thread
import app.farmstand.admin.ago
import app.farmstand.admin.bakeList
import app.farmstand.admin.dayText
import app.farmstand.admin.localDate
import app.farmstand.admin.money
import app.farmstand.admin.parseInstant
import app.farmstand.admin.timeText
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate

private val PICKUP_STATUSES = listOf("AWAITING_CONFIRM", "PAID", "READY", "PICKED_UP")

@Composable
fun TodayScreen(api: Api, onAuthError: () -> Unit, onUnread: (Int) -> Unit, goTo: (Tab) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<Order>?>(null) }
    var threads by remember { mutableStateOf<List<Thread>>(emptyList()) }
    var drops by remember { mutableStateOf<List<Drop>>(emptyList()) }
    var refreshing by remember { mutableStateOf(false) }
    var openOrder by remember { mutableStateOf<Order?>(null) }

    suspend fun load(quiet: Boolean = false) {
        ctx.attempt(onAuthError, quiet) { api.getAs<List<Order>>("/api/orders") }?.let { orders = it }
        ctx.attempt(onAuthError, true) { api.getAs<List<Thread>>("/api/messages") }?.let { t ->
            threads = t
            onUnread(t.sumOf { it.unread })
        }
        ctx.attempt(onAuthError, true) { api.getAs<List<Drop>>("/api/drops") }?.let { drops = it }
    }

    fun refresh() {
        scope.launch {
            refreshing = true
            load()
            refreshing = false
        }
    }

    // Stays fresh while it's left open on the counter
    AutoRefresh(Unit, 60_000) { first -> load(quiet = !first) }

    fun change(o: Order, status: String, notify: Boolean = true) {
        scope.launch {
            if (setOrderStatus(ctx, api, onAuthError, o.id, status, notify)) load()
        }
    }

    openOrder?.let { o ->
        OrderSheet(api, o, onAuthError, onDismiss = { openOrder = null }, onChanged = { scope.launch { load() } })
    }

    val all = orders
    Refreshable(refreshing, ::refresh) {
        LazyColumn(Modifier.fillMaxWidth()) {
            item { ScreenTitle("Today", LocalDate.now().dayText()) }
            if (all == null) {
                item { Muted("Loading…", Modifier.padding(16.dp)) }
                return@LazyColumn
            }
            val today = LocalDate.now()
            val pickups = all.filter { it.type == "DROP" && it.status in PICKUP_STATUSES && it.pickupAt?.localDate() == today }
                .sortedBy { it.pickupAt }
            val toPack = pickups.filter { it.status == "PAID" }
            val ready = pickups.count { it.status == "READY" }
            val done = pickups.count { it.status == "PICKED_UP" }
            val awaiting = all.filter { it.status == "AWAITING_CONFIRM" }.sortedBy { it.createdAt }
            val unread = threads.filter { it.unread > 0 }

            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("Pickups", "${pickups.size}", Modifier.weight(1f))
                    Stat("To pack", "${toPack.size}", Modifier.weight(1f))
                    Stat("Ready", "$ready", Modifier.weight(1f))
                    Stat("Done", "$done", Modifier.weight(1f))
                }
            }

            if (awaiting.isNotEmpty() || unread.isNotEmpty()) {
                item {
                    SectionCard("Needs you") {
                        if (unread.isNotEmpty()) {
                            Row(Modifier.fillMaxWidth().clickable { goTo(Tab.Messages) }, verticalAlignment = Alignment.CenterVertically) {
                                Text("💬 ${unread.sumOf { it.unread }} unread text${if (unread.sumOf { it.unread } == 1) "" else "s"}", Modifier.weight(1f))
                                Muted(unread.mapNotNull { parseInstant(it.last.createdAt) }.minOrNull()?.let { ago(it) } ?: "")
                            }
                        }
                        awaiting.forEach { o ->
                            HorizontalDivider()
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f).clickable { openOrder = o }) {
                                    Text("${o.who} · ${money(o.total)}", fontWeight = FontWeight.Medium)
                                    Muted("${o.paymentLabel} #${o.number} · ordered ${ago(o.created)}")
                                }
                                Button(
                                    onClick = { change(o, "PAID") },
                                    colors = ButtonDefaults.buttonColors(containerColor = Green),
                                ) { Text("Confirm paid") }
                            }
                        }
                    }
                }
            }

            item {
                SectionCard("Today's pickups") {
                    if (pickups.isEmpty()) Muted("No pickups today.")
                    if (toPack.size > 1) {
                        FilledTonalButton(onClick = {
                            scope.launch {
                                for (o in toPack) setOrderStatus(ctx, api, onAuthError, o.id, "READY", true)
                                load()
                            }
                        }) { Text("Mark all ${toPack.size} ready") }
                    }
                    pickups.forEachIndexed { i, o ->
                        if (i > 0) HorizontalDivider()
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f).clickable { openOrder = o }) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(o.pickupAt?.timeText() ?: "", fontWeight = FontWeight.SemiBold)
                                    Text(o.who, fontWeight = FontWeight.Medium)
                                }
                                Muted(o.items.joinToString(", ") { "${it.quantity}× ${it.displayName}" })
                                Spacer(Modifier.height(2.dp))
                                StatusChip(o.status)
                            }
                            when (o.status) {
                                "AWAITING_CONFIRM" -> SmallAction("Confirm paid") { change(o, "PAID") }
                                "PAID" -> SmallAction("Mark ready") { change(o, "READY") }
                                "READY" -> SmallAction("Picked up") { change(o, "PICKED_UP") }
                            }
                        }
                    }
                }
            }

            // Open drops running low
            val now = Instant.now()
            val low = drops.filter { it.isOpen(now) }.flatMap { d ->
                d.dropProducts.filter { it.quantityLimit != null && it.quantityLimit - it.quantitySold <= 3 }
                    .map { "${it.product?.name ?: "Item"}: ${maxOf(0, it.quantityLimit!! - it.quantitySold)} left" }
            }
            if (low.isNotEmpty()) {
                item {
                    SectionCard("Running low") { low.forEach { Text(it) } }
                }
            }

            // What to bake next: the next pickup day with paid orders
            val nextDay = all.filter { it.status in listOf("PAID", "READY") }.mapNotNull { it.pickupAt?.localDate() }
                .filter { it >= today }.minOrNull()
            if (nextDay != null) {
                val lines = bakeList(all.filter { it.pickupAt?.localDate() == nextDay })
                item {
                    SectionCard("Bake for ${if (nextDay == today) "today" else nextDay.dayText()}") {
                        lines.forEach { l ->
                            Row {
                                Text(l.name, Modifier.weight(1f))
                                Text("${l.count}", fontWeight = FontWeight.SemiBold)
                            }
                            l.extras.forEach { (n, c) -> Muted("    $n × $c") }
                        }
                    }
                }
            }

            // Revenue: last 7 days vs the 7 before (by order date, paid orders)
            val paid = all.filter { it.status in PAID_STATUSES }
            val weekStart = today.minusDays(6)
            val week = paid.filter { it.created.localDate() >= weekStart }.sumOf { it.total }
            val lastWeek = paid.filter { val d = it.created.localDate(); d >= weekStart.minusDays(7) && d < weekStart }.sumOf { it.total }
            item {
                SectionCard("Last 7 days") {
                    Text(money(week), fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    if (lastWeek > 0) {
                        val pct = ((week - lastWeek) * 100.0 / lastWeek).toInt()
                        Muted("${if (pct >= 0) "▲" else "▼"} ${kotlin.math.abs(pct)}% vs the week before (${money(lastWeek)})")
                    }
                    val days = (0..6).map { weekStart.plusDays(it.toLong()) }
                    val perDay = days.map { d -> paid.filter { it.created.localDate() == d }.sumOf { it.total } }
                    val max = maxOf(1, perDay.maxOrNull() ?: 1)
                    Row(Modifier.fillMaxWidth().height(70.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                        perDay.forEachIndexed { i, v ->
                            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                androidx.compose.foundation.layout.Box(
                                    Modifier.fillMaxWidth().height((4 + 46 * v / max).dp)
                                        .androidx_bg(MaterialTheme.colorScheme.primary),
                                )
                                Muted(days[i].dayOfWeek.name.take(1))
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

private fun Modifier.androidx_bg(c: androidx.compose.ui.graphics.Color) =
    this.then(Modifier.background(c, androidx.compose.foundation.shape.RoundedCornerShape(4.dp)))

@Composable
private fun Stat(label: String, value: String, modifier: Modifier) {
    androidx.compose.material3.Card(modifier) {
        Column(Modifier.padding(10.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Muted(label)
        }
    }
}
