package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.Drop
import app.farmstand.admin.Product
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One pickup window as edited (local date and times). */
data class WindowForm(
    val id: String? = null,
    val date: LocalDate? = null,
    val start: LocalTime = LocalTime.of(16, 0),
    val end: LocalTime = LocalTime.of(18, 0),
    val location: String = "",
    val address: String = "",
    val interval: String = "30",
    val maxPerTime: String = "",
    val blocked: List<String> = emptyList(),
) {
    private fun at(t: LocalTime) = LocalDateTime.of(date, t).atZone(ZoneId.systemDefault()).toInstant()

    /** Every pickup time customers can pick in this window (ISO, as the website stores them). */
    fun times(): List<String> {
        if (date == null) return emptyList()
        val s = at(start).toEpochMilli()
        val e = if (end != start) at(end).toEpochMilli() else s
        val step = maxOf(5, interval.toIntOrNull() ?: 30) * 60_000L
        val out = mutableListOf<String>()
        var t = s
        while (t <= e && out.size < 200) {
            out += java.time.Instant.ofEpochMilli(t).toString().let { if (it.length == 20) it.dropLast(1) + ".000Z" else it }
            t += step
        }
        return out
    }

    fun label(): String {
        val day = date!!.format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US))
        val tf = DateTimeFormatter.ofPattern("h:mm a", Locale.US)
        return if (end != start) "$day · ${start.format(tf)}–${end.format(tf)}" else "$day · ${start.format(tf)}"
    }

    fun startIso(): String = at(start).toString()
    fun endIso(): String? = if (end != start) at(end).toString() else null
}

data class ProductForm(val productId: String, val limit: String = "", val price: String = "", val boxOff: Set<String> = emptySet())

private fun local(iso: String?): LocalDateTime? = iso?.let { parseInstant(it) }?.atZone(ZoneId.systemDefault())?.toLocalDateTime()

