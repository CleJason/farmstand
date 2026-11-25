package app.farmstand.admin.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.farmstand.admin.AddOn
import app.farmstand.admin.Api
import app.farmstand.admin.BoxGroup
import app.farmstand.admin.Product
import app.farmstand.admin.money
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.io.ByteArrayOutputStream

/** A phone photo, shrunk to a sensible size and saved as JPEG for upload. */
suspend fun photoBytes(ctx: Context, uri: Uri): ByteArray? = withContext(Dispatchers.IO) {
    runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 3200) sample *= 2
        val bmp = ctx.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@runCatching null
        val scale = minOf(1f, 1600f / maxOf(bmp.width, bmp.height))
        val out = if (scale < 1f) Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true) else bmp
        ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
    }.getOrNull()
}

@Composable
fun ProductsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var products by remember { mutableStateOf<List<Product>?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var showHidden by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Product?>(null) }
    var creating by remember { mutableStateOf(false) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<List<Product>>("/api/products") }?.let { products = it }
    }
    LaunchedEffect(Unit) { load() }

    if (editing != null || creating) {
        ProductEditor(api, onAuthError, editing, products.orEmpty()) { saved ->
            editing = null
            creating = false
            if (saved) scope.launch { load() }
        }
        return
    }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize()) {
        EditorBar("Products", onBack)
        Box(Modifier.weight(1f)) {
            Refreshable(refreshing, { scope.launch { refreshing = true; load(); refreshing = false } }) {
                LazyColumn(Modifier.fillMaxWidth()) {
                    val all = products
                    if (all == null) {
                        item { Muted("Loading…", Modifier.padding(16.dp)) }
                        return@LazyColumn
                    }
                    val cats = all.mapNotNull { it.category?.trim()?.ifBlank { null } }.distinct().sorted()
                    item {
                        OutlinedTextField(
                            search, { search = it }, placeholder = { Text("Search products") }, singleLine = true,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            FilterChip(category == null, { category = null }, label = { Text("All") })
                            cats.forEach { c -> FilterChip(category == c, { category = if (category == c) null else c }, label = { Text(c) }) }
                            FilterChip(showHidden, { showHidden = !showHidden }, label = { Text("Show hidden") })
                        }
                    }
                    val q = search.trim().lowercase()
                    val shown = all.filter { (showHidden || it.active) && (category == null || it.category?.trim() == category) && (q.isEmpty() || it.name.lowercase().contains(q)) }
                    val groups = shown.groupBy { it.category?.trim()?.ifBlank { null } ?: "No category" }
                        .toSortedMap(compareBy<String> { it == "No category" }.thenBy { it })
                    if (shown.isEmpty()) item { Muted("No products here.", Modifier.padding(16.dp)) }
                    groups.forEach { (cat, list) ->
                        item { Muted(cat, Modifier.padding(start = 16.dp, top = 12.dp)) }
                        items(list.sortedBy { it.name }, key = { it.id }) { p ->
                            Row(
                                Modifier.fillMaxWidth().clickable { editing = p }.padding(horizontal = 16.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Thumb(api, p.imageUrl, 52)
                                Column(Modifier.weight(1f)) {
                                    Text(p.name, fontWeight = FontWeight.Medium)
                                    Muted(
                                        listOfNotNull(
                                            money(p.price),
                                            p.boxSize?.let { "box of $it" },
                                            if (p.addOns.isNotEmpty()) "${p.addOns.size} add-on${if (p.addOns.size == 1) "" else "s"}" else null,
                                            if (!p.active) "hidden" else null,
                                        ).joinToString(" · "),
                                    )
                                }
                            }
                        }
                    }
                    item { Spacer(Modifier.height(88.dp)) }
                }
            }
            ExtendedFloatingActionButton(
                onClick = { creating = true },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text("New product") },
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            )
        }
    }
}

@Composable
fun Thumb(api: Api, url: String?, size: Int) {
    val m = Modifier.size(size.dp).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
    if (url.isNullOrBlank()) Box(m) else AsyncImage(model = api.absolute(url), contentDescription = null, contentScale = ContentScale.Crop, modifier = m)
}

private data class GroupForm(val label: String = "", val size: String = "", val options: String = "", val allSame: Boolean = false)
private data class AddOnForm(val name: String = "", val price: String = "")

