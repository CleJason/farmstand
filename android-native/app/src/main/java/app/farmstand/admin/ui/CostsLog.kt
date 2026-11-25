package app.farmstand.admin.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.dayText
import app.farmstand.admin.json
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.net.URLEncoder
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

/** Cost dates are whole days saved at midnight UTC: read the day itself, not the local time. */
private fun day(iso: String): LocalDate? = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull()
private fun dayLabel(iso: String) = day(iso)?.let { DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US).format(it) } ?: ""

// ---------- Ingredients ----------

@Composable
fun IngredientsTab(d: CostsData, save: CostSave) {
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CostIngredientRow?>(null) }
    var counting by remember { mutableStateOf<CostIngredientRow?>(null) }
    var merging by remember { mutableStateOf<CostIngredientRow?>(null) }
    var q by remember { mutableStateOf<TextQ?>(null) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    fun change(i: CostIngredientRow, block: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) {
        scope.launch { save("PUT", "/api/costs/ingredients", buildJsonObject { put("id", i.id); block() }) }
    }

    if (adding) NewIngredientDialog({ adding = false }) { n, base ->
        scope.launch { save("POST", "/api/costs/ingredients", buildJsonObject { put("name", n); put("baseUnit", base) }) }
    }
    editing?.let { i -> IngredientEditDialog(i, { editing = null }) { gpc, manual, base, factor ->
        change(i) {
            if (i.baseUnit != "pc" && gpc != (i.gramsPerCup?.let(::numText) ?: "")) put("gramsPerCup", gpc)
            if (i.purchases == 0 && manual != (i.manualCost?.let(::numText) ?: "")) put("manualCost", manual)
            if (base != i.baseUnit) { put("baseUnit", base); if (factor != null) put("convertFactor", factor) }
        }
    } }
    counting?.let { i -> CountDialog(i, { counting = null }) { qty, unit ->
        scope.launch {
            save("POST", "/api/costs/counts", buildJsonObject {
                putJsonArray("counts") { addJsonObject { put("ingredientId", i.id); put("quantity", qty); put("unit", unit) } }
            })
        }
    } }
    merging?.let { i ->
        val targets = d.ingredients.filter { it.id != i.id && (it.baseUnit == i.baseUnit || i.purchases == 0) }
        AlertDialog(
            onDismissRequest = { merging = null },
            title = { Text("Merge \"${i.name}\" into…") },
            text = {
                LazyColumn(Modifier.heightIn(max = 400.dp)) {
                    items(targets, key = { it.id }) { t ->
                        Text(t.name, Modifier.fillMaxWidth().clickable {
                            merging = null
                            ask = Ask("Merge \"${i.name}\" into \"${t.name}\"?", "Its purchases and recipe lines move over.") { change(i) { put("mergeInto", t.id) } }
                        }.padding(vertical = 10.dp))
                    }
                }
            },
            confirmButton = { TextButton(onClick = { merging = null }) { Text("Cancel") } },
        )
    }
    q?.let { TextQDialog(it) { q = null } }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }

    val s = search.trim().lowercase()
    val list = d.ingredients.filter { s.isEmpty() || it.name.lowercase().contains(s) }
    val needCup = d.ingredients.count { it.baseUnit == "g" && it.gramsPerCup == null && it.usedIn > 0 }
    LazyColumn {
        item {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Field("Search ingredients", search, Modifier.weight(1f)) { search = it }
                Spacer(Modifier.width(8.dp))
                Button(onClick = { adding = true }) { Text("+ Add") }
            }
            Muted(
                "Prices come from Purchases. On hand starts once you count an item; purchases add to it and logged bakes take from it. " +
                    "Grams per cup lets recipes in cups and spoons cost right." + if (needCup > 0) " $needCup used in recipes still need it." else "",
                Modifier.padding(horizontal = 16.dp),
            )
        }
        items(list, key = { it.id }) { i ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(i.name, fontWeight = FontWeight.SemiBold)
                        Muted(when (i.baseUnit) { "pc" -> "counted"; "ml" -> "liquid"; else -> "weighed" } + if (i.usedIn > 0) " · in ${i.usedIn} recipe line(s)" else "")
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(unitPrice(i.average, i.baseUnit), fontWeight = FontWeight.SemiBold)
                        Muted("latest ${unitPrice(i.latest, i.baseUnit)}")
                    }
                }
                Row {
                    val low = i.onHand != null && i.onHand <= 0
                    Text(
                        when { i.onHand == null -> "On hand: not counted"; low -> "On hand: out"; else -> "On hand: ${amountText(i.onHand, i.baseUnit)}" },
                        Modifier.weight(1f),
                        color = if (low) Red else Stone,
                    )
                    if (i.purchases > 0) Muted("${i.purchases}× · ${usd(i.spent)}")
                    else Muted(i.manualCost?.let { "est. ${usd(it, 3)}/${i.baseUnit}" } ?: "no purchases")
                }
                if (i.baseUnit != "pc") Muted("Grams per cup: ${i.gramsPerCup?.let(::numText) ?: suggestGpc(i.name)?.let { "not set (about $it)" } ?: "not set"}")
                Row {
                    SmallAction("Count") { counting = i }
                    SmallAction("Edit") { editing = i }
                    SmallAction("Rename") { q = TextQ("Rename to", i.name) { n -> if (n.isNotBlank() && n.trim() != i.name) change(i) { put("name", n) } } }
                    SmallAction("Merge") { merging = i }
                    SmallAction("Delete") {
                        ask = Ask("Delete \"${i.name}\"${if (i.purchases > 0) " and its ${i.purchases} purchases" else ""}?", "") {
                            scope.launch { save("DELETE", "/api/costs/ingredients?id=${enc(i.id)}", null) }
                        }
                    }
                }
            }
        }
        if (list.isEmpty()) item { Muted("No ingredients${if (s.isNotEmpty()) " match" else " yet"}.", Modifier.padding(16.dp)) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

private val GPC = listOf(
    "powdered|confectioner|icing sugar" to 120, "brown sugar" to 213, "sugar" to 200, "almond flour" to 96, "flour" to 120, "cocoa" to 85,
    "cornstarch|corn starch" to 112, "oats" to 90, "cinnamon|nutmeg|clove|ginger|allspice|spice" to 110,
    "peanut butter|biscoff|cookie butter|nutella|spread" to 270, "butter(?! ?milk)" to 227, "cream cheese" to 232, "yogurt|sour cream" to 245,
    "pumpkin" to 245, "honey|molasses|syrup" to 340, "marshmallow fluff|marshmallow creme" to 128, "morsel|chocolate chip|chips" to 170,
    "salt" to 288, "baking soda" to 220, "baking powder" to 192, "yeast" to 150, "dry milk|milk powder|powdered milk" to 68,
    "milk|cream|water|oil|extract|vanilla" to 236,
)
private fun suggestGpc(name: String) = GPC.firstOrNull { Regex(it.first, RegexOption.IGNORE_CASE).containsMatchIn(name) }?.second

@Composable
private fun IngredientEditDialog(i: CostIngredientRow, onDismiss: () -> Unit, onSave: (String, String, String, Double?) -> Unit) {
    var gpc by remember { mutableStateOf(i.gramsPerCup?.let(::numText) ?: "") }
    var manual by remember { mutableStateOf(i.manualCost?.let(::numText) ?: "") }
    var base by remember { mutableStateOf(i.baseUnit) }
    var factor by remember { mutableStateOf("") }
    val word = mapOf("g" to "grams", "ml" to "ml", "pc" to "pieces")
    val one = mapOf("g" to "gram", "ml" to "ml", "pc" to "piece")
    val needFactor = base != i.baseUnit && i.purchases > 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(i.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Picker("Measured by", base, listOf("g" to "Weighed (g, oz, cups…)", "ml" to "Liquid (ml, fl oz, cups…)", "pc" to "Counted (pieces)")) { base = it }
                if (needFactor) Field("How many ${word[base]} is 1 ${one[i.baseUnit]}?", factor, decimal = true) { factor = it }
                if (base != "pc") Field("Grams per cup", gpc, decimal = true, placeholder = suggestGpc(i.name)?.let { "about $it" } ?: "g") { gpc = it }
                if (i.purchases == 0) Field("Cost per ${i.baseUnit} (\$, no purchases yet)", manual, decimal = true) { manual = it }
            }
        },
        confirmButton = {
            TextButton(enabled = !needFactor || (factor.toDoubleOrNull() ?: 0.0) > 0, onClick = {
                onDismiss(); onSave(gpc, manual, base, if (needFactor) factor.toDoubleOrNull() else null)
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CountDialog(i: CostIngredientRow, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    val units = when (i.baseUnit) { "pc" -> COUNT_UNITS; "ml" -> VOLUME_UNITS + WEIGHT_UNITS; else -> WEIGHT_UNITS + VOLUME_UNITS }
    var qty by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf(when (i.baseUnit) { "g" -> "lb"; "ml" -> "fl oz"; else -> "pc" }) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Count ${i.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Muted("What's on the shelf right now.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field("Amount", qty, Modifier.weight(1f), decimal = true) { qty = it }
                    Picker("Unit", unit, units.map { it to it }, Modifier.weight(1f)) { unit = it }
                }
            }
        },
        confirmButton = { TextButton(enabled = qty.toDoubleOrNull() != null, onClick = { onDismiss(); onSave(qty, unit) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

// ---------- Purchases ----------

@Composable
fun PurchasesTab(d: CostsData, save: CostSave) {
    val scope = rememberCoroutineScope()
    var date by remember { mutableStateOf(LocalDate.now()) }
    var store by remember { mutableStateOf("") }
    var item by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf("lb") }
    var price by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }
    val byId = d.ingredients.associateBy { it.id }
    val stores = d.purchases.mapNotNull { it.store?.takeIf(String::isNotBlank) }.distinct()
    fun pickItem(name: String) {
        item = name
        val ing = d.ingredients.firstOrNull { it.name.equals(name.trim(), ignoreCase = true) }
        if (ing?.baseUnit == "pc") unit = "pc" else if (ing?.baseUnit == "ml" && unit !in VOLUME_UNITS) unit = "fl oz"
    }
    val s = search.trim().lowercase()
    val list = d.purchases.filter { p -> s.isEmpty() || byId[p.ingredientId]?.name?.lowercase()?.contains(s) == true || p.store?.lowercase()?.contains(s) == true }
    val month = LocalDate.now().toString().take(7)
    val thisMonth = d.purchases.filter { it.date.take(7) == month }.sumOf { it.price } / 100.0

    LazyColumn(Modifier.imePadding()) {
        item {
            SectionCard("Add a purchase") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DateField("Date", date, Modifier.weight(1f)) { date = it }
                    Field("Store", store, Modifier.weight(1f), placeholder = "Costco") { store = it }
                }
                Suggestions(store, stores) { store = it }
                Field("Item", item, placeholder = "Bread Flour") { pickItem(it) }
                Suggestions(item, d.ingredients.map { it.name }) { pickItem(it) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field("Amount", qty, Modifier.weight(1f), decimal = true) { qty = it }
                    Picker("Unit", unit, ALL_UNITS.map { it to it }, Modifier.weight(1f)) { unit = it }
                    Field("Paid (\$)", price, Modifier.weight(1f), decimal = true) { price = it }
                }
                Button(enabled = !busy && item.isNotBlank() && qty.isNotBlank() && price.isNotBlank(), onClick = {
                    busy = true
                    scope.launch {
                        val ing = d.ingredients.firstOrNull { it.name.equals(item.trim(), ignoreCase = true) }
                        val ok = save("POST", "/api/costs/purchases", buildJsonObject {
                            ing?.let { put("ingredientId", it.id) }
                            put("ingredientName", item); put("date", date.toString()); put("store", store)
                            put("quantity", qty); put("unit", unit); put("price", price)
                        }) != null
                        busy = false
                        if (ok) { item = ""; qty = ""; price = "" } // keep date + store for the rest of the receipt
                    }
                }) { Text(if (busy) "Adding…" else "+ Add") }
                Muted("Enter the package size as printed (5 lb, 32 oz, 1 gal, 18 count). A new item name adds it to Ingredients.")
            }
            Text("This month: ${usd(thisMonth)} · ${d.purchases.size} purchases logged", Modifier.padding(horizontal = 16.dp), fontWeight = FontWeight.SemiBold)
            Field("Search item or store", search, Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) { search = it }
        }
        items(list.take(300), key = { it.id }) { p ->
            val ing = byId[p.ingredientId]
            val base = ing?.baseUnit ?: "g"
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(ing?.name ?: "?", fontWeight = FontWeight.SemiBold)
                        Muted("${dayLabel(p.date)} · ${p.store ?: "—"} · ${amountText(p.quantity, base)}")
                        Muted(unitPrice(if (p.quantity > 0) p.price / 100.0 / p.quantity else null, base))
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(usd(p.price / 100.0), fontWeight = FontWeight.SemiBold)
                        SmallAction("Delete") {
                            ask = Ask("Delete this ${ing?.name ?: ""} purchase?", "") { scope.launch { save("DELETE", "/api/costs/purchases?id=${enc(p.id)}", null) } }
                        }
                    }
                }
            }
        }
        if (list.isEmpty()) item { Muted("No purchases${if (s.isNotEmpty()) " match" else " yet"}.", Modifier.padding(16.dp)) }
        if (list.size > 300) item { Muted("Showing the latest 300. Search to find older ones.", Modifier.padding(16.dp)) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

/** Up to 4 matching names under a field, tap to fill it in. */
@Composable
private fun Suggestions(typed: String, all: List<String>, onPick: (String) -> Unit) {
    val t = typed.trim().lowercase()
    if (t.isEmpty()) return
    val hits = all.filter { it.lowercase().contains(t) && !it.equals(typed.trim(), ignoreCase = true) }.take(4)
    if (hits.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        hits.forEach { h -> AssistChip(onClick = { onPick(h) }, label = { Text(h, maxLines = 1) }) }
    }
}

// ---------- Receipts ----------

private val CATEGORIES = listOf("Ingredients", "Packaging", "Equipment", "Website & software", "Other")

@Composable
fun ReceiptsTab(api: Api, d: CostsData, save: CostSave) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var date by remember { mutableStateOf(LocalDate.now()) }
    var vendor by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Ingredients") }
    var imageUrl by remember { mutableStateOf("") }
    var uploading by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<String?>(null) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            uploading = true
            val bytes = photoBytes(ctx, uri)
            if (bytes == null) ctx.toast("Couldn't read that photo")
            else ctx.attempt({}) { api.upload(bytes, "image/jpeg", "receipt.jpg") }?.let { imageUrl = it }
            uploading = false
        }
    }
    viewing?.let { url ->
        AlertDialog(
            onDismissRequest = { viewing = null },
            text = { AsyncImage(model = api.absolute(url), contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth()) },
            confirmButton = { TextButton(onClick = { viewing = null }) { Text("Close") } },
        )
    }
    val vendors = (d.receipts.map { it.vendor } + d.purchases.mapNotNull { it.store }).filter(String::isNotBlank).distinct()
    val year = LocalDate.now().year.toString()
    val thisYear = d.receipts.filter { it.date.startsWith(year) }
    val months = d.receipts.groupBy { it.date.take(7) }

    LazyColumn(Modifier.imePadding()) {
        item {
            SectionCard("Add a receipt") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DateField("Date", date, Modifier.weight(1f)) { date = it }
                    Field("Total (\$)", amount, Modifier.weight(1f), decimal = true) { amount = it }
                }
                Field("Vendor", vendor, placeholder = "Costco") { vendor = it }
                Suggestions(vendor, vendors) { vendor = it }
                Field("What for", description, placeholder = "Flour, butter, eggs") { description = it }
                Picker("Category", category, CATEGORIES.map { it to it }) { category = it }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled = !uploading, onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                        Text(if (uploading) "Uploading…" else if (imageUrl.isNotBlank()) "Change photo" else "Add photo")
                    }
                    if (imageUrl.isNotBlank()) Text("✓ attached", color = Green)
                }
                Button(enabled = vendor.isNotBlank() && amount.isNotBlank() && !uploading, onClick = {
                    scope.launch {
                        val ok = save("POST", "/api/costs/receipts", buildJsonObject {
                            put("date", date.toString()); put("vendor", vendor); put("amount", amount)
                            put("description", description); put("category", category); put("imageUrl", imageUrl)
                        }) != null
                        if (ok) { vendor = ""; amount = ""; description = ""; imageUrl = "" }
                    }
                }) { Text("+ Add receipt") }
                Muted("Log every receipt here (for your records and taxes). The ingredient lines on it go in Purchases, which is what recipe costs use.")
            }
            Text("$year so far: ${usd(thisYear.sumOf { it.amount } / 100.0)} across ${thisYear.size} receipts", Modifier.padding(horizontal = 16.dp), fontWeight = FontWeight.SemiBold)
        }
        months.forEach { (ym, list) ->
            item(key = ym) {
                val label = runCatching { DateTimeFormatter.ofPattern("MMMM yyyy", Locale.US).format(LocalDate.parse("$ym-15")) }.getOrDefault(ym)
                Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                    Text(label, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                    Text(usd(list.sumOf { it.amount } / 100.0), fontWeight = FontWeight.SemiBold)
                }
            }
            items(list, key = { it.id }) { r ->
                val (status, color) = when {
                    r.itemized == 0 -> "not itemized" to Stone
                    Math.abs(r.itemized - r.amount) <= maxOf(50.0, r.amount * 0.08) -> "fully itemized" to Green
                    else -> "${usd(r.itemized / 100.0)} itemized" to AmberDark
                }
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!r.imageUrl.isNullOrBlank() && !r.imageUrl.endsWith(".pdf")) {
                            Box(Modifier.clickable { viewing = r.imageUrl }) { Thumb(api, r.imageUrl, 48) }
                            Spacer(Modifier.width(10.dp))
                        }
                        Column(Modifier.weight(1f)) {
                            Text(r.vendor, fontWeight = FontWeight.SemiBold)
                            Muted("${dayLabel(r.date)} · ${r.description ?: "—"}${r.category?.let { " · $it" } ?: ""}")
                            Text(status, color = color)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(usd(r.amount / 100.0), fontWeight = FontWeight.SemiBold)
                            if (r.imageUrl?.endsWith(".pdf") == true) SmallAction("PDF") { ctx.open(api.absolute(r.imageUrl)) }
                            SmallAction("Delete") {
                                ask = Ask("Delete the ${r.vendor} receipt for ${usd(r.amount / 100.0)}?", "") {
                                    scope.launch { save("DELETE", "/api/costs/receipts?id=${enc(r.id)}", null) }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (d.receipts.isEmpty()) item { Muted("No receipts yet. Add one above.", Modifier.padding(16.dp)) }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ---------- Baking ----------

private val REASON_LABEL = mapOf(
    "drop" to "for the drop", "porch" to "porch extras", "test" to "trying a recipe", "other" to "other",
    "giveaway" to "given away", "tasting" to "tasting", "tossed" to "tossed",
)
private fun halfUp(n: Double) = Math.ceil(n * 2) / 2

@Composable
fun BakingTab(api: Api, onAuthError: () -> Unit, d: CostsData, save: CostSave) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var dropId by remember { mutableStateOf(d.drops.firstOrNull()?.id ?: "") }
    var plan by remember { mutableStateOf<BakePlan?>(null) }
    val bake = remember { mutableStateMapOf<String, String>() }
    val extra = remember { mutableStateMapOf<String, String>() }
    var showNeed by remember { mutableStateOf(false) }
    var ask by remember { mutableStateOf<Ask?>(null) }
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }

    suspend fun loadPlan() {
        if (dropId.isBlank()) return
        val p = ctx.attempt(onAuthError) { api.get("/api/costs/plan?dropId=${enc(dropId)}") }?.let { runCatching { json.decodeFromString<BakePlan>(it) }.getOrNull() }
        plan = p
        bake.clear(); extra.clear()
        p?.recipes?.forEach { r -> bake[r.recipeId] = numText(maxOf(0.0, halfUp(r.batches) - r.logged)) }
    }
    LaunchedEffect(dropId) { loadPlan() }

    // Other baking and leftovers forms
    var oRecipe by remember { mutableStateOf("") }
    var oBatches by remember { mutableStateOf("1") }
    var oReason by remember { mutableStateOf("test") }
    var oNote by remember { mutableStateOf("") }
    var lRecipe by remember { mutableStateOf("") }
    var lCount by remember { mutableStateOf("") }
    var lReason by remember { mutableStateOf("giveaway") }
    var lNote by remember { mutableStateOf("") }
    val recipeOptions = d.recipes.map { it.id to it.name }

    LazyColumn(Modifier.imePadding()) {
        if (d.drops.isNotEmpty()) item {
            SectionCard("Bake for a drop") {
                Muted("From the drop's orders (paid or awaiting Venmo/PayPal). Log it once it's baked.")
                Picker("Drop", dropId, d.drops.map { it.id to "${it.title} (${dayLabel(it.orderOpenAt)})" }) { dropId = it }
                val p = plan
                if (p != null) {
                    if (p.unlinked.isNotEmpty()) Text(
                        "Not linked to a recipe yet: ${p.unlinked.joinToString(", ") { "${it.name} × ${numText(it.quantity)}" }}. Tag them on the Products tab.",
                        color = AmberDark,
                    )
                    if (p.recipes.isEmpty() && p.unlinked.isEmpty()) Muted("No orders in this drop yet.")
                    p.recipes.forEach { r ->
                        HorizontalDivider()
                        Text(r.name, fontWeight = FontWeight.SemiBold)
                        Muted("Ordered ${numText(Math.round(r.items * 100) / 100.0)} ${r.yieldLabel} · needs ${"%.2f".format(Locale.US, r.batches)} batches (makes ${numText(r.yieldCount)})")
                        if (r.logged > 0) Text("${numText(r.logged)} logged already", color = Green)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Bake (batches)", bake[r.recipeId] ?: "", Modifier.weight(1f), decimal = true) { bake[r.recipeId] = it }
                            Field("+ porch extra", extra[r.recipeId] ?: "", Modifier.weight(1f), decimal = true, placeholder = "0") { extra[r.recipeId] = it }
                        }
                    }
                    if (p.recipes.isNotEmpty()) {
                        val short = p.ingredients.any { it.onHand != null && it.onHand < it.need }
                        TextButton(onClick = { showNeed = !showNeed }) {
                            Text((if (showNeed) "Hide" else "Show") + " ingredients needed" + if (short) " · some are short" else "", color = if (short) Red else AmberDark)
                        }
                        if (showNeed) p.ingredients.forEach { i ->
                            val isShort = i.onHand != null && i.onHand < i.need
                            Row {
                                Text(i.name, Modifier.weight(1f))
                                Column(horizontalAlignment = Alignment.End) {
                                    Muted("need ${amountText(i.need, i.baseUnit)}")
                                    Text(
                                        i.onHand?.let { "on hand ${amountText(maxOf(0.0, it), i.baseUnit)}" + if (isShort) " · buy more" else "" } ?: "on hand: not counted",
                                        color = if (isShort) Red else Stone,
                                    )
                                }
                            }
                        }
                        Button(onClick = {
                            val rows = p.recipes.flatMap { r ->
                                listOf(
                                    Triple(r.recipeId, bake[r.recipeId]?.toDoubleOrNull() ?: 0.0, "drop"),
                                    Triple(r.recipeId, extra[r.recipeId]?.toDoubleOrNull() ?: 0.0, "porch"),
                                )
                            }.filter { it.second > 0 }
                            if (rows.isEmpty()) { ctx.toast("Nothing to log"); return@Button }
                            scope.launch {
                                val ok = save("POST", "/api/costs/bakes", buildJsonObject {
                                    putJsonArray("bakes") {
                                        rows.forEach { (id, n, reason) ->
                                            addJsonObject {
                                                put("recipeId", id); put("batches", n); put("reason", reason); put("dropId", dropId)
                                                if (reason == "porch") put("note", "extra for the porch")
                                            }
                                        }
                                    }
                                }) != null
                                if (ok) { ctx.toast("Logged. Ingredients taken out of what's on hand."); loadPlan() }
                            }
                        }) { Text("Log as baked") }
                    }
                }
            }
        }
        item {
            SectionCard("Other baking") {
                Muted("Porch Pickup extras, trying a new recipe, a custom order…")
                Picker("Recipe…", oRecipe, recipeOptions) { oRecipe = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field("Batches", oBatches, Modifier.weight(1f), decimal = true) { oBatches = it }
                    Picker("Why", oReason, listOf("test" to "Trying a recipe", "porch" to "Porch extras", "other" to "Other"), Modifier.weight(1f)) { oReason = it }
                }
                Field("Note (optional)", oNote) { oNote = it }
                Button(enabled = oRecipe.isNotBlank() && (oBatches.toDoubleOrNull() ?: 0.0) > 0, onClick = {
                    scope.launch {
                        val ok = save("POST", "/api/costs/bakes", buildJsonObject {
                            putJsonArray("bakes") { addJsonObject { put("recipeId", oRecipe); put("batches", oBatches); put("reason", oReason); put("note", oNote) } }
                        }) != null
                        if (ok) { ctx.toast("Logged"); oNote = "" }
                    }
                }) { Text("Log") }
            }
        }
        item {
            val month = LocalDate.now().toString().take(7)
            val given = d.itemsOut.filter { it.date.take(7) == month && it.reason == "giveaway" }.sumOf { it.cost } / 100.0
            SectionCard("Leftovers & giveaways") {
                Muted("Didn't sell and went to someone to try (or got tossed). Counted as a cost. Given away this month: ${usd(given)}")
                Picker("What…", lRecipe, d.recipes.map { it.id to "${it.name} (${usd(it.cost.perItem)} each)" }) { lRecipe = it }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Field("How many", lCount, Modifier.weight(1f), decimal = true) { lCount = it }
                    Picker("Why", lReason, listOf("giveaway" to "Given away", "tasting" to "Tasting / samples", "tossed" to "Tossed"), Modifier.weight(1f)) { lReason = it }
                }
                Field("Who got them (optional)", lNote) { lNote = it }
                Button(enabled = lRecipe.isNotBlank() && (lCount.toDoubleOrNull() ?: 0.0) > 0, onClick = {
                    scope.launch {
                        val ok = save("POST", "/api/costs/items-out", buildJsonObject {
                            put("recipeId", lRecipe); put("count", lCount); put("reason", lReason); put("note", lNote)
                        }) != null
                        if (ok) { ctx.toast("Logged"); lCount = ""; lNote = "" }
                    }
                }) { Text("Log") }
            }
        }
        val rows = (d.bakes.map { b -> HistoryRow(true, b.id, b.date, "Baked ${numText(b.batches)} batch${if (b.batches == 1.0) "" else "es"} of ${b.recipeName}", b.reason, b.note, b.cost) } +
            d.itemsOut.map { o -> HistoryRow(false, o.id, o.date, "${numText(o.count)} ${o.recipeName}", o.reason, o.note, o.cost) })
            .sortedByDescending { it.date }.take(40)
        if (rows.isNotEmpty()) item { Text("Recent", Modifier.padding(start = 16.dp, top = 16.dp), fontWeight = FontWeight.SemiBold) }
        items(rows, key = { it.id }) { r ->
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(r.text)
                        Muted("${dayLabel(r.date)} · ${REASON_LABEL[r.reason] ?: r.reason}${r.note?.takeIf(String::isNotBlank)?.let { " · $it" } ?: ""}")
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(usd(r.cost / 100.0))
                        SmallAction("Delete") {
                            ask = Ask("Delete this entry?", "") {
                                scope.launch { save("DELETE", "${if (r.bake) "/api/costs/bakes" else "/api/costs/items-out"}?id=${enc(r.id)}", null) }
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

private data class HistoryRow(val bake: Boolean, val id: String, val date: String, val text: String, val reason: String, val note: String?, val cost: Int)