/** Create, edit or copy a drop: same fields and rules as the website's drop editor. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DropEditor(
    api: Api,
    onAuthError: () -> Unit,
    drop: Drop?, // null = new
    copy: Boolean,
    products: List<Product>,
    pickupArea: String,
    onDone: (saved: Boolean) -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val editingId = if (copy) null else drop?.id
    var title by remember { mutableStateOf(if (copy) "" else drop?.title ?: "This Week's Drop") }
    var description by remember { mutableStateOf(drop?.description ?: "") }
    var alertNote by remember { mutableStateOf(drop?.alertNote ?: "") }
    val open0 = if (copy) null else local(drop?.orderOpenAt)
    val close0 = if (copy) null else local(drop?.orderCloseAt)
    var openDate by remember { mutableStateOf(open0?.toLocalDate()) }
    var openTime by remember { mutableStateOf(open0?.toLocalTime() ?: LocalTime.of(9, 0)) }
    var closeDate by remember { mutableStateOf(close0?.toLocalDate()) }
    var closeTime by remember { mutableStateOf(close0?.toLocalTime() ?: LocalTime.of(21, 0)) }
    var maxOrders by remember { mutableStateOf(drop?.maxOrders?.toString() ?: "") }
    val windows = remember {
        (drop?.pickupSlots?.map { s ->
            val st = local(s.pickupDate)!!
            WindowForm(
                id = if (copy) null else s.id,
                date = if (copy) null else st.toLocalDate(),
                start = st.toLocalTime(),
                end = local(s.endDate)?.toLocalTime() ?: st.toLocalTime(),
                location = s.location ?: "",
                address = s.address ?: "",
                interval = (s.intervalMinutes.takeIf { it > 0 } ?: 30).toString(),
                maxPerTime = s.maxPerTime?.toString() ?: "",
                blocked = if (copy) emptyList() else s.blockedTimes,
            )
        } ?: listOf(WindowForm(location = pickupArea))).toMutableStateList()
    }
    // Products in the drop, in the order customers see them
    val chosen = remember {
        (drop?.dropProducts?.filter { dp -> !copy || products.any { it.id == dp.productId } }?.map { dp ->
            ProductForm(
                dp.productId,
                limit = dp.quantityLimit?.toString() ?: "",
                price = dollarsText(dp.priceOverride),
                boxOff = if (dp.boxOptions.isNotEmpty()) (dp.product?.boxOptions ?: emptyList()).filter { it !in dp.boxOptions }.toSet() else emptySet(),
            )
        } ?: emptyList()).toMutableStateList()
    }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var dirty by remember { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }

    LaunchedEffect(title, description, alertNote, openDate, openTime, closeDate, closeTime, maxOrders, windows.toList(), chosen.toList()) {
        dirty = true
    }
    LaunchedEffect(Unit) { dirty = false }

    BackHandler { if (dirty) leaving = true else onDone(false) }
    if (leaving) ConfirmDialog("Leave without saving?", "Your changes to this drop will be lost.", "Leave", { leaving = false }) { onDone(false) }

    fun save(status: String?) {
        error = null
        val od = openDate
        val cd = closeDate
        when {
            title.isBlank() -> error = "Give the drop a name."
            od == null || cd == null -> error = "Pick when ordering opens and closes."
            windows.none { it.date != null } -> error = "Add at least one pickup day and time."
            chosen.isEmpty() -> error = "Choose at least one product for this drop."
            chosen.any { pf -> val all = products.firstOrNull { it.id == pf.productId }?.boxOptions.orEmpty(); all.isNotEmpty() && all.all { it in pf.boxOff } } ->
                error = "A mix & match box needs at least one choice turned on."
        }
        if (error != null) return
        val zone = ZoneId.systemDefault()
        val body = buildJsonObject {
            put("title", title.trim())
            put("description", description)
            put("alertNote", alertNote)
            put("orderOpenAt", LocalDateTime.of(od, openTime).atZone(zone).toInstant().toString())
            put("orderCloseAt", LocalDateTime.of(cd, closeTime).atZone(zone).toInstant().toString())
            if (maxOrders.isBlank()) put("maxOrders", JsonNull) else put("maxOrders", maxOrders.trim())
            if (status != null) put("status", status)
            putJsonArray("pickupSlots") {
                windows.filter { it.date != null }.forEach { w ->
                    val times = w.times()
                    addJsonObject {
                        if (w.id != null) put("id", w.id)
                        put("label", w.label())
                        put("pickupDate", w.startIso())
                        w.endIso()?.let { put("endDate", it) } ?: put("endDate", JsonNull)
                        put("location", w.location)
                        put("address", w.address)
                        put("intervalMinutes", w.interval.toIntOrNull() ?: 30)
                        w.maxPerTime.toIntOrNull()?.let { put("maxPerTime", it) } ?: put("maxPerTime", JsonNull)
                        putJsonArray("blockedTimes") { w.blocked.filter { b -> times.any { t -> parseInstant(t) == parseInstant(b) } }.forEach { add(it) } }
                    }
                }
            }
            putJsonArray("products") {
                chosen.forEach { pf ->
                    val all = products.firstOrNull { it.id == pf.productId }?.boxOptions.orEmpty()
                    val on = all.filter { it !in pf.boxOff }
                    addJsonObject {
                        put("productId", pf.productId)
                        pf.limit.trim().toIntOrNull()?.let { put("quantityLimit", it) } ?: put("quantityLimit", JsonNull)
                        centsOf(pf.price)?.let { put("priceOverride", it) } ?: put("priceOverride", JsonNull)
                        putJsonArray("boxOptions") { if (on.size < all.size) on.forEach { add(it) } }
                    }
                }
            }
        }
        saving = true
        scope.launch {
            val ok = ctx.attempt(onAuthError) {
                if (editingId != null) api.put("/api/drops/$editingId", body) else api.post("/api/drops", body)
            }
            saving = false
            if (ok != null) onDone(true)
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(if (editingId != null) "Edit drop" else if (copy) "Copy drop" else "New drop", { if (dirty) leaving = true else onDone(false) })
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Field("Drop name", title) { title = it }
            Field("Description (optional)", description, lines = 3) { description = it }
            Field("Extra line for the 'now open' text (optional)", alertNote, placeholder = "e.g. last chance for fall flavors") { alertNote = it }

            Text("Ordering", fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DateField("Opens", openDate, Modifier.weight(1.4f)) { openDate = it }
                TimeField("at", openTime, Modifier.weight(1f)) { openTime = it }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DateField("Closes", closeDate, Modifier.weight(1.4f)) { closeDate = it }
                TimeField("at", closeTime, Modifier.weight(1f)) { closeTime = it }
            }
            Field("Max orders (blank = no limit)", maxOrders, number = true) { maxOrders = it.filter(Char::isDigit) }

            HorizontalDivider()
            Text("Pickup", fontWeight = FontWeight.SemiBold)
            windows.forEachIndexed { i, w ->
                SectionCard(modifier = Modifier.padding(0.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Pickup window ${i + 1}", Modifier.weight(1f), fontWeight = FontWeight.Medium)
                        if (windows.size > 1) TextButton(onClick = { windows.removeAt(i) }) { Text("Remove", color = Red) }
                    }
                    DateField("Day", w.date) { windows[i] = w.copy(date = it) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TimeField("From", w.start, Modifier.weight(1f)) { windows[i] = w.copy(start = it) }
                        TimeField("To", w.end, Modifier.weight(1f)) { windows[i] = w.copy(end = it) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field("Every (min)", w.interval, Modifier.weight(1f), number = true) { windows[i] = w.copy(interval = it.filter(Char::isDigit)) }
                        Field("Max per time", w.maxPerTime, Modifier.weight(1f), number = true) { windows[i] = w.copy(maxPerTime = it.filter(Char::isDigit)) }
                    }
                    Field("Pickup area (public)", w.location) { windows[i] = w.copy(location = it) }
                    Field("Exact address (sent after payment)", w.address) { windows[i] = w.copy(address = it) }
                    if (w.date != null) {
                        val times = w.times()
                        if (times.size > 1) {
                            Muted("Tap a time to close or reopen it:")
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                times.forEach { t ->
                                    val closed = w.blocked.any { parseInstant(it) == parseInstant(t) }
                                    FilterChip(
                                        selected = !closed,
                                        onClick = {
                                            windows[i] = w.copy(blocked = if (closed) w.blocked.filter { parseInstant(it) != parseInstant(t) } else w.blocked + t)
                                        },
                                        label = {
                                            Text(parseInstant(t)!!.atZone(ZoneId.systemDefault()).toLocalTime().format(DateTimeFormatter.ofPattern("h:mm", Locale.US)) + if (closed) " ✕" else "")
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
            OutlinedButton(onClick = { windows.add(windows.last().copy(id = null, date = null, blocked = emptyList())) }) { Text("+ Add pickup window") }

            HorizontalDivider()
            Text("Products", fontWeight = FontWeight.SemiBold)
            Muted("Ticked products are in the drop, in this order. Blank limit = unlimited, blank price = regular price.")
            chosen.forEachIndexed { i, pf ->
                val p = products.firstOrNull { it.id == pf.productId }
                SectionCard(modifier = Modifier.padding(0.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(true, { chosen.removeAt(i) })
                        Column(Modifier.weight(1f)) {
                            Text(p?.name ?: "Product", fontWeight = FontWeight.Medium)
                            Muted(app.farmstand.admin.money(p?.price ?: 0))
                        }
                        IconButton(onClick = { if (i > 0) { val x = chosen.removeAt(i); chosen.add(i - 1, x) } }, enabled = i > 0) { Icon(Icons.Filled.ArrowUpward, "Move up") }
                        IconButton(onClick = { if (i < chosen.lastIndex) { val x = chosen.removeAt(i); chosen.add(i + 1, x) } }, enabled = i < chosen.lastIndex) { Icon(Icons.Filled.ArrowDownward, "Move down") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field("Limit", pf.limit, Modifier.weight(1f), number = true) { chosen[i] = pf.copy(limit = it.filter(Char::isDigit)) }
                        Field("Price this drop $", pf.price, Modifier.weight(1f), decimal = true) { chosen[i] = pf.copy(price = it) }
                    }
                    val opts = p?.boxOptions.orEmpty()
                    if (opts.isNotEmpty()) {
                        Muted("Choices offered this drop:")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            opts.forEach { o ->
                                val on = o !in pf.boxOff
                                FilterChip(on, { chosen[i] = pf.copy(boxOff = if (on) pf.boxOff + o else pf.boxOff - o) }, label = { Text(o) })
                            }
                        }
                    }
                }
            }
            val others = products.filter { p -> p.active && chosen.none { it.productId == p.id } }
                .groupBy { it.category?.trim()?.ifBlank { null } ?: "No category" }
                .toSortedMap(compareBy<String> { it == "No category" }.thenBy { it })
            others.forEach { (cat, list) ->
                Muted(cat, Modifier.padding(top = 6.dp))
                list.sortedBy { it.name }.forEach { p ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(false, { chosen.add(ProductForm(p.id)) })
                        Text(p.name, Modifier.weight(1f))
                        Muted(app.farmstand.admin.money(p.price))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        HorizontalDivider()
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            error?.let { Text(it, color = Red) }
            val published = drop != null && !copy && drop.status != "DRAFT"
            if (published) {
                Button(onClick = { save(null) }, enabled = !saving, modifier = Modifier.fillMaxWidth()) { Text(if (saving) "Saving…" else "Save changes") }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { save("DRAFT") }, enabled = !saving, modifier = Modifier.weight(1f)) { Text("Save as draft") }
                    Button(onClick = { save("OPEN") }, enabled = !saving, modifier = Modifier.weight(1f)) { Text(if (saving) "Saving…" else "Publish") }
                }
            }
        }
    }
}
