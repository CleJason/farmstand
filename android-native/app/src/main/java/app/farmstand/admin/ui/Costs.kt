package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.json
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** Sends a change to the Costs API; the reply is the fresh data (null when it failed, after showing why). */
typealias CostSave = suspend (method: String, path: String, body: JsonObject?) -> CostsData?

private val TABS = listOf("Products", "Recipes", "Baking", "Ingredients", "Purchases", "Receipts", "Import / Export")

@Composable
fun CostsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var data by remember { mutableStateOf<CostsData?>(null) }
    var tab by remember { mutableIntStateOf(1) }
    val save: CostSave = { method, path, body ->
        ctx.attempt(onAuthError) {
            when (method) {
                "POST" -> api.post(path, body)
                "PUT" -> api.put(path, body ?: buildJsonObject { })
                "DELETE" -> api.delete(path)
                else -> api.get(path)
            }
        }?.let { r -> runCatching { json.decodeFromString<CostsData>(r) }.getOrNull() }?.also { data = it }
    }
    LaunchedEffect(Unit) { save("GET", "/api/costs", null) }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize()) {
        EditorBar("Costs", onBack)
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
            TABS.forEachIndexed { i, t ->
                Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t) })
            }
        }
        val d = data
        if (d == null) { Muted("Loading…", Modifier.padding(16.dp)); return@Column }
        if (d.ingredients.isEmpty() && d.recipes.isEmpty()) {
            Muted("Nothing here yet. Use Import / Export to bring in your cost spreadsheet or Mealie recipes, or add ingredients and purchases by hand.", Modifier.padding(16.dp))
        }
        when (tab) {
            0 -> CostProductsTab(d, save)
            1 -> RecipesTab(d, save)
            2 -> BakingTab(api, onAuthError, d, save)
            3 -> IngredientsTab(d, save)
            4 -> PurchasesTab(d, save)
            5 -> ReceiptsTab(api, d, save)
            6 -> ImportExportTab(api, onAuthError, d, save)
        }
    }
}

/** A drop-down choice: shows the picked option's label (or `label` when none). */
@Composable
fun Picker(label: String, value: String, options: List<Pair<String, String>>, modifier: Modifier = Modifier, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) {
            Text(options.firstOrNull { it.first == value }?.second ?: label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(open, { open = false }) {
            options.forEach { (k, v) -> DropdownMenuItem(text = { Text(v) }, onClick = { open = false; onPick(k) }) }
        }
    }
}

/** A one-field question, like the website's prompt(). */
class TextQ(val title: String, val initial: String = "", val number: Boolean = false, val onOk: (String) -> Unit)

