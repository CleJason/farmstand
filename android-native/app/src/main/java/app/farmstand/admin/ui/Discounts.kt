package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.FilterChip
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
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.money
import app.farmstand.admin.parseInstant
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

@Serializable
data class DiscountCode(
    val id: String,
    val code: String,
    val type: String = "PERCENT",
    val value: Int = 0,
    val appliesTo: String = "ALL",
    val minSubtotal: Int? = null,
    val maxUses: Int? = null,
    val uses: Int = 0,
    val expiresAt: String? = null,
    val active: Boolean = true,
    val allowedEmails: List<String> = emptyList(),
) {
    val describe: String get() = if (type == "PERCENT") "$value% off" else "${money(value)} off"
}

private val APPLIES = listOf("ALL" to "Everything", "DROP" to "Pre-orders only", "FARMSTAND" to "Farm stand only")

@Composable
fun DiscountsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var codes by remember { mutableStateOf<List<DiscountCode>?>(null) }
    var editing by remember { mutableStateOf<DiscountCode?>(null) }
    var creating by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    suspend fun load() { ctx.attempt(onAuthError) { api.getAs<List<DiscountCode>>("/api/discounts") }?.let { codes = it } }
    LaunchedEffect(Unit) { load() }

    if (editing != null || creating) {
        DiscountEditor(api, onAuthError, editing) { saved -> editing = null; creating = false; if (saved) scope.launch { load() } }
        return
    }
    BackHandler(onBack = onBack)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }, a.action) }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Discounts", onBack) { TextButton(onClick = { creating = true }) { Text("+ Code") } }
        LazyColumn {
            val list = codes
            if (list == null) { item { Muted("Loading…", Modifier.padding(16.dp)) }; return@LazyColumn }
            if (list.isEmpty()) item { Muted("No codes yet.", Modifier.padding(16.dp)) }
            items(list, key = { it.id }) { d ->
                SectionCard(modifier = Modifier.clickable { editing = d }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(d.code, fontWeight = FontWeight.Bold)
                            Muted(
                                listOfNotNull(
                                    d.describe,
                                    APPLIES.firstOrNull { it.first == d.appliesTo }?.second,
                                    d.minSubtotal?.let { "min ${money(it)}" },
                                    "used ${d.uses}${d.maxUses?.let { " of $it" } ?: ""}",
                                    d.expiresAt?.let { parseInstant(it) }?.let { "until ${it.dayText()}" },
                                    if (d.allowedEmails.isNotEmpty()) "personal" else null,
                                ).joinToString(" · "),
                            )
                        }
                        Switch(d.active, {
                            scope.launch { ctx.attempt(onAuthError) { api.put("/api/discounts/${d.id}", buildJsonObject { put("active", it) }) }?.let { load() } }
                        })
                    }
                    SmallAction("Delete") {
                        ask = Ask("Delete code ${d.code}?", "Past orders that used it are not affected.", {
                            scope.launch { ctx.attempt(onAuthError) { api.delete("/api/discounts/${d.id}") }?.let { load() } }
                        })
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun DiscountEditor(api: Api, onAuthError: () -> Unit, d: DiscountCode?, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val zone = ZoneId.systemDefault()
    var code by remember { mutableStateOf(d?.code ?: "") }
    var type by remember { mutableStateOf(d?.type ?: "PERCENT") }
    var value by remember { mutableStateOf(d?.let { if (it.type == "PERCENT") it.value.toString() else dollarsText(it.value) } ?: "") }
    var applies by remember { mutableStateOf(d?.appliesTo ?: "ALL") }
    var minSub by remember { mutableStateOf(dollarsText(d?.minSubtotal)) }
    var maxUses by remember { mutableStateOf(d?.maxUses?.toString() ?: "") }
    var expires by remember { mutableStateOf(d?.expiresAt?.let { parseInstant(it) }?.atZone(zone)?.toLocalDate()) }
    val emails = remember { (d?.allowedEmails ?: emptyList()).toMutableStateList() }
    var newEmail by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    BackHandler { onDone(false) }
    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(if (d == null) "New code" else "Edit ${d.code}", { onDone(false) })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Field("Code", code) { code = it.uppercase().replace(" ", "") }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(type == "PERCENT", { type = "PERCENT" }, label = { Text("% off") })
                FilterChip(type == "AMOUNT", { type = "AMOUNT" }, label = { Text("$ off") })
            }
            Field(if (type == "PERCENT") "Percent off" else "Dollars off", value, decimal = true) { value = it }
            Muted("Works on")
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                APPLIES.forEach { (k, l) -> FilterChip(applies == k, { applies = k }, label = { Text(l) }) }
            }
            Field("Minimum order $ (optional)", minSub, decimal = true) { minSub = it }
            Field("Max uses (optional; 1 = one-time)", maxUses, number = true) { maxUses = it.filter(Char::isDigit) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                DateField("Expires (optional)", expires, Modifier.weight(1f)) { expires = it }
                if (expires != null) TextButton(onClick = { expires = null }) { Text("Clear") }
            }
            Text("Only for these customers (optional)", fontWeight = FontWeight.Medium)
            emails.forEachIndexed { i, e ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(e, Modifier.weight(1f))
                    TextButton(onClick = { emails.removeAt(i) }) { Text("✕") }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field("Customer email", newEmail, Modifier.weight(1f)) { newEmail = it.trim() }
                TextButton(onClick = {
                    val e = newEmail.lowercase()
                    if (Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(e) && e !in emails) { emails.add(e); newEmail = "" }
                }) { Text("Add") }
            }
        }
        Column(Modifier.padding(12.dp)) {
            error?.let { Text(it, color = Red) }
            Button(modifier = Modifier.fillMaxWidth(), onClick = {
                error = null
                val v = value.toDoubleOrNull()
                if (code.isBlank() || v == null) { error = "Enter a code and an amount."; return@Button }
                val body = buildJsonObject {
                    put("code", code)
                    put("type", type)
                    put("value", if (type == "PERCENT") v.toInt() else Math.round(v * 100).toInt())
                    put("appliesTo", applies)
                    centsOf(minSub)?.let { put("minSubtotal", it) } ?: put("minSubtotal", JsonNull)
                    if (maxUses.isBlank()) put("maxUses", JsonNull) else put("maxUses", maxUses)
                    expires?.let { put("expiresAt", LocalDateTime.of(it, LocalTime.of(23, 59, 59)).atZone(zone).toInstant().toString()) } ?: put("expiresAt", JsonNull)
                    putJsonArray("allowedEmails") { emails.forEach { add(it) } }
                }
                scope.launch {
                    try {
                        if (d == null) api.post("/api/discounts", body) else api.put("/api/discounts/${d.id}", body)
                        onDone(true)
                    } catch (e: app.farmstand.admin.ApiException) {
                        if (e.code == 401) onAuthError() else error = e.message
                    }
                }
            }) { Text("Save") }
        }
    }
}
