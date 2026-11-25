package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
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
import androidx.compose.ui.unit.sp
import app.farmstand.admin.Api
import app.farmstand.admin.Product
import app.farmstand.admin.dayText
import app.farmstand.admin.json
import app.farmstand.admin.money
import app.farmstand.admin.parseInstant
import app.farmstand.admin.timeText
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

@Serializable
data class StandItem(
    val id: String,
    val name: String,
    val description: String? = null,
    val price: Int = 0,
    val imageUrl: String? = null,
    val imagePosition: String? = null,
    val available: Boolean = true,
    val quantityAvailable: Int = 0,
    val quantitySold: Int = 0,
)

@Serializable
data class StandHours(val id: String, val startsAt: String, val endsAt: String)

private fun hoursLabel(h: StandHours): String {
    val s = parseInstant(h.startsAt) ?: return ""
    val e = parseInstant(h.endsAt) ?: return ""
    return "${s.dayText()} · ${s.timeText()}–${e.timeText()}"
}

@Composable
fun FarmstandScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<StandItem>?>(null) }
    var hours by remember { mutableStateOf<List<StandHours>>(emptyList()) }
    var editing by remember { mutableStateOf<StandItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    var editHours by remember { mutableStateOf<StandHours?>(null) }
    var newHours by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<StandItem>>("/api/farmstand") }?.let { items = it }
        ctx.attempt(onAuthError, true) { api.getAs<List<StandHours>>("/api/stand-hours") }?.let { hours = it }
    }
    LaunchedEffect(Unit) { load() }

    if (editing != null || creating) {
        StandItemEditor(api, onAuthError, editing) { saved -> editing = null; creating = false; if (saved) scope.launch { load() } }
        return
    }
    if (editHours != null || newHours) {
        HoursEditor(api, onAuthError, editHours) { saved -> editHours = null; newHours = false; if (saved) scope.launch { load() } }
        return
    }
    BackHandler(onBack = onBack)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }, a.action) }

    fun update(item: StandItem, body: JsonObject) {
        scope.launch { ctx.attempt(onAuthError) { api.put("/api/farmstand/${item.id}", body) }?.let { load() } }
    }

    fun notify() {
        scope.launch {
            val r = ctx.attempt(onAuthError) { api.post("/api/stand-hours/notify", buildJsonObject { put("skipDropId", JsonNull); put("confirm", false) }) } ?: return@launch
            val o = json.parseToJsonElement(r).jsonObject
            val n = { k: String -> o[k]?.jsonPrimitive?.intOrNull ?: 0 }
            ask = Ask(
                "Tell ${n("people")} people the stand is open?",
                "${n("texts")} texts and ${n("emails")} emails, listing:\n" + hours.joinToString("\n") { hoursLabel(it) },
            ) {
                scope.launch {
                    ctx.attempt(onAuthError) { api.post("/api/stand-hours/notify", buildJsonObject { put("skipDropId", JsonNull); put("confirm", true) }) }?.let { res ->
                        val d = json.parseToJsonElement(res).jsonObject
                        val queued = d["scheduledFor"]?.jsonPrimitive?.content
                        ctx.toast(if (queued != null && queued != "null") "Outside texting hours, so it's queued to go out later." else "Sent: ${d["texts"]?.jsonPrimitive?.content} texts and ${d["emails"]?.jsonPrimitive?.content} emails")
                    }
                }
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Farm stand", onBack) { TextButton(onClick = { creating = true }) { Text("+ Item") } }
        LazyColumn(Modifier.fillMaxWidth()) {
            item {
                SectionCard("Open hours") {
                    if (hours.isEmpty()) Muted("No upcoming hours.")
                    hours.forEach { h ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(hoursLabel(h), Modifier.weight(1f).clickable { editHours = h })
                            TextButton(onClick = {
                                ask = Ask("Remove ${hoursLabel(h)}?", "", {
                                    scope.launch { ctx.attempt(onAuthError) { api.delete("/api/stand-hours?id=${URLEncoder.encode(h.id, "UTF-8")}") }?.let { load() } }
                                })
                            }) { Text("Remove", color = Red) }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { newHours = true }) { Text("+ Add hours") }
                        if (hours.isNotEmpty()) FilledTonalButton(onClick = ::notify) { Text("Notify subscribers") }
                    }
                }
            }
            val list = items
            if (list == null) {
                item { Muted("Loading…", Modifier.padding(16.dp)) }
                return@LazyColumn
            }
            if (list.isEmpty()) item { Muted("No items yet. Tap + Item.", Modifier.padding(16.dp)) }
            items(list, key = { it.id }) { item ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Thumb(api, item.imageUrl, 56)
                        Column(Modifier.weight(1f).clickable { editing = item }) {
                            Text(item.name, fontWeight = FontWeight.SemiBold)
                            Muted("${money(item.price)} · sold ${item.quantitySold} · left ${maxOf(0, item.quantityAvailable - item.quantitySold)}")
                        }
                        Switch(item.available, { update(item, buildJsonObject { put("available", it) }) })
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Stock", Modifier.weight(1f))
                        OutlinedButton(onClick = { update(item, buildJsonObject { put("quantityAvailable", maxOf(0, item.quantityAvailable - 1)) }) }) { Text("−") }
                        Text("  ${item.quantityAvailable}  ", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                        OutlinedButton(onClick = { update(item, buildJsonObject { put("quantityAvailable", item.quantityAvailable + 1) }) }) { Text("+") }
                    }
                    Row {
                        SmallAction("Reset sold count") {
                            ask = Ask("Reset sold count for ${item.name}?", "", { update(item, buildJsonObject { put("quantitySold", 0) }) })
                        }
                        SmallAction("Remove") {
                            ask = Ask("Remove ${item.name}?", "", {
                                scope.launch { ctx.attempt(onAuthError) { api.delete("/api/farmstand/${item.id}") }?.let { load() } }
                            })
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun HoursEditor(api: Api, onAuthError: () -> Unit, h: StandHours?, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val zone = ZoneId.systemDefault()
    val s0 = h?.let { parseInstant(it.startsAt)?.atZone(zone)?.toLocalDateTime() }
    val e0 = h?.let { parseInstant(it.endsAt)?.atZone(zone)?.toLocalDateTime() }
    var date by remember { mutableStateOf(s0?.toLocalDate() ?: LocalDate.now()) }
    var from by remember { mutableStateOf(s0?.toLocalTime() ?: LocalTime.of(9, 0)) }
    var to by remember { mutableStateOf(e0?.toLocalTime() ?: LocalTime.of(14, 0)) }
    BackHandler { onDone(false) }
    Column(Modifier.fillMaxSize()) {
        EditorBar(if (h == null) "Add open hours" else "Edit open hours", { onDone(false) })
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            DateField("Day", date) { date = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TimeField("From", from, Modifier.weight(1f)) { from = it }
                TimeField("To", to, Modifier.weight(1f)) { to = it }
            }
            Button(modifier = Modifier.fillMaxWidth(), onClick = {
                scope.launch {
                    val body = buildJsonObject {
                        if (h != null) put("id", h.id)
                        put("startsAt", LocalDateTime.of(date, from).atZone(zone).toInstant().toString())
                        put("endsAt", LocalDateTime.of(date, to).atZone(zone).toInstant().toString())
                    }
                    ctx.attempt(onAuthError) { if (h == null) api.post("/api/stand-hours", body) else api.put("/api/stand-hours", body) }?.let { onDone(true) }
                }
            }) { Text("Save") }
        }
    }
}

@Composable
private fun StandItemEditor(api: Api, onAuthError: () -> Unit, item: StandItem?, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(item?.name ?: "") }
    var description by remember { mutableStateOf(item?.description ?: "") }
    var price by remember { mutableStateOf(dollarsText(item?.price)) }
    var qty by remember { mutableStateOf(item?.quantityAvailable?.toString() ?: "5") }
    var imageUrl by remember { mutableStateOf(item?.imageUrl) }
    var imagePosition by remember { mutableStateOf(item?.imagePosition) }
    var uploading by remember { mutableStateOf(false) }
    var catalog by remember { mutableStateOf<List<Product>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        if (item == null) ctx.attempt(onAuthError, true) { api.getAs<List<Product>>("/api/products") }?.let { catalog = it.filter { p -> p.active } }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            uploading = true
            scope.launch {
                photoBytes(ctx, uri)?.let { b -> ctx.attempt(onAuthError) { api.upload(b, "image/jpeg", "photo.jpg") }?.let { imageUrl = it; imagePosition = null } }
                uploading = false
            }
        }
    }
    BackHandler { onDone(false) }
    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(if (item == null) "New stand item" else "Edit stand item", { onDone(false) })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (catalog.isNotEmpty()) {
                Muted("Fill in from a product (optional):")
                catalog.sortedBy { it.name }.take(40).forEach { p ->
                    Text(p.name, Modifier.fillMaxWidth().clickable {
                        name = p.name; description = p.description ?: ""; price = dollarsText(p.price); imageUrl = p.imageUrl; imagePosition = p.imagePosition
                    }.padding(vertical = 6.dp))
                }
                HorizontalDivider()
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Thumb(api, imageUrl, 80)
                OutlinedButton(onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !uploading) {
                    Text(if (uploading) "Uploading…" else "Photo")
                }
                if (imageUrl != null) TextButton(onClick = { imageUrl = null }) { Text("Remove") }
            }
            Field("Name", name) { name = it }
            Field("Price $", price, decimal = true) { price = it }
            Field("Description", description, lines = 3) { description = it }
            Field("How many available", qty, number = true) { qty = it.filter(Char::isDigit) }
        }
        Column(Modifier.padding(12.dp)) {
            error?.let { Text(it, color = Red) }
            Button(modifier = Modifier.fillMaxWidth(), enabled = !uploading, onClick = {
                val cents = centsOf(price)
                if (name.isBlank() || cents == null) { error = "Enter a name and price."; return@Button }
                val body = buildJsonObject {
                    put("name", name.trim())
                    put("description", description.ifBlank { null })
                    put("price", cents)
                    put("imageUrl", imageUrl)
                    put("imagePosition", if (imageUrl != null) imagePosition else null)
                    put("quantityAvailable", qty.toIntOrNull() ?: 0)
                    if (item == null) put("available", true)
                }
                scope.launch {
                    ctx.attempt(onAuthError) { if (item == null) api.post("/api/farmstand", body) else api.put("/api/farmstand/${item.id}", body) }?.let { onDone(true) }
                }
            }) { Text("Save") }
        }
    }
}
