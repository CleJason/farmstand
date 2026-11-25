package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import app.farmstand.admin.Customer
import app.farmstand.admin.dayText
import app.farmstand.admin.json
import app.farmstand.admin.money
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URLEncoder

private enum class Sort(val label: String) { Recent("Recent"), Spent("Top spenders"), Name("Name"), Points("Points") }

@Composable
fun CustomersScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    // Raw JSON kept too: merging sends both customers back exactly as listed
    var raw by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var customers by remember { mutableStateOf<List<Customer>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(Sort.Recent) }
    var open by remember { mutableStateOf<String?>(null) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.get("/api/customers") }?.let { text ->
            val arr = json.parseToJsonElement(text).jsonArray.map { it.jsonObject }
            raw = arr
            customers = arr.map { json.decodeFromJsonElement(Customer.serializer(), it) }
        }
    }
    LaunchedEffect(Unit) { load() }

    val selected = customers?.firstOrNull { it.key == open }
    if (selected != null) {
        CustomerDetail(api, onAuthError, selected, customers.orEmpty(), raw, onBack = { open = null }) { stillThere ->
            scope.launch {
                load()
                if (!stillThere) open = null
            }
        }
        return
    }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize()) {
        EditorBar("Customers", onBack)
        Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
            LazyColumn(Modifier.fillMaxWidth()) {
                val all = customers
                if (all == null) {
                    item { Muted("Loading…", Modifier.padding(16.dp)) }
                    return@LazyColumn
                }
                item {
                    OutlinedTextField(
                        search, { search = it }, placeholder = { Text("Search name, email, phone") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Sort.entries.forEach { s -> FilterChip(sort == s, { sort = s }, label = { Text(s.label) }) }
                    }
                    Muted("${all.size} customers", Modifier.padding(start = 16.dp, top = 4.dp))
                }
                val q = search.trim().lowercase()
                val digits = q.filter(Char::isDigit)
                val shown = all.filter { c ->
                    q.isEmpty() || listOfNotNull(c.name, c.email).any { it.lowercase().contains(q) } ||
                        (digits.length >= 3 && (listOfNotNull(c.phone) + c.previousPhones).any { it.contains(digits) }) ||
                        c.previousEmails.any { it.contains(q) }
                }.let { list ->
                    when (sort) {
                        Sort.Recent -> list.sortedByDescending { it.lastOrderAt ?: it.imported?.lastOrderAt ?: "" }
                        Sort.Spent -> list.sortedByDescending { it.totalSpent + (it.imported?.spent ?: 0) }
                        Sort.Name -> list.sortedBy { it.label.lowercase() }
                        Sort.Points -> list.sortedByDescending { it.points }
                    }
                }
                items(shown, key = { it.key }) { c ->
                    Row(
                        Modifier.fillMaxWidth().clickable { open = c.key }.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(c.label, fontWeight = FontWeight.Medium)
                            Muted(listOfNotNull(c.phone?.let { prettyPhone(it) }, c.email.takeIf { c.name != null }).joinToString(" · "))
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(money(c.totalSpent + (c.imported?.spent ?: 0)), fontWeight = FontWeight.SemiBold)
                            Muted("${c.orderCount + (c.imported?.orders ?: 0)} orders")
                        }
                    }
                    HorizontalDivider(Modifier.padding(start = 16.dp))
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CustomerDetail(
    api: Api,
    onAuthError: () -> Unit,
    c: Customer,
    all: List<Customer>,
    raw: List<JsonObject>,
    onBack: () -> Unit,
    onChanged: (stillThere: Boolean) -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf(false) }
    var name by remember(c.key) { mutableStateOf(c.name ?: "") }
    var email by remember(c.key) { mutableStateOf(c.email ?: "") }
    var phone by remember(c.key) { mutableStateOf(c.phone ?: "") }
    var pts by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf(false) }
    var merging by remember { mutableStateOf(false) }
    var messaging by remember { mutableStateOf(false) }
    BackHandler(onBack = onBack)

    if (deleting) {
        ConfirmDialog(
            "Delete ${c.label}?",
            "Their account (if any) and their name, email and phone are removed. Past orders stay in your sales without contact info. This can't be undone.",
            "Delete", { deleting = false },
        ) {
            scope.launch {
                val q = "key=${URLEncoder.encode(c.key, "UTF-8")}" + (c.contactId?.let { "&contactId=${URLEncoder.encode(it, "UTF-8")}" } ?: "")
                ctx.attempt(onAuthError) { api.delete("/api/customers?$q") }?.let { onChanged(false) }
            }
        }
    }
    if (merging) {
        MergeCustomerDialog(c, all.filter { it.key != c.key }, onClose = { merging = false }) { other ->
            scope.launch {
                val keep = raw.firstOrNull { it["key"]?.jsonPrimitive?.content == c.key } ?: return@launch
                val o = raw.firstOrNull { it["key"]?.jsonPrimitive?.content == other.key } ?: return@launch
                ctx.attempt(onAuthError) { api.post("/api/customers/merge", buildJsonObject { put("keep", keep); put("other", o) }) }
                    ?.let { ctx.toast("Merged"); onChanged(false) }
            }
        }
    }
    if (messaging && c.phone != null) {
        QuickTextDialog(api, onAuthError, c.phone, c.label) { messaging = false }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(c.label, onBack)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                c.phone?.let { p ->
                    OutlinedButton(onClick = { ctx.call(p) }) { Text("Call") }
                    OutlinedButton(onClick = { messaging = true }) { Text("Text") }
                }
                c.email?.let { e -> OutlinedButton(onClick = { ctx.email(e) }) { Text("Email") } }
            }
            if (!editing) {
                listOfNotNull(c.phone?.let { prettyPhone(it) }, c.email).forEach { Text(it) }
                if (c.previousEmails.isNotEmpty() || c.previousPhones.isNotEmpty()) {
                    Muted("Also: " + (c.previousEmails + c.previousPhones.map { prettyPhone(it) }).joinToString(", "))
                }
                TextButton(onClick = { editing = true }) { Text("Edit details") }
            } else {
                Field("Name", name) { name = it }
                Field("Email", email) { email = it }
                Field("Phone", phone, number = true) { phone = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        scope.launch {
                            ctx.attempt(onAuthError) {
                                api.patch(
                                    "/api/customers?key=${URLEncoder.encode(c.key, "UTF-8")}",
                                    buildJsonObject {
                                        put("name", name); put("email", email); put("phone", phone)
                                        put("contactId", c.contactId); put("currentPhone", c.phone)
                                    },
                                )
                            }?.let { editing = false; onChanged(true) }
                        }
                    }) { Text("Save") }
                    TextButton(onClick = { editing = false }) { Text("Cancel") }
                }
                Muted("Old emails and numbers stay on their profile so their orders stay together.")
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatBox("Spent", money(c.totalSpent + (c.imported?.spent ?: 0)), Modifier.weight(1f))
                StatBox("Orders", "${c.orderCount + (c.imported?.orders ?: 0)}", Modifier.weight(1f))
                StatBox("Points", "${c.points}", Modifier.weight(1f))
            }
            c.signedUpAt?.let { parseInstant(it) }?.let { Muted("Account since ${it.dayText()}") }
            c.imported?.let { Muted("Includes Hotplate history: ${it.orders} orders, ${money(it.spent)}") }
            c.note?.takeIf { it.isNotBlank() }?.let { Muted("Note: $it") }

            HorizontalDivider()
            Text("Orders", fontWeight = FontWeight.SemiBold)
            if (c.orders.isEmpty()) Muted("No orders here yet.")
            c.orders.sortedByDescending { it.createdAt }.forEach { o ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("#${o.id.takeLast(6).uppercase()} · ${parseInstant(o.createdAt)?.dayText() ?: ""}")
                        Muted(app.farmstand.admin.statusLabel(o.status))
                    }
                    Text(money(o.total))
                }
            }

            HorizontalDivider()
            Text("Points", fontWeight = FontWeight.SemiBold)
            c.pointAdjustments.forEach { a ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${if (a.points > 0) "+" else ""}${a.points} · ${a.reason}", Modifier.weight(1f))
                    TextButton(onClick = {
                        scope.launch {
                            ctx.attempt(onAuthError) { api.delete("/api/customers/points?id=${URLEncoder.encode(a.id, "UTF-8")}") }?.let { onChanged(true) }
                        }
                    }) { Text("Undo") }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field("+/- points", pts, Modifier.weight(1f)) { v -> pts = v.filter { it.isDigit() || it == '-' } }
                Field("Reason", reason, Modifier.weight(2f), placeholder = "cash sale $20") { reason = it }
            }
            OutlinedButton(enabled = pts.toIntOrNull() != null && reason.isNotBlank(), onClick = {
                scope.launch {
                    ctx.attempt(onAuthError) {
                        api.post("/api/customers/points", buildJsonObject {
                            put("email", c.email); put("phone", c.phone); put("points", pts.toInt()); put("reason", reason.trim())
                        })
                    }?.let { pts = ""; reason = ""; onChanged(true) }
                }
            }) { Text("Add points") }

            HorizontalDivider()
            TextButton(onClick = { merging = true }) { Text("Same person as another customer? Merge") }
            TextButton(onClick = { deleting = true }) { Text("Delete customer", color = Red) }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun StatBox(label: String, value: String, modifier: Modifier) {
    androidx.compose.material3.Card(modifier) {
        Column(Modifier.padding(10.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Muted(label)
        }
    }
}

@Composable
private fun MergeCustomerDialog(c: Customer, others: List<Customer>, onClose: () -> Unit, onPick: (Customer) -> Unit) {
    var q by remember { mutableStateOf("") }
    var pick by remember { mutableStateOf<Customer?>(null) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Merge into ${c.label}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Muted("Pick the other entry for this person. ${c.label}'s details win; the other's become earlier ones.")
                OutlinedTextField(q, { q = it }, placeholder = { Text("Search") }, singleLine = true)
                val ql = q.trim().lowercase()
                Column(Modifier.verticalScroll(rememberScrollState()).height(260.dp)) {
                    others.filter { ql.length >= 2 && listOfNotNull(it.name, it.email, it.phone).any { s -> s.lowercase().contains(ql) } }.take(30).forEach { o ->
                        Text(
                            (if (pick?.key == o.key) "● " else "○ ") + o.label + (o.email?.let { " · $it" } ?: ""),
                            Modifier.fillMaxWidth().clickable { pick = o }.padding(vertical = 8.dp),
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(enabled = pick != null, onClick = { onClose(); onPick(pick!!) }) { Text("Merge") } },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}

@Composable
fun QuickTextDialog(api: Api, onAuthError: () -> Unit, phone: String, who: String, onClose: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var text by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Text $who") },
        text = { OutlinedTextField(text, { text = it }, minLines = 4, modifier = Modifier.fillMaxWidth()) },
        confirmButton = {
            TextButton(enabled = text.isNotBlank() && !busy, onClick = {
                busy = true
                scope.launch {
                    ctx.attempt(onAuthError) { api.post("/api/messages", buildJsonObject { put("phone", phone); put("body", text) }) }
                        ?.let { ctx.toast("Sent"); onClose() }
                    busy = false
                }
            }) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}