@Composable
fun TextQDialog(q: TextQ, onDismiss: () -> Unit) {
    var v by remember(q) { mutableStateOf(q.initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(q.title) },
        text = { Field("", v, decimal = q.number) { v = it } },
        confirmButton = { TextButton(onClick = { onDismiss(); q.onOk(v) }) { Text("OK") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

private val MEASURED = listOf("g" to "Weighed (g, oz, cups…)", "ml" to "Liquid (ml, fl oz, cups…)", "pc" to "Counted (pieces)")

/** New ingredient or packaging item: its name and how it's measured. */
@Composable
fun NewIngredientDialog(onDismiss: () -> Unit, onAdd: (String, String) -> Unit) {
    var name by remember { mutableStateOf("") }
    var base by remember { mutableStateOf("g") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New ingredient or packaging") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Name", name, placeholder = "Bread Flour, 6x6 Box…") { name = it }
                Picker("Measured by", base, MEASURED) { base = it }
            }
        },
        confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { onDismiss(); onAdd(name.trim(), base) }) { Text("Add") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ---------- Products: the recipes and packaging each product uses ----------

private class Tag(val ref: String, val amount: String)

@Composable
private fun CostProductsTab(d: CostsData, save: CostSave) {
    var search by remember { mutableStateOf("") }
    var open by remember { mutableStateOf<CostProduct?>(null) }
    open?.let { p -> ProductTagsEditor(d, save, p) { open = null }; return }
    val q = search.trim().lowercase()
    val list = d.products.filter { q.isEmpty() || it.name.lowercase().contains(q) }.sortedBy { it.price == null }
    val untagged = d.products.count { it.active && !it.isBox && it.links.isEmpty() }
    LazyColumn {
        item {
            Muted(
                "Tag the recipes each product uses and how much of each, in the recipe's own units: a 4-pack of rolls uses 4 of a Cinnamon Rolls recipe that makes 8. " +
                    "Mix & match boxes cost what's picked, so tag their choices; tag the box itself only with what every box has, like packaging." +
                    if (untagged > 0) " $untagged product(s) have no recipes yet." else "",
                Modifier.padding(16.dp),
            )
            Field("Search products", search, Modifier.fillMaxWidth().padding(horizontal = 16.dp)) { search = it }
        }
        items(list, key = { it.key }) { p ->
            val cost = if (p.links.isNotEmpty()) d.linksCost(p.links) else null
            val price = p.price?.let { it / 100.0 }
            val profit = if (cost != null && price != null) price - cost else null
            SectionCard(modifier = Modifier.clickable { open = p }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, Modifier.weight(1f), fontWeight = FontWeight.SemiBold, color = if (p.active) MaterialTheme.colorScheme.onSurface else Stone)
                    Text(usd(cost), fontWeight = FontWeight.SemiBold)
                }
                val uses = p.links.mapNotNull { l -> d.refCost(l.ref)?.let { "${numText(l.itemsPerUnit)} ${it.unit} ${it.name}" } }.joinToString(" + ")
                when {
                    uses.isNotBlank() -> Muted(uses)
                    p.isBox -> Muted("from its choices")
                    else -> Text("tag recipes", color = AmberDark)
                }
                Row {
                    Muted(if (price == null) (if (p.isBox) "" else "box choice") else "Sells for ${usd(price)}", Modifier.weight(1f))
                    if (profit != null) Text(
                        "Profit ${usd(profit)}" + (price?.takeIf { it > 0 }?.let { " (${Math.round(profit / it * 100)}%)" } ?: ""),
                        color = if (profit < 0) Red else Stone,
                    )
                }
            }
        }
        if (list.isEmpty()) item { Muted("No products${if (q.isNotEmpty()) " match" else " yet"}.", Modifier.padding(16.dp)) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun ProductTagsEditor(d: CostsData, save: CostSave, p: CostProduct, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val tags = remember { (d.tags[tagKey(p.name)] ?: emptyList()).map { Tag(it.ref, numText(it.itemsPerUnit)) }.toMutableStateList() }
    var busy by remember { mutableStateOf(false) }
    BackHandler(onBack = onClose)
    val options = d.recipes.map { "r:${it.id}" to "${it.name} (makes ${numText(it.yieldCount)} ${it.yieldLabel})" } +
        d.ingredients.sortedWith(compareByDescending<CostIngredientRow> { it.baseUnit == "pc" }.thenBy { it.name })
            .map { "i:${it.id}" to "${it.name} (${if (it.baseUnit == "pc") "each" else it.baseUnit})" }
    Column(Modifier.verticalScroll(rememberScrollState()).imePadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("One ${p.name} uses:", fontWeight = FontWeight.SemiBold)
        tags.forEachIndexed { i, t ->
            val c = d.refCost(t.ref)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Field("How much", t.amount, Modifier.width(96.dp), decimal = true) { tags[i] = Tag(t.ref, it) }
                Picker("Pick a recipe or item…", t.ref, options, Modifier.weight(1f)) { tags[i] = Tag(it, t.amount) }
                IconButtonText("×") { tags.removeAt(i) }
            }
            if (c != null) Muted("${if (t.ref.startsWith("i:")) c.unit else "${c.unit} from ${c.name}"} · ${usd(c.each * (t.amount.toDoubleOrNull() ?: 0.0))}")
        }
        TextButton(onClick = { tags.add(Tag("", "1")) }) { Text("+ Add a recipe or packaging") }
        val cost = tags.sumOf { (d.refCost(it.ref)?.each ?: 0.0) * (it.amount.toDoubleOrNull() ?: 0.0) }
        val price = (p.price ?: 0) / 100.0
        if (tags.isNotEmpty()) Text(
            "Cost to make one: ${usd(cost)}" + if (price > 0 && cost > 0) " · profit ${usd(price - cost)} (${Math.round((price - cost) / price * 100)}%)" else "",
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !busy, onClick = {
                busy = true
                scope.launch {
                    val ok = save("PUT", "/api/costs/links", buildJsonObject {
                        put("name", p.name)
                        putJsonArray("links") {
                            tags.filter { it.ref.length > 2 && (it.amount.toDoubleOrNull() ?: 0.0) > 0 }.forEach { t ->
                                addJsonObject {
                                    if (t.ref.startsWith("i:")) put("ingredientId", t.ref.substring(2)) else put("recipeId", t.ref.substring(2))
                                    put("itemsPerUnit", t.amount)
                                }
                            }
                        }
                    }) != null
                    busy = false
                    if (ok) onClose()
                }
            }) { Text(if (busy) "Saving…" else "Save") }
            OutlinedButton(onClick = onClose) { Text("Cancel") }
        }
    }
}

@Composable
fun IconButtonText(text: String, onClick: () -> Unit) = TextButton(onClick = onClick, contentPadding = PaddingValues(4.dp)) { Text(text) }

// ---------- Recipes ----------

@Composable
private fun RecipesTab(d: CostsData, save: CostSave) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf<String?>(null) } // recipe id, or "new"
    var rate by remember(d.settings.overheadRate) { mutableStateOf(numText(d.settings.overheadRate)) }
    open?.let { id ->
        RecipeEditor(d, save, d.recipes.firstOrNull { it.id == id }, onClose = { open = null }, onOpen = { open = it })
        return
    }
    LazyColumn {
        item {
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Overhead (bake/labor) \$/hr", rate, Modifier.weight(1f), decimal = true) { rate = it }
                    OutlinedButton(onClick = {
                        scope.launch { save("PUT", "/api/costs", buildJsonObject { put("overheadRate", rate) })?.let { ctx.toast("Saved") } }
                    }) { Text("Save") }
                }
                Text("Cost with")
                Picker("Cost with", d.settings.basis, listOf("average" to "Average price paid", "latest" to "Latest price paid")) { b ->
                    scope.launch { save("PUT", "/api/costs", buildJsonObject { put("basis", b) })?.let { ctx.toast("Saved") } }
                }
                Button(onClick = { open = "new" }) { Text("+ New recipe") }
            }
        }
        items(d.recipes, key = { it.id }) { r ->
            val c = r.cost
            val usedIn = d.products.filter { p -> p.links.any { it.recipeId == r.id } }.joinToString(", ") { it.name }
            SectionCard(modifier = Modifier.clickable { open = r.id }) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontWeight = FontWeight.SemiBold)
                        Muted("Makes ${numText(r.yieldCount)} ${r.yieldLabel}")
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("${usd(c.perItem)} each", fontWeight = FontWeight.SemiBold)
                        Muted("${usd(c.batch)} a batch")
                    }
                }
                if (c.problems > 0 || c.estimates > 0) Text(
                    listOfNotNull(
                        if (c.problems > 0) "${c.problems} line(s) can't be priced" else null,
                        if (c.estimates > 0) "${c.estimates} line(s) in cups/spoons without grams per cup" else null,
                    ).joinToString("; ", prefix = "⚠ "),
                    color = AmberDark,
                )
                if (usedIn.isNotBlank()) Muted("Used in $usedIn") else Muted("not tagged")
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

