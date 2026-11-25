package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant

@Serializable
data class Subscriber(
    val id: String,
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val createdAt: String = "",
    val dropVia: String? = null,
    val stopped: Boolean = false,
)

@Serializable
data class OptOut(val phone: String, val name: String? = null, val createdAt: String = "")

@Serializable
data class ReminderSetting(val enabled: Boolean = false, val hours: Int = 2)

@Serializable
data class TextHours(val enabled: Boolean = false, val start: String = "08:00", val end: String = "20:00")

private fun Subscriber.via() = dropVia ?: if (email != null && phone != null) "both" else if (email != null) "email" else "text"
private fun Subscriber.label() = name ?: email ?: phone ?: ""
private fun getsText(v: String) = when (v) { "text" -> "Texts"; "email" -> "Emails"; else -> "Texts + emails" }
private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
private fun digits(s: String) = s.filter(Char::isDigit).let { if (it.length == 11 && it.startsWith("1")) it.drop(1) else it }

@Composable
fun AlertsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var subs by remember { mutableStateOf<List<Subscriber>?>(null) }
    var optOuts by remember { mutableStateOf<List<OptOut>>(emptyList()) }
    var reminder by remember { mutableStateOf<ReminderSetting?>(null) }
    var hoursText by remember { mutableStateOf("") }
    var textHours by remember { mutableStateOf<TextHours?>(null) }
    var search by remember { mutableStateOf("") }
    var newEmail by remember { mutableStateOf("") }
    var newPhone by remember { mutableStateOf("") }
    var stopPhone by remember { mutableStateOf("") }
    var showOptOuts by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Subscriber?>(null) }
    var merging by remember { mutableStateOf<Subscriber?>(null) }
    var ask by remember { mutableStateOf<Ask?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<Subscriber>>("/api/subscribers") }?.let { subs = it }
        ctx.attempt(onAuthError, true) { api.getAs<List<OptOut>>("/api/subscribers/opt-outs") }?.let { optOuts = it }
    }
    LaunchedEffect(Unit) {
        ctx.attempt(onAuthError, true) { api.getAs<ReminderSetting>("/api/settings/reminders") }?.let { reminder = it; hoursText = it.hours.toString() }
        ctx.attempt(onAuthError, true) { api.getAs<TextHours>("/api/settings/text-hours") }?.let { textHours = it }
        load()
    }
    fun saveReminder(r: ReminderSetting) {
        reminder = r
        scope.launch {
            ctx.attempt(onAuthError) { api.put("/api/settings/reminders", buildJsonObject { put("enabled", r.enabled); put("hours", r.hours) }) }?.let { ctx.toast("Saved") }
        }
    }
    fun saveHours(h: TextHours) {
        textHours = h
        scope.launch {
            ctx.attempt(onAuthError) { api.put("/api/settings/text-hours", buildJsonObject { put("enabled", h.enabled); put("start", h.start); put("end", h.end) }) }?.let { ctx.toast("Saved") }
        }
    }
    fun run(block: suspend () -> Any?) { scope.launch { if (ctx.attempt(onAuthError) { block() } != null) load() } }

    editing?.let { s -> SubscriberEditor(s, { editing = null }) { email, phone, via ->
        scope.launch {
            ctx.attempt(onAuthError) {
                api.patch("/api/subscribers", buildJsonObject { put("id", s.id); put("email", email.trim()); put("phone", phone.trim()); put("via", via) })
            }?.let { editing = null; load() }
        }
    } }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }

    BackHandler(onBack = { if (merging != null) merging = null else onBack() })
    Column(Modifier.fillMaxSize()) {
        EditorBar("Drop Alerts", onBack)
        LazyColumn(Modifier.imePadding()) {
            item {
                reminder?.let { r ->
                    SectionCard("Last call reminder") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Send it automatically", Modifier.weight(1f))
                            Switch(r.enabled, { saveReminder(r.copy(enabled = it)) })
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Hours before orders close", hoursText, Modifier.weight(1f), number = true) { hoursText = it.filter(Char::isDigit) }
                            OutlinedButton(onClick = { hoursText.toIntOrNull()?.let { saveReminder(r.copy(hours = it)) } }) { Text("Save") }
                        }
                        Muted("Once per drop, to people on this list who haven't ordered from that drop yet: a text if they gave a phone number, otherwise an email.")
                    }
                }
                textHours?.let { h ->
                    SectionCard("Texting hours") {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Only send alerts, reminders and bulk messages between these hours", Modifier.weight(1f))
                            Switch(h.enabled, { saveHours(h.copy(enabled = it)) })
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TimeField("From", runCatching { java.time.LocalTime.parse(h.start) }.getOrNull(), Modifier.weight(1f)) { saveHours(h.copy(start = it.toString())) }
                            TimeField("To", runCatching { java.time.LocalTime.parse(h.end) }.getOrNull(), Modifier.weight(1f)) { saveHours(h.copy(end = it.toString())) }
                        }
                        Muted("Outside these hours they wait until the start time. Order confirmations and your replies always go right away.")
                    }
                }
                SectionCard("Add someone") {
                    Field("Email", newEmail, placeholder = "name@example.com") { newEmail = it }
                    Field("Phone (for texts)", newPhone, number = true, placeholder = "(555) 000-0000") { newPhone = it }
                    Button(enabled = newEmail.isNotBlank() || newPhone.isNotBlank(), onClick = {
                        run {
                            api.post("/api/subscribers", buildJsonObject { put("email", newEmail.trim()); put("phone", newPhone.trim()) })
                                .also { newEmail = ""; newPhone = "" }
                        }
                    }) { Text("+ Add to list") }
                    Muted("Only add people who asked for drop alerts. Anyone who replied STOP never gets texts.")
                }
                SectionCard("Opted out of texts (${optOuts.size})") {
                    if (!showOptOuts) SmallAction("Show") { showOptOuts = true }
                    else {
                        Muted("These numbers never get texts unless they reply START. If you see a STOP on the phone that isn't here, mark it.")
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Phone", stopPhone, Modifier.weight(1f), number = true) { stopPhone = it }
                            OutlinedButton(enabled = stopPhone.isNotBlank(), onClick = {
                                run { api.post("/api/subscribers/opt-outs", buildJsonObject { put("phone", stopPhone.trim()) }).also { stopPhone = "" } }
                            }) { Text("Mark STOP") }
                        }
                        if (optOuts.isEmpty()) Muted("Nobody has opted out.")
                        optOuts.forEach { o ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(o.phone + (o.name?.let { " · $it" } ?: ""))
                                    Muted(parseInstant(o.createdAt)?.dayText() ?: "")
                                }
                                SmallAction("Undo") {
                                    ask = Ask("Allow texts to ${o.phone} again?", "Only do this if it was marked by mistake. If they replied STOP, they have to reply START themselves.") {
                                        run { api.delete("/api/subscribers/opt-outs?phone=${enc(o.phone)}") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            val list = subs
            if (list == null) { item { Muted("Loading…", Modifier.padding(16.dp)) }; return@LazyColumn }
            item {
                val now = Instant.now()
                fun since(days: Long) = list.count { s -> parseInstant(s.createdAt)?.let { Duration.between(it, now).toDays() < days } == true }
                SectionCard("New sign-ups") {
                    Text("Today ${since(1)} · Last 7 days ${since(7)} · Last 30 days ${since(30)}")
                }
                val emails = list.count { it.via() != "text" }
                val texts = list.count { it.via() != "email" }
                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${list.size} on the list · $emails get emails, $texts get texts", Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                    if (list.isNotEmpty()) SmallAction("Remove all") {
                        ask = Ask("Remove all ${list.size} people from Drop Alerts?", "Their customer records stay.") { run { api.delete("/api/subscribers?all=1") } }
                    }
                }
                Field("Search name, email or phone", search, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) { search = it }
                merging?.let { m ->
                    Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Merging ${m.email ?: m.phone}. Find their other entry, then tap Merge into this.", Modifier.weight(1f), color = AmberDark)
                        SmallAction("Cancel") { merging = null }
                    }
                }
            }
            val q = search.trim().lowercase()
            val qPhone = digits(q)
            val shown = list.filter { s ->
                q.isEmpty() || s.name?.lowercase()?.contains(q) == true || s.email?.lowercase()?.contains(q) == true ||
                    (qPhone.length >= 3 && s.phone?.let { digits(it).contains(qPhone) } == true)
            }
            if (shown.isEmpty()) item { Muted("Nobody on the list matches that.", Modifier.padding(16.dp)) }
            items(shown, key = { it.id }) { s ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(s.name ?: "—", fontWeight = FontWeight.SemiBold)
                            s.email?.let { Muted(it) }
                            s.phone?.let { Muted(it) }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Muted(getsText(s.via()))
                            if (s.stopped) Text("Replied STOP", color = Red)
                            Muted(parseInstant(s.createdAt)?.dayText() ?: "")
                        }
                    }
                    Row {
                        val m = merging
                        if (m != null && m.id != s.id) SmallAction("Merge into this") {
                            val clash = listOfNotNull(
                                if (s.email != null && m.email != null && s.email != m.email) "${m.email} will be dropped." else null,
                                if (s.phone != null && m.phone != null && s.phone != m.phone) "${m.phone} will be dropped." else null,
                            ).joinToString(" ")
                            ask = Ask("Merge ${m.email ?: m.phone} into ${s.email ?: s.phone}?", "They'll be one entry. $clash") {
                                run { api.post("/api/subscribers/merge", buildJsonObject { put("keepId", s.id); put("otherId", m.id) }).also { merging = null } }
                            }
                        } else if (m == null) {
                            SmallAction("Edit") { editing = s }
                            SmallAction("Merge") { merging = s }
                            SmallAction("Remove") {
                                ask = Ask("Remove ${s.label()} from the list?", "No more drop alerts or Porch Pickup notices.") { run { api.delete("/api/subscribers?id=${enc(s.id)}") } }
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun SubscriberEditor(s: Subscriber, onDismiss: () -> Unit, onSave: (String, String, String) -> Unit) {
    var email by remember { mutableStateOf(s.email ?: "") }
    var phone by remember { mutableStateOf(s.phone ?: "") }
    var via by remember { mutableStateOf(s.via()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(s.name ?: "Edit") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Email", email, placeholder = "No email") { email = it; if (it.isBlank()) via = "text" }
                Field("Phone", phone, number = true, placeholder = "No phone") { phone = it; if (it.isBlank()) via = "email" }
                Text("Gets")
                Row {
                    listOf("text" to "Texts", "email" to "Emails", "both" to "Both").forEach { (v, l) ->
                        FilterChip(via == v, { via = v }, label = { Text(l) }, modifier = Modifier.padding(end = 6.dp))
                    }
                }
                Muted("Clear a box to remove that email or phone.")
            }
        },
        confirmButton = { TextButton(onClick = { onSave(email, phone, via) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
