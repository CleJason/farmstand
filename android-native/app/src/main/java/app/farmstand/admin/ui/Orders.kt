package app.farmstand.admin.ui

import android.content.Context
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import app.farmstand.admin.Order
import app.farmstand.admin.PAID_STATUSES
import app.farmstand.admin.bakeList
import app.farmstand.admin.dayText
import app.farmstand.admin.dayTimeText
import app.farmstand.admin.localDate
import app.farmstand.admin.money
import app.farmstand.admin.timeText
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate

/** Change an order's status (with `notify`, the customer hears about it, same as the website). */
suspend fun setOrderStatus(ctx: Context, api: Api, onAuthError: () -> Unit, id: String, status: String, notify: Boolean): Boolean =
    ctx.attempt(onAuthError) {
        api.put("/api/orders/$id", buildJsonObject { put("status", status); put("notify", notify) })
        true
    } ?: false

private enum class Filter(val label: String, val match: (Order) -> Boolean) {
    Active("Active", { it.status in listOf("AWAITING_CONFIRM", "PAID", "READY") }),
    Awaiting("Awaiting payment", { it.status == "AWAITING_CONFIRM" }),
    Paid("Paid", { it.status == "PAID" }),
    Ready("Ready", { it.status == "READY" }),
    PickedUp("Picked up", { it.status == "PICKED_UP" }),
    Closed("Cancelled", { it.status in listOf("CANCELLED", "REFUNDED") }),
    All("All", { true }),
}