@Composable
private fun ProductEditor(api: Api, onAuthError: () -> Unit, product: Product?, all: List<Product>, onDone: (Boolean) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(product?.name ?: "") }
    var description by remember { mutableStateOf(product?.description ?: "") }
    var price by remember { mutableStateOf(dollarsText(product?.price)) }
    var category by remember { mutableStateOf(product?.category ?: "") }
    var active by remember { mutableStateOf(product?.active ?: true) }
    var imageUrl by remember { mutableStateOf(product?.imageUrl) }
    var uploading by remember { mutableStateOf(false) }
    val groups0 = product?.groups.orEmpty()
    var isBox by remember { mutableStateOf(product?.boxSize != null) }
    var inSections by remember { mutableStateOf(groups0.isNotEmpty()) }
    var boxSize by remember { mutableStateOf(product?.boxSize?.toString() ?: "") }
    var options by remember { mutableStateOf(product?.boxOptions?.joinToString("\n") ?: "") }
    val sections = remember { groups0.map { GroupForm(it.label, it.size.toString(), it.options.joinToString("\n"), it.allSame) }.toMutableStateList() }
    val addOns = remember { product?.addOns.orEmpty().map { AddOnForm(it.name, dollarsText(it.price)) }.toMutableStateList() }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var merging by remember { mutableStateOf(false) }
    val cats = all.mapNotNull { it.category?.trim()?.ifBlank { null } }.distinct().sorted()

    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            uploading = true
            scope.launch {
                val bytes = photoBytes(ctx, uri)
                if (bytes == null) ctx.toast("Couldn't read that photo")
                else ctx.attempt(onAuthError) { api.upload(bytes, "image/jpeg", "photo.jpg") }?.let { imageUrl = it }
                uploading = false
            }
        }
    }

    BackHandler { onDone(false) }

    fun save() {
        error = null
        val cents = centsOf(price)
        val opts = options.lines().map { it.trim() }.filter { it.isNotEmpty() }
        when {
            name.isBlank() -> error = "Give it a name."
            cents == null -> error = "Enter a price, like 12.00"
            isBox && !inSections && ((boxSize.toIntOrNull() ?: 0) < 1 || opts.isEmpty()) -> error = "A box needs a size and at least one choice."
            isBox && inSections && sections.none { (it.size.toIntOrNull() ?: 0) > 0 && it.options.isNotBlank() } -> error = "Add at least one section with a size and choices."
        }
        if (error != null) return
        val body = buildJsonObject {
            put("name", name.trim())
            put("description", description.ifBlank { null })
            put("price", cents)
            put("category", category.trim().ifBlank { null })
            put("imageUrl", imageUrl)
            put("imagePosition", if (imageUrl != null) product?.imagePosition else null)
            put("active", active)
            if (isBox && !inSections) put("boxSize", boxSize.toInt()) else if (!isBox) put("boxSize", JsonNull)
            putJsonArray("boxOptions") { if (isBox && !inSections) opts.forEach { add(it) } }
            putJsonArray("boxGroups") {
                if (isBox && inSections) sections.forEach { g ->
                    addJsonObject {
                        put("label", g.label.trim())
                        put("size", g.size.toIntOrNull() ?: 0)
                        putJsonArray("options") { g.options.lines().map { it.trim() }.filter { it.isNotEmpty() }.forEach { add(it) } }
                        put("allSame", g.allSame)
                    }
                }
            }
            putJsonArray("addOns") {
                addOns.filter { it.name.isNotBlank() }.forEach { a ->
                    addJsonObject { put("name", a.name.trim()); put("price", centsOf(a.price) ?: 0) }
                }
            }
        }
        saving = true
        scope.launch {
            val ok = ctx.attempt(onAuthError) {
                if (product != null) api.put("/api/products/${product.id}", body) else api.post("/api/products", body)
            }
            saving = false
            if (ok != null) onDone(true)
        }
    }

    if (merging && product != null) {
        MergeProductDialog(api, onAuthError, product, all.filter { it.id != product.id }, onClose = { merging = false }) { onDone(true) }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        EditorBar(if (product == null) "New product" else "Edit product", { onDone(false) })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Thumb(api, imageUrl, 96)
                Column {
                    OutlinedButton(onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, enabled = !uploading) {
                        Text(if (uploading) "Uploading…" else if (imageUrl == null) "Add photo" else "Change photo")
                    }
                    if (imageUrl != null) TextButton(onClick = { imageUrl = null }) { Text("Remove photo") }
                }
            }
            Field("Name", name) { name = it }
            Field("Price $", price, decimal = true) { price = it }
            Field("Description", description, lines = 3) { description = it }
            Field("Category", category, placeholder = "e.g. Breads") { category = it }
            if (cats.isNotEmpty()) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    cats.forEach { c -> FilterChip(category.trim() == c, { category = c }, label = { Text(c) }) }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Available")
                    Muted("Off hides it from new drops and the shop")
                }
                Switch(active, { active = it })
            }

            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Mix & match box")
                    Muted("Customers pick what goes in it")
                }
                Switch(isBox, { isBox = it })
            }
            if (isBox) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(!inSections, { inSections = false }, label = { Text("One mix") })
                    FilterChip(inSections, { inSections = true; if (sections.isEmpty()) sections.add(GroupForm()) }, label = { Text("In sections") })
                }
                if (!inSections) {
                    Field("Items per box", boxSize, number = true) { boxSize = it.filter(Char::isDigit) }
                    Field("Choices (one per line)", options, lines = 4) { options = it }
                } else {
                    sections.forEachIndexed { i, g ->
                        SectionCard(modifier = Modifier.padding(0.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Section ${i + 1}", Modifier.weight(1f), fontWeight = FontWeight.Medium)
                                TextButton(onClick = { sections.removeAt(i) }) { Text("Remove", color = Red) }
                            }
                            Field("Label", g.label, placeholder = "e.g. Rolls") { sections[i] = g.copy(label = it) }
                            Field("How many", g.size, number = true) { sections[i] = g.copy(size = it.filter(Char::isDigit)) }
                            Field("Choices (one per line)", g.options, lines = 3) { sections[i] = g.copy(options = it) }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("All one flavor", Modifier.weight(1f))
                                Switch(g.allSame, { sections[i] = g.copy(allSame = it) })
                            }
                        }
                    }
                    OutlinedButton(onClick = { sections.add(GroupForm()) }) { Text("+ Add section") }
                }
            }

            HorizontalDivider()
            Text("Add-ons", fontWeight = FontWeight.SemiBold)
            Muted("Extras customers can tick, like Extra icing (+$1)")
            addOns.forEachIndexed { i, a ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Name", a.name, Modifier.weight(2f)) { addOns[i] = a.copy(name = it) }
                    Field("$", a.price, Modifier.weight(1f), decimal = true) { addOns[i] = a.copy(price = it) }
                    TextButton(onClick = { addOns.removeAt(i) }) { Text("✕") }
                }
            }
            OutlinedButton(onClick = { addOns.add(AddOnForm()) }) { Text("+ Add-on") }

            if (product != null) {
                HorizontalDivider()
                TextButton(onClick = { merging = true }) { Text("Duplicate? Merge into another product") }
                Muted("Recipe costs for this product are edited in Costs.")
            }
            Spacer(Modifier.height(8.dp))
        }
        HorizontalDivider()
        Column(Modifier.padding(12.dp)) {
            error?.let { Text(it, color = Red) }
            Button(onClick = ::save, enabled = !saving && !uploading, modifier = Modifier.fillMaxWidth()) {
                Text(if (saving) "Saving…" else if (product == null) "Create product" else "Save")
            }
        }
    }
}

@Composable
private fun MergeProductDialog(api: Api, onAuthError: () -> Unit, from: Product, others: List<Product>, onClose: () -> Unit, onMerged: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var into by remember { mutableStateOf<Product?>(null) }
    var label by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("Merge \"${from.name}\" into…") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Muted("Its drops and orders move to the product you pick, then this copy is deleted.")
                others.sortedBy { it.name }.forEach { p ->
                    Row(Modifier.fillMaxWidth().clickable { into = p }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text((if (into?.id == p.id) "● " else "○ ") + p.name)
                    }
                }
                val target = into
                if (target != null && target.boxOptions.isNotEmpty() && from.boxOptions.isEmpty()) {
                    Muted("Its orders had no choice picked. Which of ${target.name}'s choices were they? (blank = none)")
                    Field("Choice", label) { label = it }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = into != null && !busy, onClick = {
                busy = true
                scope.launch {
                    ctx.attempt(onAuthError) {
                        api.post("/api/products/merge", buildJsonObject { put("from", from.id); put("into", into!!.id); put("label", label.trim()) })
                    }?.let { ctx.toast("Merged"); onClose(); onMerged() }
                    busy = false
                }
            }) { Text("Merge") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel") } },
    )
}
