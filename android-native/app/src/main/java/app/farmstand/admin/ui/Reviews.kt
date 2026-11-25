package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.unit.sp
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.json
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

@Serializable
data class Review(
    val id: String,
    val name: String = "",
    val rating: Int = 5,
    val body: String = "",
    val source: String? = null,
    val products: String? = null,
    val reply: String? = null,
    val reviewDate: String = "",
    val visible: Boolean = true,
    val email: String? = null,
    val orderId: String? = null,
    val images: List<String> = emptyList(),
)

private fun stars(n: Int) = "★".repeat(n.coerceIn(0, 5)) + "☆".repeat(5 - n.coerceIn(0, 5))

@Composable
fun ReviewsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var reviews by remember { mutableStateOf<List<Review>?>(null) }
    var editing by remember { mutableStateOf<Review?>(null) }
    var creating by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    var days by remember { mutableStateOf("") }
    var percent by remember { mutableStateOf("") }
    suspend fun load() { ctx.attempt(onAuthError) { api.getAs<List<Review>>("/api/reviews") }?.let { reviews = it } }
    LaunchedEffect(Unit) {
        load()
        ctx.attempt(onAuthError, true) { api.get("/api/settings/reviews") }?.let { r ->
            val o = json.parseToJsonElement(r).jsonObject
            days = o["days"]?.jsonPrimitive?.content ?: ""
            percent = o["percent"]?.jsonPrimitive?.content ?: ""
        }
    }
    fun setVisible(r: Review, v: Boolean) {
        scope.launch { ctx.attempt(onAuthError) { api.put("/api/reviews/${r.id}", buildJsonObject { put("visible", v) }) }?.let { load() } }
    }

    if (editing != null || creating) {
        ReviewEditor(api, onAuthError, editing) { saved -> editing = null; creating = false; if (saved) scope.launch { load() } }
        return
    }
    BackHandler(onBack = onBack)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }, a.action) }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Reviews", onBack) { TextButton(onClick = { creating = true }) { Text("+ Review") } }
        LazyColumn {
            item {
                SectionCard("Asking for reviews") {
                    Muted("About a day after an order is marked Picked Up, the customer gets a review link. New reviews stay hidden until you approve them.")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Field("Ask at most every (days)", days, Modifier.weight(1f), number = true) { days = it.filter(Char::isDigit) }
                        Field("First-review % off", percent, Modifier.weight(1f), number = true) { percent = it.filter(Char::isDigit) }
                    }
                    OutlinedButton(onClick = {
                        scope.launch {
                            ctx.attempt(onAuthError) {
                                api.put("/api/settings/reviews", buildJsonObject { put("days", days.toIntOrNull() ?: 0); put("percent", percent.toIntOrNull() ?: 0) })
                            }?.let { ctx.toast("Saved") }
                        }
                    }) { Text("Save") }
                }
            }
            val list = reviews
            if (list == null) { item { Muted("Loading…", Modifier.padding(16.dp)) }; return@LazyColumn }
            val waiting = list.count { it.orderId != null && !it.visible }
            if (waiting > 0) item { Text("$waiting new review(s) waiting for your approval", Modifier.padding(16.dp), color = AmberDark, fontWeight = FontWeight.SemiBold) }
            items(list.sortedWith(compareByDescending<Review> { it.orderId != null && !it.visible }.thenByDescending { it.reviewDate }), key = { it.id }) { r ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).clickable { editing = r }) {
                            Text(r.name, fontWeight = FontWeight.SemiBold)
                            Text(stars(r.rating), color = Amber, fontSize = 16.sp)
                        }
                        Muted(parseInstant(r.reviewDate)?.dayText() ?: "")
                    }
                    Text(r.body)
                    if (r.images.isNotEmpty()) {
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) { r.images.forEach { Thumb(api, it, 64) } }
                    }
                    r.reply?.takeIf { it.isNotBlank() }?.let { Muted("Your reply: $it") }
                    Row {
                        if (!r.visible) SmallAction(if (r.orderId != null) "Approve" else "Show") { setVisible(r, true) }
                        else SmallAction("Hide") { setVisible(r, false) }
                        SmallAction("Edit / reply") { editing = r }
                        SmallAction("Delete") {
                            ask = Ask("Delete the review from ${r.name}?", "", {
                                scope.launch { ctx.attempt(onAuthError) { api.delete("/api/reviews/${r.id}") }?.let { load() } }
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
private fun ReviewEditor(api: Api, onAuthError: () -> Unit, r: Review?, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val zone = ZoneId.systemDefault()
    var name by remember { mutableStateOf(r?.name ?: "") }
    var rating by remember { mutableStateOf(r?.rating ?: 5) }
    var body by remember { mutableStateOf(r?.body ?: "") }
    var source by remember { mutableStateOf(r?.source ?: "") }
    var products by remember { mutableStateOf(r?.products ?: "") }
    var reply by remember { mutableStateOf(r?.reply ?: "") }
    var email by remember { mutableStateOf(r?.email ?: "") }
    var date by remember { mutableStateOf(r?.reviewDate?.let { parseInstant(it) }?.atZone(zone)?.toLocalDate() ?: LocalDate.now()) }
    val images = remember { (r?.images ?: emptyList()).toMutableStateList() }
    var uploading by remember { mutableStateOf(false) }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            uploading = true
            scope.launch {
                photoBytes(ctx, uri)?.let { b -> ctx.attempt(onAuthError) { api.upload(b, "image/jpeg", "photo.jpg") }?.let { images.add(it) } }
                uploading = false
            }
        }
    }
    BackHandler { onDone(false) }
    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(if (r == null) "Add review" else "Edit review", { onDone(false) })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Field("Name", name) { name = it }
            Row { (1..5).forEach { n -> Text(if (n <= rating) "★" else "☆", Modifier.clickable { rating = n }.padding(4.dp), color = Amber, fontSize = 30.sp) } }
            Field("Review", body, lines = 4) { body = it }
            DateField("Date", date) { date = it }
            Field("Products (optional)", products) { products = it }
            Field("Source (optional)", source, placeholder = "e.g. Hotplate") { source = it }
            Field("Customer email (optional)", email) { email = it.trim() }
            Field("Your reply (optional, shown under it)", reply, lines = 2) { reply = it }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                images.forEachIndexed { i, u ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Thumb(api, u, 64)
                        TextButton(onClick = { images.removeAt(i) }) { Text("Remove") }
                    }
                }
                OutlinedButton(onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !uploading) {
                    Text(if (uploading) "Uploading…" else "+ Photo")
                }
            }
        }
        Button(modifier = Modifier.fillMaxWidth().padding(12.dp), enabled = name.isNotBlank() && body.isNotBlank() && !uploading, onClick = {
            val payload = buildJsonObject {
                put("name", name.trim()); put("rating", rating); put("body", body.trim()); put("source", source); put("products", products)
                put("reply", reply); put("email", email)
                put("reviewDate", LocalDateTime.of(date, LocalTime.NOON).atZone(zone).toInstant().toString())
                putJsonArray("images") { images.forEach { add(it) } }
            }
            scope.launch {
                ctx.attempt(onAuthError) { if (r == null) api.post("/api/reviews", payload) else api.put("/api/reviews/${r.id}", payload) }?.let { onDone(true) }
            }
        }) { Text("Save") }
    }
}
