package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
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
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.json
import app.farmstand.admin.money
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable
data class GiftCard(
    val id: String,
    val code: String,
    val initialAmount: Int = 0,
    val balance: Int = 0,
    val status: String = "ACTIVE",
    val recipientName: String? = null,
    val recipientEmail: String? = null,
    val fromName: String? = null,
    val message: String? = null,
    val purchaserEmail: String? = null,
    val createdAt: String = "",
)

@Composable
fun GiftCardsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var cards by remember { mutableStateOf<List<GiftCard>?>(null) }
    var query by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    var balanceFor by remember { mutableStateOf<GiftCard?>(null) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    suspend fun load() { ctx.attempt(onAuthError) { api.getAs<List<GiftCard>>("/api/gift-cards") }?.let { cards = it } }
    LaunchedEffect(Unit) { load() }
    fun update(c: GiftCard, body: JsonObject, done: String? = null) {
        scope.launch { ctx.attempt(onAuthError) { api.put("/api/gift-cards/${c.id}", body) }?.let { done?.let { ctx.toast(it) }; load() } }
    }

    if (creating) {
        NewGiftCard(api, onAuthError) { saved -> creating = false; if (saved) scope.launch { load() } }
        return
    }
    BackHandler(onBack = onBack)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }, a.action) }
    balanceFor?.let { c ->
        var v by remember(c.id) { mutableStateOf(dollarsText(c.balance)) }
        AlertDialog(
            onDismissRequest = { balanceFor = null },
            title = { Text("New balance for ${c.code}") },
            text = { OutlinedTextField(v, { v = it }, prefix = { Text("$") }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = {
                    val cents = centsOf(v)
                    if (cents != null && cents >= 0) { update(c, buildJsonObject { put("balance", cents) }); balanceFor = null }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { balanceFor = null }) { Text("Cancel") } },
        )
    }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Gift cards", onBack) { TextButton(onClick = { creating = true }) { Text("+ Card") } }
        LazyColumn {
            item {
                OutlinedTextField(query, { query = it }, placeholder = { Text("Search code, name, email") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp))
            }
            val list = cards
            if (list == null) { item { Muted("Loading…", Modifier.padding(16.dp)) }; return@LazyColumn }
            val q = query.trim().lowercase()
            val shown = list.filter { c -> q.isEmpty() || listOfNotNull(c.code, c.recipientName, c.recipientEmail, c.purchaserEmail, c.fromName).any { it.lowercase().contains(q) } }
            if (shown.isEmpty()) item { Muted("No gift cards.", Modifier.padding(16.dp)) }
            items(shown, key = { it.id }) { c ->
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(c.code, fontWeight = FontWeight.Bold)
                            Muted(listOfNotNull(c.recipientName?.let { "for $it" }, c.fromName?.let { "from $it" }, parseInstant(c.createdAt)?.dayText()).joinToString(" · "))
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(money(c.balance), fontWeight = FontWeight.SemiBold)
                            Muted(if (c.status == "PENDING") "Awaiting payment" else if (c.status == "VOID") "Void" else "of ${money(c.initialAmount)}")
                        }
                    }
                    Row {
                        SmallAction("Edit balance") { balanceFor = c }
                        if (c.recipientEmail != null && c.status == "ACTIVE") SmallAction("Resend email") { update(c, buildJsonObject { put("resend", true) }, "Sent") }
                        if (c.status == "VOID") SmallAction("Reactivate") { update(c, buildJsonObject { put("status", "ACTIVE") }) }
                        else SmallAction(if (c.status == "PENDING") "Mark paid" else "Void") {
                            if (c.status == "PENDING") update(c, buildJsonObject { put("status", "ACTIVE") })
                            else ask = Ask("Void ${c.code}?", "It can't be used until you reactivate it.", { update(c, buildJsonObject { put("status", "VOID") }) })
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun NewGiftCard(api: Api, onAuthError: () -> Unit, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var amount by remember { mutableStateOf("") }
    var recipientName by remember { mutableStateOf("") }
    var recipientEmail by remember { mutableStateOf("") }
    var fromName by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var sendEmail by remember { mutableStateOf(true) }
    BackHandler { onDone(false) }
    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar("New gift card", { onDone(false) })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Field("Amount $", amount, decimal = true) { amount = it }
            Field("Recipient name", recipientName) { recipientName = it }
            Field("Recipient email", recipientEmail) { recipientEmail = it.trim() }
            Field("From", fromName) { fromName = it }
            Field("Message", message, lines = 3) { message = it }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Email it to them now", Modifier.weight(1f))
                Switch(sendEmail, { sendEmail = it })
            }
        }
        Button(modifier = Modifier.fillMaxWidth().padding(12.dp), enabled = (centsOf(amount) ?: 0) > 0, onClick = {
            scope.launch {
                ctx.attempt(onAuthError) {
                    api.post("/api/gift-cards", buildJsonObject {
                        put("amount", centsOf(amount)); put("recipientName", recipientName); put("recipientEmail", recipientEmail)
                        put("fromName", fromName); put("message", message); put("sendEmail", sendEmail)
                    })
                }?.let { r ->
                    ctx.toast("Gift card created: " + (runCatching { json.parseToJsonElement(r).jsonObject["code"]?.jsonPrimitive?.content }.getOrNull() ?: ""))
                    onDone(true)
                }
            }
        }) { Text("Create gift card") }
    }
}