@Composable
fun OrdersScreen(api: Api, onAuthError: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<Order>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var filter by remember { mutableStateOf(Filter.Active) }
    var showBake by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var open by remember { mutableStateOf<Order?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<Order>>("/api/orders") }?.let { orders = it }
    }
    LaunchedEffect(Unit) { load() }

    open?.let { o ->
        OrderSheet(api, o, onAuthError, onDismiss = { open = null }, onChanged = { scope.launch { load() } })
    }

    Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
        LazyColumn(Modifier.fillMaxWidth()) {
            item {
                ScreenTitle("Orders")
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                    SegmentedButton(!showBake, { showBake = false }, SegmentedButtonDefaults.itemShape(0, 2)) { Text("Orders") }
                    SegmentedButton(showBake, { showBake = true }, SegmentedButtonDefaults.itemShape(1, 2)) { Text("Bake list") }
                }
            }
            val all = orders
            if (all == null) {
                item { Muted("Loading…", Modifier.padding(16.dp)) }
                return@LazyColumn
            }
            if (showBake) {
                // Paid orders with a pickup from today on, one card per pickup day
                val today = LocalDate.now()
                val byDay = all.filter { it.status in PAID_STATUSES && it.type == "DROP" }
                    .groupBy { it.pickupAt?.localDate() }
                    .filterKeys { it != null && it >= today }
                    .toSortedMap(compareBy { it })
                if (byDay.isEmpty()) item { Muted("Nothing to bake yet.", Modifier.padding(16.dp)) }
                byDay.forEach { (day, list) ->
                    item {
                        SectionCard("${day!!.dayText()} · ${list.size} order${if (list.size == 1) "" else "s"}") {
                            bakeList(list).forEach { l ->
                                Row {
                                    Text(l.name, Modifier.weight(1f))
                                    Text("${l.count}", fontWeight = FontWeight.SemiBold)
                                }
                                l.extras.forEach { (n, c) -> Muted("    $n × $c") }
                            }
                        }
                    }
                }
                return@LazyColumn
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Filter.entries.forEach { f ->
                        val n = all.count(f.match)
                        FilterChip(filter == f, { filter = f }, label = { Text(if (f == Filter.All) f.label else "${f.label} $n") })
                    }
                }
                OutlinedTextField(
                    search, { search = it },
                    placeholder = { Text("Search name, #, email, phone") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }
            val q = search.trim().lowercase()
            val shown = all.filter(filter.match).filter {
                q.isEmpty() || listOfNotNull(it.who, it.number, it.email, it.phone, it.drop?.title).any { s -> s.lowercase().contains(q) }
            }
            // Group by pickup day (soonest first for active orders, newest first otherwise)
            val groups = shown.groupBy { it.pickupAt?.localDate() }
            val keys = groups.keys.sortedWith(compareBy<LocalDate?> { it == null }.thenBy { it })
                .let { if (filter == Filter.Active || filter == Filter.Awaiting || filter == Filter.Paid || filter == Filter.Ready) it else it.reversed() }
            if (shown.isEmpty()) item { Muted("No orders here.", Modifier.padding(16.dp)) }
            keys.forEach { day ->
                val list = groups[day].orEmpty().sortedBy { it.pickupAt }
                item {
                    Text(
                        day?.dayText() ?: "No pickup time",
                        Modifier.padding(start = 16.dp, top = 12.dp, bottom = 2.dp),
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                items(list, key = { it.id }) { o -> OrderRow(o) { open = o } }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun OrderRow(o: Order, onClick: () -> Unit) {
    SectionCard(modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(o.who, fontWeight = FontWeight.SemiBold)
                Muted("#${o.number} · ${o.pickupAt?.timeText() ?: o.type.lowercase()} · ${o.paymentLabel}")
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(money(o.total), fontWeight = FontWeight.SemiBold)
                StatusChip(o.status)
            }
        }
        Muted(o.items.joinToString(", ") { "${it.quantity}× ${it.displayName}" })
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun OrderSheet(api: Api, o: Order, onAuthError: () -> Unit, onDismiss: () -> Unit, onChanged: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var confirmCancel by remember { mutableStateOf(false) }
    var messaging by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    fun change(status: String, notify: Boolean = true) {
        busy = true
        scope.launch {
            if (setOrderStatus(ctx, api, onAuthError, o.id, status, notify)) {
                onChanged()
                onDismiss()
            }
            busy = false
        }
    }

    fun post(path: String, done: String) {
        busy = true
        scope.launch {
            ctx.attempt(onAuthError) { api.post(path) }?.let { ctx.toast(done); onChanged() }
            busy = false
        }
    }

    if (confirmCancel) {
        val paid = o.status in listOf("PAID", "READY")
        val card = o.paymentMethod == "STRIPE" && paid
        AlertDialog(
            onDismissRequest = { confirmCancel = false },
            title = { Text("Cancel order #${o.number}?") },
            text = {
                Text(
                    (if (card) "${money(o.total)} will be refunded to their card. " else "") +
                        (if (paid && o.email != null) "Email ${o.email} that it was cancelled?" else ""),
                )
            },
            confirmButton = {
                if (paid && o.email != null) {
                    TextButton(onClick = { confirmCancel = false; change("CANCELLED", true) }) { Text("Cancel + email") }
                }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = { confirmCancel = false }) { Text("Keep it") }
                    TextButton(onClick = { confirmCancel = false; change("CANCELLED", false) }) {
                        Text(if (paid && o.email != null) "Cancel quietly" else "Cancel order", color = Red)
                    }
                }
            },
        )
    }

    if (messaging) MessageCustomerDialog(api, o, onAuthError) { messaging = false }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(o.who, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Muted("Order #${o.number} · placed ${java.time.Instant.parse(o.createdAt).dayTimeText()}")
                }
                StatusChip(o.status)
            }
            o.pickupAt?.let { Text("Pickup: ${it.dayTimeText()}" + (o.pickupSlot?.location?.let { l -> " · $l" } ?: "")) }
            o.drop?.title?.let { Muted(it) }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                o.phone?.let { p ->
                    OutlinedButton(onClick = { ctx.call(p) }) { Text("Call") }
                }
                if (o.phone != null || o.email != null) {
                    OutlinedButton(onClick = { messaging = true }) { Text("Message") }
                }
                o.email?.let { e -> OutlinedButton(onClick = { ctx.email(e) }) { Text("Email") } }
            }
            listOfNotNull(o.phone, o.email).forEach { Muted(it) }

            HorizontalDivider()
            o.items.forEach { item ->
                Row {
                    Text("${item.quantity}× ${item.displayName}", Modifier.weight(1f))
                    Text(money(item.priceAtPurchase * item.quantity))
                }
                item.picks.forEach { (n, c) -> Muted("    $n × $c") }
                item.addOnNames.forEach { Muted("    + $it") }
            }
            if (o.discount > 0) Row { Muted("Discount ${o.discountCode ?: ""}", Modifier.weight(1f)); Muted("−${money(o.discount)}") }
            if (o.giftAmount > 0) Row { Muted("Gift card", Modifier.weight(1f)); Muted("−${money(o.giftAmount)}") }
            Row {
                Text("Total", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                Text(money(o.total), fontWeight = FontWeight.Bold)
            }
            Muted("Paid by ${o.paymentLabel}" + (o.manualPaymentRef?.let { " · ref $it" } ?: ""))
            o.notes?.takeIf { it.isNotBlank() }?.let { SectionCard("Notes", Modifier.padding(0.dp)) { Text(it) } }

            HorizontalDivider()
            when (o.status) {
                "AWAITING_CONFIRM" -> Button(
                    onClick = { change("PAID") }, enabled = !busy, modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Green),
                ) { Text("✓ Confirm payment") }
                "PAID" -> Button(onClick = { change("READY") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Mark ready") }
                "READY" -> {
                    Button(
                        onClick = { change("PICKED_UP") }, enabled = !busy, modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Green),
                    ) { Text("✓ Picked up") }
                    OutlinedButton(onClick = { change("PICKED_UP", false) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                        Text("Picked up, no review request")
                    }
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (o.status in listOf("PAID", "READY") && o.type != "GIFT") {
                    TextButton(onClick = { post("/api/orders/${o.id}/resend", "Confirmation sent") }, enabled = !busy) { Text("Resend confirmation") }
                }
                if (o.status in PAID_STATUSES && o.type != "GIFT") {
                    TextButton(onClick = { post("/api/orders/${o.id}/review-request", "Review request sent") }, enabled = !busy) {
                        Text(if (o.reviewRequestedAt != null) "Ask for review again" else "Ask for a review")
                    }
                }
                if (o.status !in listOf("CANCELLED", "REFUNDED", "PICKED_UP")) {
                    TextButton(onClick = { confirmCancel = true }, enabled = !busy) { Text("Cancel order", color = Red) }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun MessageCustomerDialog(api: Api, o: Order, onAuthError: () -> Unit, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("Hi ${o.who.split(" ").first()}! ") }
    var via by remember { mutableStateOf(if (o.phone != null) (if (o.email != null) "both" else "text") else "email") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Message ${o.who}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(text, { text = it }, minLines = 4, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOfNotNull(
                        if (o.phone != null) "text" to "Text" else null,
                        if (o.email != null) "email" to "Email" else null,
                        if (o.phone != null && o.email != null) "both" to "Both" else null,
                    ).forEach { (v, l) -> FilterChip(via == v, { via = v }, label = { Text(l) }) }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && text.isNotBlank(), onClick = {
                busy = true
                scope.launch {
                    ctx.attempt(onAuthError) {
                        api.post("/api/orders/${o.id}/message", buildJsonObject { put("message", text); put("via", via) })
                    }?.let { ctx.toast("Sent"); onClose() }
                    busy = false
                }
            }) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Close") } },
    )
}