private class LineForm(val ingredientId: String = "", val quantity: String = "", val unit: String = "g", val note: String = "")

@Composable
private fun RecipeEditor(d: CostsData, save: CostSave, recipe: CostRecipeRow?, onClose: () -> Unit, onOpen: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember(recipe?.id) { mutableStateOf(recipe?.name ?: "") }
    var yieldCount by remember(recipe?.id) { mutableStateOf(numText(recipe?.yieldCount ?: 12.0)) }
    var yieldLabel by remember(recipe?.id) { mutableStateOf(recipe?.yieldLabel ?: "cookies") }
    var hours by remember(recipe?.id) { mutableStateOf(numText(recipe?.overheadHours ?: 0.0)) }
    var notes by remember(recipe?.id) { mutableStateOf(recipe?.notes ?: "") }
    val lines = remember(recipe?.id) {
        (recipe?.lines ?: emptyList()).map { LineForm(it.ingredientId, numText(it.quantity), it.unit, it.note ?: "") }.toMutableStateList()
    }
    var busy by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    var q by remember { mutableStateOf<TextQ?>(null) }
    var newFor by remember { mutableStateOf<Int?>(null) }
    val byId = d.ingredients.associateBy { it.id }
    BackHandler(onBack = onClose)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }
    q?.let { TextQDialog(it) { q = null } }
    newFor?.let { i ->
        NewIngredientDialog({ newFor = null }) { n, base ->
            scope.launch {
                val fresh = save("POST", "/api/costs/ingredients", buildJsonObject { put("name", n); put("baseUnit", base) }) ?: return@launch
                fresh.ingredients.firstOrNull { it.name.equals(n.replace(Regex("\\s+"), " "), ignoreCase = true) }?.let { made ->
                    if (i < lines.size) lines[i] = LineForm(made.id, lines[i].quantity, made.baseUnit, lines[i].note)
                }
            }
        }
    }

    fun body(n: String) = buildJsonObject {
        put("name", n); put("yieldCount", yieldCount); put("yieldLabel", yieldLabel); put("overheadHours", hours); put("notes", notes)
        putJsonArray("lines") {
            lines.filter { it.ingredientId.isNotBlank() }.forEach { l ->
                addJsonObject { put("ingredientId", l.ingredientId); put("quantity", l.quantity); put("unit", l.unit); put("note", l.note) }
            }
        }
    }

    val results = lines.map { lineCost(it.quantity.toDoubleOrNull() ?: 0.0, it.unit, byId[it.ingredientId]) }
    val ingredientsCost = results.sumOf { it.cost }
    val overhead = (hours.toDoubleOrNull() ?: 0.0) * d.settings.overheadRate
    val batch = ingredientsCost + overhead
    val perItem = batch / (yieldCount.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0)
    val ingOptions = d.ingredients.map { it.id to it.name } + ("__new" to "+ New ingredient…")

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onClose) { Text("‹ Recipes") }
            Spacer(Modifier.weight(1f))
            Text(if (recipe == null) "New recipe" else "Edit recipe", fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
        }
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Recipe", name, placeholder = "Cinnamon Rolls") { name = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Makes", yieldCount, Modifier.weight(1f), decimal = true) { yieldCount = it }
                Field("of", yieldLabel, Modifier.weight(1f), placeholder = "cookies") { yieldLabel = it }
                Field("Bake/labor hrs", hours, Modifier.weight(1f), decimal = true) { hours = it }
            }
            Text("Ingredients & packaging", fontWeight = FontWeight.SemiBold)
            lines.forEachIndexed { i, l ->
                val ing = byId[l.ingredientId]
                val c = results[i]
                SectionCard(modifier = Modifier.padding(0.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Picker("Pick…", l.ingredientId, ingOptions, Modifier.weight(1f)) { v ->
                            if (v == "__new") newFor = i
                            else {
                                val picked = byId[v]
                                val fits = (picked?.baseUnit == "pc") == (l.unit in COUNT_UNITS)
                                lines[i] = LineForm(v, l.quantity, if (fits) l.unit else picked?.baseUnit ?: "g", l.note)
                            }
                        }
                        IconButtonText("✕") { lines.removeAt(i) }
                    }
                    if (ing != null) Muted(unitPrice(ing.cost, ing.baseUnit))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Field("Amount", l.quantity, Modifier.weight(1f), decimal = true) { lines[i] = LineForm(l.ingredientId, it, l.unit, l.note) }
                        Picker("Unit", l.unit, unitsFor(ing?.baseUnit).map { it to it }, Modifier.weight(1f)) { lines[i] = LineForm(l.ingredientId, l.quantity, it, l.note) }
                    }
                    Field("Note", l.note, placeholder = "filling, topping…") { lines[i] = LineForm(l.ingredientId, l.quantity, l.unit, it) }
                    Row {
                        Text(usd(c.cost), Modifier.weight(1f))
                        c.problem?.let { Text(it, color = Red) }
                        if (c.estimated == true) Text("estimate (set grams per cup)", color = AmberDark)
                    }
                }
            }
            TextButton(onClick = { lines.add(LineForm()) }) { Text("+ Add ingredient") }
            SectionCard(modifier = Modifier.padding(0.dp)) {
                Row { Muted("Ingredients", Modifier.weight(1f)); Text(usd(ingredientsCost)) }
                Row { Muted("Overhead (${hours.ifBlank { "0" }} hr × ${usd(d.settings.overheadRate)})", Modifier.weight(1f)); Text(usd(overhead)) }
                Row { Muted("Batch cost", Modifier.weight(1f)); Text(usd(batch), fontWeight = FontWeight.SemiBold) }
                Row { Muted("Per ${yieldLabel.removeSuffix("s").ifBlank { "item" }}", Modifier.weight(1f)); Text(usd(perItem), fontWeight = FontWeight.SemiBold) }
            }
            if (recipe != null) {
                val used = d.products.filter { p -> p.links.any { it.recipeId == recipe.id } }
                    .joinToString(", ") { p -> "${p.name} (${numText(p.links.first { it.recipeId == recipe.id }.itemsPerUnit)} $yieldLabel)" }
                Muted("Used in: ${used.ifBlank { "nothing yet" }}. Tag products with the recipes they use on the Products tab.")
            }
            Field("Notes", notes, lines = 2) { notes = it }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(enabled = !busy && name.isNotBlank(), onClick = {
                    busy = true
                    scope.launch {
                        val b = body(name)
                        val withId = if (recipe != null) JsonObject(b + ("id" to kotlinx.serialization.json.JsonPrimitive(recipe.id))) else b
                        val ok = save("POST", "/api/costs/recipes", withId) != null
                        busy = false
                        if (ok) onClose()
                    }
                }) { Text(if (busy) "Saving…" else if (recipe != null) "Save recipe" else "Add recipe") }
                OutlinedButton(onClick = onClose) { Text("Cancel") }
            }
            if (recipe != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(enabled = !busy, onClick = {
                    q = TextQ("Name for the copy", "$name (copy)") { copy ->
                        val n = copy.trim()
                        if (n.isNotEmpty()) scope.launch {
                            val fresh = save("POST", "/api/costs/recipes", body(n)) ?: return@launch
                            fresh.recipes.firstOrNull { it.name.equals(n.replace(Regex("\\s+"), " "), ignoreCase = true) }?.let { onOpen(it.id) } ?: onClose()
                        }
                    }
                }) { Text("Duplicate") }
                TextButton(onClick = {
                    ask = Ask("Delete the recipe \"${recipe.name}\"?", "Ingredients and purchases stay.") {
                        scope.launch { if (save("DELETE", "/api/costs/recipes?id=${java.net.URLEncoder.encode(recipe.id, "UTF-8")}", null) != null) onClose() }
                    }
                }) { Text("Delete recipe", color = Red) }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
