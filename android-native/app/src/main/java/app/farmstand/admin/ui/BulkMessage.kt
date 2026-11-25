package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.dayTimeText
import app.farmstand.admin.json
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class BulkDrop(val id: String, val title: String, val orderOpenAt: String = "")

@Serializable
data class BulkOrder(val name: String = "", val subscribed: Boolean = false)

@Serializable
data class BulkCounts(
    val people: Int = 0,
    val texts: Int = 0,
    val emails: Int = 0,
    val skipped: Int = 0,
    val orders: List<BulkOrder>? = null,
    val sent: Boolean = false,
    val scheduledFor: String? = null,
)

private const val MAX = 1000

@Composable
private fun Choice(selected: Boolean, text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected, onClick, enabled = enabled)
        Text(text)
    }
}

@Composable
fun BulkMessageScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var drops by remember { mutableStateOf<List<BulkDrop>>(emptyList()) }
    var message by remember { mutableStateOf("") }
    var subject by remember { mutableStateOf("") }
    var skip by remember { mutableStateOf(false) }
    var dropId by remember { mutableStateOf("") }
    var by by remember { mutableStateOf("choice") }
    var preview by remember { mutableStateOf<BulkCounts?>(null) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf("") }
    var pickDrop by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        ctx.attempt(onAuthError) { api.getAs<List<BulkDrop>>("/api/bulk-message") }?.let { drops = it; dropId = it.firstOrNull()?.id ?: "" }
    }
    fun changed() { preview = null; done = "" }
    suspend fun post(confirm: Boolean): BulkCounts? {
        busy = true
        val r = ctx.attempt(onAuthError) {
            api.post("/api/bulk-message", buildJsonObject {
                put("message", message); put("subject", subject)
                if (skip && dropId.isNotBlank()) put("skipDropId", dropId) else put("skipDropId", JsonNull)
                put("by", by); put("confirm", confirm)
            })
        }
        busy = false
        return r?.let { json.decodeFromString<BulkCounts>(it) }
    }

    BackHandler(onBack = onBack)
    Column(Modifier.fillMaxSize()) {
        EditorBar("Bulk Message", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding()) {
            Muted("One message to every subscriber, by text, email, or the way each person chose. Anyone who replied STOP never gets a text.", Modifier.padding(horizontal = 16.dp))
            SectionCard {
                Field("Message", message, lines = 5, placeholder = "Fresh sourdough this Saturday at the porch!") { message = it.take(MAX); changed() }
                val n = message.trim().length
                Muted("$n characters. Texts start with your shop name and end with \"Reply STOP to opt out.\"" + if (n > 140) " Long texts may arrive as more than one message." else "")
                Field("Email subject (optional)", subject, placeholder = "News from your shop") { subject = it.take(150); changed() }
            }
            SectionCard("Who gets it") {
                Choice(!skip, "All subscribers") { skip = false; changed() }
                Choice(skip, "All subscribers minus people who preordered in a drop", enabled = drops.isNotEmpty()) { skip = true; changed() }
                if (skip) {
                    val d = drops.firstOrNull { it.id == dropId }
                    OutlinedButton(onClick = { pickDrop = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(d?.let { "${it.title} (opened ${parseInstant(it.orderOpenAt)?.dayText() ?: ""})" } ?: "Pick a drop")
                    }
                }
            }
            SectionCard("Send by") {
                Choice(by == "choice", "Each person's choice (text, email or both)") { by = "choice"; changed() }
                Choice(by == "text", "Texts only (everyone with a phone who hasn't replied STOP)") { by = "text"; changed() }
                Choice(by == "email", "Emails only (everyone with an email)") { by = "email"; changed() }
            }
            SectionCard {
                val p = preview
                if (p == null) {
                    Button(enabled = !busy && message.isNotBlank(), onClick = { scope.launch { preview = post(false) } }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (busy) "Counting…" else "Review before sending")
                    }
                } else {
                    Text("This goes to ${p.people} ${if (p.people == 1) "person" else "people"}: ${p.texts} texts, ${p.emails} emails.", fontWeight = FontWeight.SemiBold)
                    if (p.skipped > 0) Muted("${p.skipped} skipped.")
                    if (skip) p.orders?.let { list ->
                        Muted("${list.size} order(s) in that drop (paid or awaiting payment):")
                        list.forEach { o -> Muted("• ${o.name}: " + if (o.subscribed) "skipped" else "not on the list") }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy && p.people > 0, onClick = {
                            scope.launch {
                                val r = post(true) ?: return@launch
                                preview = null
                                val who = "${r.people} ${if (r.people == 1) "person" else "people"} (${r.texts} texts, ${r.emails} emails)"
                                done = r.scheduledFor?.let { "It's outside texting hours, so it's queued for $who: it goes out ${parseInstant(it)?.dayTimeText() ?: "later"}." } ?: "Sent to $who."
                                message = ""; subject = ""
                            }
                        }) { Text(if (busy) "Sending…" else "Yes, send to ${p.people}") }
                        OutlinedButton(enabled = !busy, onClick = { preview = null }) { Text("Cancel") }
                    }
                    Muted("Texts go out one by one at the pace set in the SMS Gate app; emails a few seconds apart.")
                }
                if (done.isNotBlank()) Text(done, color = Green)
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (pickDrop) AlertDialog(
        onDismissRequest = { pickDrop = false },
        title = { Text("Skip people who preordered in") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                drops.forEachIndexed { i, d ->
                    Choice(d.id == dropId, "${d.title} (${if (i == 0) "latest, " else ""}opened ${parseInstant(d.orderOpenAt)?.dayText() ?: ""})") {
                        dropId = d.id; pickDrop = false; changed()
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { pickDrop = false }) { Text("Close") } },
    )
}
