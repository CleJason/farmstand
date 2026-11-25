package app.farmstand.admin.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import app.farmstand.admin.Api
import app.farmstand.admin.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.File
import java.time.LocalDate

/** Picked files as (name, mime, bytes). */
private suspend fun readPicked(ctx: Context, uris: List<Uri>): List<Triple<String, String, ByteArray>> = withContext(Dispatchers.IO) {
    uris.mapNotNull { uri ->
        runCatching {
            val name = ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            } ?: "file"
            val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
            Triple(name, ctx.contentResolver.getType(uri) ?: "application/octet-stream", bytes)
        }.getOrNull()
    }
}

private fun JsonObject.int(k: String) = this[k]?.jsonPrimitive?.intOrNull ?: 0
private fun JsonObject.arr(k: String) = (this[k] as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement.str(k: String) = (this as? JsonObject)?.get(k)?.jsonPrimitive?.contentOrNull ?: ""
private fun JsonElement.num(k: String) = (this as? JsonObject)?.get(k)?.jsonPrimitive?.doubleOrNull ?: 0.0

/** Same wording as the website's import summary. */
private fun importSummary(c: JsonObject): String = listOfNotNull(
    c.int("purchases").takeIf { it > 0 }?.let { "$it purchases" },
    c.int("duplicatePurchases").takeIf { it > 0 }?.let { "$it purchases already in the log (skipped)" },
    c.int("pastSales").takeIf { it > 0 }?.let { "$it past sales" },
    c.int("duplicatePastSales").takeIf { it > 0 }?.let { "$it past sales already here (skipped)" },
    c.int("receipts").takeIf { it > 0 }?.let { "$it receipts" },
    c.int("duplicateReceipts").takeIf { it > 0 }?.let { "$it receipts already here (skipped)" },
    c.int("ingredients").takeIf { it > 0 }?.let { "$it new ingredients" },
    c.int("recipes").takeIf { it > 0 }?.let { "$it new recipes" },
    c.int("replacedRecipes").takeIf { it > 0 }?.let { "$it recipes updated" },
    c.int("skippedRecipes").takeIf { it > 0 }?.let { "$it recipes already here (kept as they were)" },
    c.int("skippedLines").takeIf { it > 0 }?.let { "$it recipe lines skipped" },
    c.arr("skippedPurchases").takeIf { it.isNotEmpty() }?.let { a -> "skipped (unit doesn't fit the item): " + a.joinToString("; ") { it.jsonPrimitive.content } },
).joinToString(" · ").ifBlank { "Nothing new to import." }

private val XLSX_TYPES = arrayOf(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/comma-separated-values", "application/octet-stream",
)
private val MEALIE_TYPES = arrayOf("application/json", "application/zip", "application/x-zip-compressed", "application/octet-stream", "text/plain")

@Composable
fun ImportExportTab(api: Api, onAuthError: () -> Unit, d: CostsData, save: CostSave) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }

    // A read file waiting to be imported
    var sheetPlan by remember { mutableStateOf<JsonObject?>(null) }
    var sheetReplace by remember { mutableStateOf(true) }
    var sheetMsg by remember { mutableStateOf("") }
    var mealiePlan by remember { mutableStateOf<JsonObject?>(null) }
    val picks = remember { mutableStateListOf<MutableList<String>>() }
    var picksVersion by remember { mutableIntStateOf(0) }
    var mealieReplace by remember { mutableStateOf(false) }
    var mealieMsg by remember { mutableStateOf("") }
    var pasted by remember { mutableStateOf("") }

    suspend fun readPlan(files: List<Triple<String, String, ByteArray>>, paste: String = "") {
        busy = true
        val r = ctx.attempt(onAuthError) { api.postFiles("/api/costs/import/plan", files, if (paste.isNotBlank()) mapOf("mealie" to paste) else emptyMap()) }
        busy = false
        val o = r?.let { runCatching { json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return
        val plan = o["plan"]?.jsonObject ?: return
        if (o["kind"]?.jsonPrimitive?.contentOrNull == "mealie") {
            mealiePlan = plan; mealieMsg = ""
            picks.clear()
            (o["picks"] as? JsonArray)?.forEach { row -> picks.add((row as JsonArray).map { it.jsonPrimitive.content }.toMutableList()) }
        } else {
            sheetPlan = plan; sheetMsg = ""
        }
    }
    suspend fun runImport(body: JsonObject): String? {
        busy = true
        val r = ctx.attempt(onAuthError) { api.post("/api/costs/import", body) }
        busy = false
        val o = r?.let { runCatching { json.parseToJsonElement(it).jsonObject }.getOrNull() } ?: return null
        save("GET", "/api/costs", null)
        return o["counts"]?.jsonObject?.let(::importSummary) ?: "Imported."
    }

    val pickSheet = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) scope.launch { readPlan(readPicked(ctx, uris)) }
    }
    val pickMealie = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) scope.launch { readPlan(readPicked(ctx, uris)) }
    }

    // Accountant and cost exports: download the CSV, then share it (Drive, email, Sheets…)
    val year = LocalDate.now().year
    var from by remember { mutableStateOf(LocalDate.of(year, 1, 1)) }
    var to by remember { mutableStateOf(LocalDate.of(year, 12, 31)) }
    fun export(what: String, dated: Boolean) {
        scope.launch {
            busy = true
            val q = "/api/costs/export?what=$what" + if (dated) "&from=$from&to=$to" else ""
            val csv = ctx.attempt(onAuthError) { api.get(q) }
            busy = false
            if (csv == null) return@launch
            val name = if (dated) "$what-$from-to-$to.csv" else "costs-$what.csv"
            val f = File(ctx.cacheDir, name).apply { writeText(csv) }
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
            ctx.startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
                    "Share $name",
                ),
            )
        }
    }

    // Start over
    var clearPurchases by remember { mutableStateOf(true) }
    var clearManual by remember { mutableStateOf(true) }
    var clearReceipts by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Delete", { ask = null }) { ask = null; a.action() } }
    val manualCount = d.ingredients.count { it.manualCost != null }

    LazyColumn(Modifier.imePadding()) {
        item {
            SectionCard("Import your cost spreadsheet") {
                Muted(
                    "The .xlsx (in Google Sheets: File → Download → Microsoft Excel), or CSVs of single tabs. It reads the Purchasing Log, " +
                        "the Master Inventory Pool, each recipe tab, a receipt tracker, and Hotplate's orders export. Importing the same file again won't double up.",
                )
                OutlinedButton(enabled = !busy, onClick = { pickSheet.launch(XLSX_TYPES) }) { Text(if (busy) "Reading…" else "Pick file(s)") }
                sheetPlan?.let { p ->
                    val purchases = p.arr("purchases")
                    val dates = purchases.map { it.str("date").take(10) }.filter(String::isNotBlank).sorted()
                    val recipes = p.arr("recipes")
                    val receipts = p.arr("receipts")
                    val past = p.arr("pastSales")
                    Text(
                        "Found ${purchases.size} purchases" + (if (dates.isNotEmpty()) " (${dates.first()} to ${dates.last()})" else "") +
                            ", ${p.arr("ingredients").size} items in the inventory list and ${recipes.size} recipes" +
                            (if (recipes.isNotEmpty()) ": " + recipes.joinToString(", ") { "${it.str("name")} (makes ${numText(it.num("yieldCount"))})" } else "") + "." +
                            (p["overheadRate"]?.jsonPrimitive?.doubleOrNull?.let { " Overhead rate: \$${numText(it)}/hr." } ?: "") +
                            (if (receipts.isNotEmpty()) " Also ${receipts.size} receipts totaling ${usd(receipts.sumOf { it.num("amount") })}." else "") +
                            (if (past.isNotEmpty()) " Also ${past.size} past orders with ${usd(past.sumOf { it.num("revenue") })} revenue, kept for the books only." else ""),
                    )
                    p.arr("notes").forEach { Text(it.jsonPrimitive.content, color = AmberDark) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Update recipes already here with the spreadsheet's version", Modifier.weight(1f))
                        Switch(sheetReplace, { sheetReplace = it })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy, onClick = {
                            scope.launch {
                                runImport(JsonObject(p + ("replace" to JsonPrimitive(sheetReplace))))?.let { sheetMsg = "Imported: $it"; sheetPlan = null }
                            }
                        }) { Text(if (busy) "Importing…" else "Import") }
                        OutlinedButton(onClick = { sheetPlan = null }) { Text("Cancel") }
                    }
                }
                if (sheetMsg.isNotBlank()) Text(sheetMsg)
            }
        }
        item {
            SectionCard("Import recipes from Mealie") {
                Muted("A recipe's JSON (Mealie: open the recipe → ⋮ → Download), several files, or a Mealie export .zip. Or paste the JSON. You'll match each ingredient before anything is saved.")
                OutlinedButton(enabled = !busy, onClick = { pickMealie.launch(MEALIE_TYPES) }) { Text("Pick file(s)") }
                Field("…or paste Mealie JSON here", pasted, lines = 2) { pasted = it }
                if (pasted.isNotBlank()) OutlinedButton(enabled = !busy, onClick = { scope.launch { readPlan(emptyList(), pasted) } }) { Text("Read") }
                mealiePlan?.let { p ->
                    picksVersion.let { } // re-read after a pick changes
                    val recipes = p.arr("recipes")
                    val options = listOf("" to "New ingredient") + d.ingredients.map { it.id to "= ${it.name}" }
                    recipes.forEachIndexed { ri, r ->
                        HorizontalDivider()
                        Text("${r.str("name")} · makes ${numText(r.num("yieldCount"))} ${r.str("yieldLabel")}", fontWeight = FontWeight.SemiBold)
                        ((r as JsonObject)["lines"] as? JsonArray)?.forEachIndexed { li, l ->
                            val cur = picks.getOrNull(ri)?.getOrNull(li) ?: ""
                            Muted("${numText(l.num("quantity"))} ${l.str("unit")} ${l.str("ingredientName")}")
                            Picker("New: ${l.str("ingredientName")}", cur, options.map { if (it.first == "") "" to "➕ New: ${l.str("ingredientName")}" else it }) { v ->
                                picks.getOrNull(ri)?.let { row -> if (li < row.size) { row[li] = v; picksVersion++ } }
                            }
                        }
                    }
                    p.arr("notes").forEach { Text(it.jsonPrimitive.content, color = AmberDark) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Replace recipes with the same name that are already here", Modifier.weight(1f))
                        Switch(mealieReplace, { mealieReplace = it })
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy, onClick = {
                            val withPicks = buildJsonArray {
                                recipes.forEachIndexed { ri, r ->
                                    val ro = r as JsonObject
                                    add(JsonObject(ro + ("lines" to buildJsonArray {
                                        (ro["lines"] as? JsonArray)?.forEachIndexed { li, l ->
                                            val id = picks.getOrNull(ri)?.getOrNull(li).orEmpty()
                                            add(if (id.isBlank()) l else JsonObject(l.jsonObject + ("ingredientId" to JsonPrimitive(id))))
                                        }
                                    })))
                                }
                            }
                            scope.launch {
                                runImport(buildJsonObject { put("recipes", withPicks); put("replace", mealieReplace) })?.let {
                                    mealieMsg = "Imported: $it. Add bake time on the Recipes tab."; mealiePlan = null; pasted = ""
                                }
                            }
                        }) { Text(if (busy) "Importing…" else "Import ${recipes.size} recipe(s)") }
                        OutlinedButton(onClick = { mealiePlan = null }) { Text("Cancel") }
                    }
                }
                if (mealieMsg.isNotBlank()) Text(mealieMsg)
            }
        }
        item {
            SectionCard("For your accountant") {
                Muted("Sales (paid orders plus imported Hotplate sales), expenses from Receipts, giveaways, and a month-by-month summary. Card fees are in your Stripe dashboard.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DateField("From", from, Modifier.weight(1f)) { from = it }
                    DateField("To", to, Modifier.weight(1f)) { to = it }
                }
                listOf("summary" to "Monthly summary", "sales" to "Sales", "expenses" to "Expenses", "giveaways" to "Giveaways").chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (w, l) -> OutlinedButton(enabled = !busy, onClick = { export(w, true) }, modifier = Modifier.weight(1f)) { Text(l) } }
                    }
                }
            }
        }
        item {
            SectionCard("Export the cost analysis") {
                Muted("CSV files that open in Google Sheets or Excel. Pick where to send each one.")
                listOf("recipes" to "Recipe summary", "lines" to "Recipe lines", "ingredients" to "Ingredient costs", "receipts" to "Receipts").chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (w, l) -> OutlinedButton(enabled = !busy, onClick = { export(w, false) }, modifier = Modifier.weight(1f)) { Text(l) } }
                    }
                }
            }
        }
        item {
            SectionCard("Start over") {
                Muted("Clears what was imported so you can bring in a cleaner file. Ingredients, recipes and their product links stay.")
                listOf(
                    Triple("Purchase log (${d.purchases.size})", clearPurchases) { v: Boolean -> clearPurchases = v },
                    Triple("Set prices on ingredients never bought ($manualCount)", clearManual) { v: Boolean -> clearManual = v },
                    Triple("Receipts (${d.receipts.size})", clearReceipts) { v: Boolean -> clearReceipts = v },
                ).forEach { (label, on, set) ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(on, { set(it) })
                        Text(label)
                    }
                }
                val what = listOfNotNull(
                    if (clearPurchases) "all ${d.purchases.size} purchases" else null,
                    if (clearReceipts) "all ${d.receipts.size} receipts" else null,
                    if (clearManual) "the set prices on $manualCount ingredients" else null,
                )
                OutlinedButton(enabled = what.isNotEmpty(), onClick = {
                    ask = Ask("Delete ${what.joinToString(", ")}?", "This can't be undone. Ingredients, recipes and their product links stay.") {
                        val clear = listOfNotNull(if (clearPurchases) "purchases" else null, if (clearReceipts) "receipts" else null, if (clearManual) "manual" else null).joinToString(",")
                        scope.launch { save("DELETE", "/api/costs?clear=$clear", null)?.let { ctx.toast("Done. Import your cleaned-up file above.") } }
                    }
                }) { Text("Delete selected", color = Red) }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}
