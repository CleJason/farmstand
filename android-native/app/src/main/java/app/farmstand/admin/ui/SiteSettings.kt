package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.farmstand.admin.Api
import app.farmstand.admin.json
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private class SiteField(val key: String, val label: String, val lines: Int = 1, val hint: String? = null)

private val GROUPS: List<Pair<String, List<SiteField>>> = listOf(
    "Business" to listOf(SiteField("SITE_NAME", "Business name"), SiteField("SITE_TAGLINE", "Tagline")),
    "Home page" to listOf(
        SiteField("SITE_HEADLINE", "Headline"),
        SiteField("SITE_INTRO", "Intro text", 3),
        SiteField("SITE_ABOUT", "About section", 3, "Optional. Shown below the intro."),
        SiteField("SITE_DROPS_HEADING", "Drops heading"),
        SiteField("SITE_DROPS_BLURB", "Drops description", 3),
        SiteField("SITE_LOW_STOCK_AT", "\"Almost gone\" label", hint = "Shows on items with this many or fewer left. 0 turns it off."),
    ),
    "Walk-up / QR page" to listOf(
        SiteField("SITE_FARMSTAND_HEADING", "Name", hint = "What you call it, e.g. Farmstand or Porch Pickup. Used everywhere."),
        SiteField("SITE_FARMSTAND_PATH", "Web address", hint = "The end of the page's link, e.g. porch-pickup. Lowercase letters, numbers and dashes. Old QR codes keep working."),
        SiteField("SITE_FARMSTAND_BLURB", "Description", 3),
    ),
    "Pickup & contact" to listOf(
        SiteField("SITE_PICKUP_AREA", "Pickup area (shown to everyone)", hint = "Just the city and state."),
        SiteField("SITE_PICKUP_INFO", "Exact pickup address & instructions (private)", 3, "Only shown to customers after they've paid."),
        SiteField("SITE_CONTACT_EMAIL", "Contact email"),
        SiteField("SITE_CONTACT_PHONE", "Contact phone"),
    ),
    "Legal pages" to listOf(
        SiteField("SITE_PRIVACY", "Privacy Policy", 8, "Leave empty to use the built-in starter. Use \"## \" for headings and \"- \" for bullet points."),
        SiteField("SITE_TERMS", "Terms", 8, "Leave empty to use the built-in starter."),
    ),
    "Social links (username or full link)" to listOf(
        SiteField("SITE_INSTAGRAM", "Instagram"), SiteField("SITE_FACEBOOK", "Facebook"), SiteField("SITE_TIKTOK", "TikTok"),
        SiteField("SITE_X", "X (Twitter)"), SiteField("SITE_YOUTUBE", "YouTube"), SiteField("SITE_PINTEREST", "Pinterest"),
        SiteField("SITE_THREADS", "Threads"), SiteField("SITE_SNAPCHAT", "Snapchat"), SiteField("SITE_BLUESKY", "Bluesky"),
        SiteField("SITE_ETSY", "Etsy shop"), SiteField("SITE_NEXTDOOR", "Nextdoor", hint = "Paste the full link"), SiteField("SITE_WEBSITE", "Other website"),
    ),
)

private fun hexColor(s: String?): Color? =
    s?.trim()?.takeIf { Regex("^#[0-9a-fA-F]{6}$").matches(it) }?.let { Color(android.graphics.Color.parseColor(it)) }

private fun isOn(v: String?) = v == "true" || v == "1"

/** Admin → Site: the words, logo and colors customers see. */
@Composable
fun SiteScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit, openWeb: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val values = remember { mutableStateMapOf<String, String>() }
    var loaded by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf<String?>(null) } // which key

    fun fill(r: String) {
        val o = json.parseToJsonElement(r).jsonObject
        values.clear()
        o.forEach { (k, v) -> values[k] = (v as? JsonPrimitive)?.contentOrNull ?: v.toString() }
        loaded = true
    }
    suspend fun save(extra: Map<String, String> = emptyMap()): Boolean {
        saving = true
        val body = JsonObject((values + extra).mapValues { JsonPrimitive(it.value) })
        val r = ctx.attempt(onAuthError) { api.put("/api/settings/site", body) }
        saving = false
        r?.let { fill(it); ctx.toast("Saved") }
        return r != null
    }
    LaunchedEffect(Unit) { ctx.attempt(onAuthError) { api.get("/api/settings/site") }?.let { fill(it) } }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val key = uploading
        if (uri == null || key == null) { uploading = null; return@rememberLauncherForActivityResult }
        scope.launch {
            val bytes = photoBytes(ctx, uri)
            val url = bytes?.let { b -> ctx.attempt(onAuthError) { api.upload(b, "image/jpeg", "site.jpg") } }
            if (url != null) save(if (key == "SITE_COVER_URL") mapOf(key to url, "SITE_COVER_POSITION" to "") else mapOf(key to url))
            uploading = null
        }
    }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize()) {
        EditorBar("Site", onBack) { TextButton(enabled = loaded && !saving, onClick = { scope.launch { save() } }) { Text(if (saving) "Saving…" else "Save") } }
        if (!loaded) { Muted("Loading…", Modifier.padding(16.dp)); return@Column }
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding()) {
            Muted("The words, logo and color customers see. Leave a field empty to use the default.", Modifier.padding(horizontal = 16.dp))
            SectionCard("Cover photo & logo") {
                listOf("SITE_COVER_URL" to "Cover photo (wide banner at the top of your home page)", "SITE_LOGO_URL" to "Logo").forEach { (key, label) ->
                    Text(label)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        values[key]?.takeIf { it.isNotBlank() }?.let { Thumb(api, it, 64) }
                        OutlinedButton(enabled = uploading == null, onClick = {
                            uploading = key
                            pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }) { Text(if (uploading == key) "Uploading…" else if (values[key].isNullOrBlank()) "Upload" else "Change") }
                        if (!values[key].isNullOrBlank()) TextButton(onClick = {
                            scope.launch { save(if (key == "SITE_COVER_URL") mapOf(key to "", "SITE_COVER_POSITION" to "") else mapOf(key to "")) }
                        }) { Text("Remove") }
                    }
                }
                Muted("Photos upload as JPG. For a transparent PNG or SVG logo, or to drag the cover crop, use the website.")
                Toggle(values, "SITE_LOGO_IN_HEADER", "Show the logo in the header")
                Toggle(values, "SITE_LOGO_ROUND", "Show the header logo as a circle")
            }
            SectionCard("Colors") {
                listOf("SITE_BRAND_COLOR" to "Brand color", "SITE_BUTTON_TEXT_COLOR" to "Button text color").forEach { (key, label) ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Box(Modifier.size(36.dp).background(hexColor(values[key]) ?: Color.Transparent, RoundedCornerShape(8.dp)))
                        Field(label, values[key] ?: "", Modifier.weight(1f), placeholder = "#B45309") { values[key] = it }
                    }
                }
                Box(
                    Modifier.background(hexColor(values["SITE_BRAND_COLOR"]) ?: Amber, RoundedCornerShape(8.dp)).padding(horizontal = 16.dp, vertical = 8.dp),
                ) { Text("Button preview", color = hexColor(values["SITE_BUTTON_TEXT_COLOR"]) ?: Color.White, fontWeight = FontWeight.SemiBold) }
                Muted("Hex colors like #B45309. Button text is white unless your brand color is very light.")
            }
            GROUPS.forEach { (title, fields) ->
                SectionCard(title) {
                    if (title.startsWith("Legal")) Text(
                        "Review these for your own business before going live. The starters are general templates, not legal advice.",
                        color = AmberDark,
                    )
                    fields.forEach { f ->
                        Field(f.label, values[f.key] ?: "", lines = f.lines) { values[f.key] = it }
                        f.hint?.let { Muted(it) }
                    }
                    if (title == "Business") {
                        Text("Use the business name in")
                        Toggle(values, "SITE_NAME_IN_HEADER", "Header (top-left)")
                        Toggle(values, "SITE_NAME_IN_TAB", "Browser tab title")
                        Toggle(values, "SITE_NAME_IN_NOTIFICATIONS", "Order emails & texts")
                    }
                }
            }
            SectionCard("Text & buttons") {
                Muted("Changing the storefront's button and label wording is on the website.")
                OutlinedButton(onClick = { openWeb("Site|/admin/site") }) { Text("Open on the website") }
            }
            Button(enabled = !saving, onClick = { scope.launch { save() } }, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text(if (saving) "Saving…" else "Save site settings")
            }
        }
    }
}

@Composable
private fun Toggle(values: MutableMap<String, String>, key: String, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(isOn(values[key]), { values[key] = if (it) "true" else "false" })
    }
}

@Composable
private fun SecretField(label: String, value: String, placeholder: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun JsonObject.str(k: String) = this[k]?.let { (it as? JsonPrimitive)?.contentOrNull } ?: ""

/** Admin → Settings: site address, email, payments, notifications and the tab icon. */
@Composable
fun SettingsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var appUrl by remember { mutableStateOf("") }
    val email = remember { mutableStateMapOf<String, String>() }
    var hasPassword by remember { mutableStateOf(false) }
    var password by remember { mutableStateOf("") }
    val pay = remember { mutableStateMapOf<String, String>() }
    val paySecrets = remember { mutableStateMapOf<String, String>() }
    var secretHints by remember { mutableStateOf<JsonObject?>(null) }
    var webhookUrl by remember { mutableStateOf("") }
    var favicon by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableStateOf(false) }

    suspend fun loadEmail() {
        ctx.attempt(onAuthError, true) { api.get("/api/settings/email") }?.let { r ->
            val o = json.parseToJsonElement(r).jsonObject
            listOf("EMAIL_SERVER_HOST", "EMAIL_SERVER_PORT", "EMAIL_SERVER_USER", "EMAIL_FROM").forEach { email[it] = o.str(it) }
            hasPassword = o["hasPassword"]?.jsonPrimitive?.contentOrNull == "true"
            password = ""
        }
    }
    suspend fun loadPay() {
        ctx.attempt(onAuthError, true) { api.get("/api/settings/payments") }?.let { r ->
            val o = json.parseToJsonElement(r).jsonObject
            listOf("STRIPE_PUBLISHABLE_KEY", "PAYPAL_ME_USERNAME", "VENMO_USERNAME", "N8N_WEBHOOK_BASE_URL").forEach { pay[it] = o.str(it) }
            secretHints = o["secrets"]?.jsonObject
            webhookUrl = o.str("stripeWebhookUrl")
            paySecrets.clear()
        }
    }
    LaunchedEffect(Unit) {
        ctx.attempt(onAuthError) { api.get("/api/settings/site-url") }?.let { appUrl = json.parseToJsonElement(it).jsonObject.str("appUrl") }
        loadEmail()
        loadPay()
        ctx.attempt(onAuthError, true) { api.get("/api/settings/branding") }?.let { favicon = json.parseToJsonElement(it).jsonObject.str("faviconUrl").ifBlank { null } }
    }
    fun saveFavicon(url: String) {
        scope.launch {
            ctx.attempt(onAuthError) { api.put("/api/settings/branding", buildJsonObject { put("faviconUrl", url) }) }?.let {
                favicon = url.ifBlank { null }
                ctx.toast(if (url.isBlank()) "Reset to the default icon" else "Saved")
            }
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            uploading = true
            val url = photoBytes(ctx, uri)?.let { b -> ctx.attempt(onAuthError) { api.upload(b, "image/jpeg", "icon.jpg") } }
            uploading = false
            url?.let { saveFavicon(it) }
        }
    }
    BackHandler(onBack = onBack)

    Column(Modifier.fillMaxSize()) {
        EditorBar("Settings", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding()) {
            SectionCard("Site address") {
                Field("Public web address", appUrl, placeholder = "https://shop.yourdomain.com") { appUrl = it }
                if (Regex("^https?://((\\d{1,3}\\.){3}\\d{1,3}|localhost)").containsMatchIn(appUrl)) Text(
                    "This is a home-network address, so links in emails won't work for customers. Use your public web address.",
                    color = Red,
                )
                Muted("Used for sign-in links, links in emails, share previews and the Stripe webhook.")
                Button(onClick = {
                    scope.launch {
                        ctx.attempt(onAuthError) { api.put("/api/settings/site-url", buildJsonObject { put("appUrl", appUrl.trim()) }) }?.let {
                            appUrl = json.parseToJsonElement(it).jsonObject.str("appUrl"); ctx.toast("Saved")
                        }
                    }
                }) { Text("Save") }
            }
            SectionCard("Email") {
                Muted("Used to email sign-in codes. Use an app password from your email provider, not your normal password.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("SMTP server", email["EMAIL_SERVER_HOST"] ?: "", Modifier.weight(2f), placeholder = "smtp.gmail.com") { email["EMAIL_SERVER_HOST"] = it }
                    Field("Port", email["EMAIL_SERVER_PORT"] ?: "", Modifier.weight(1f), number = true, placeholder = "465") { email["EMAIL_SERVER_PORT"] = it }
                }
                Field("Email address (username)", email["EMAIL_SERVER_USER"] ?: "", placeholder = "you@example.com") { email["EMAIL_SERVER_USER"] = it }
                SecretField("App password", password, if (hasPassword) "•••••••• (leave blank to keep)" else "app password") { password = it }
                Field("From name & address", email["EMAIL_FROM"] ?: "", placeholder = "Your Shop <you@example.com>") { email["EMAIL_FROM"] = it }
                Button(onClick = {
                    scope.launch {
                        val body = JsonObject(email.mapValues { JsonPrimitive(it.value) } + ("EMAIL_SERVER_PASS" to JsonPrimitive(password)))
                        ctx.attempt(onAuthError) { api.put("/api/settings/email", body) }?.let { ctx.toast("Saved"); loadEmail() }
                    }
                }) { Text("Save") }
            }
            SectionCard("Payments") {
                val hint = { k: String, ph: String -> secretHints?.str(k)?.takeIf { it.isNotBlank() }?.let { "$it (leave blank to keep)" } ?: ph }
                Text("Stripe (cards)", fontWeight = FontWeight.SemiBold)
                Muted("Keys are at dashboard.stripe.com/apikeys. Leave empty to skip card payments.")
                SecretField("Secret key", paySecrets["STRIPE_SECRET_KEY"] ?: "", hint("STRIPE_SECRET_KEY", "sk_test_...")) { paySecrets["STRIPE_SECRET_KEY"] = it }
                Field("Publishable key", pay["STRIPE_PUBLISHABLE_KEY"] ?: "", placeholder = "pk_test_...") { pay["STRIPE_PUBLISHABLE_KEY"] = it }
                SecretField("Webhook signing secret", paySecrets["STRIPE_WEBHOOK_SECRET"] ?: "", hint("STRIPE_WEBHOOK_SECRET", "whsec_...")) { paySecrets["STRIPE_WEBHOOK_SECRET"] = it }
                if (webhookUrl.isNotBlank()) Muted("Stripe webhook endpoint: $webhookUrl (events payment_intent.succeeded and payment_intent.payment_failed)")
                Text("Venmo & PayPal", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Venmo username", pay["VENMO_USERNAME"] ?: "", Modifier.weight(1f)) { pay["VENMO_USERNAME"] = it }
                    Field("PayPal.me username", pay["PAYPAL_ME_USERNAME"] ?: "", Modifier.weight(1f)) { pay["PAYPAL_ME_USERNAME"] = it }
                }
                Text("Notifications (n8n)", fontWeight = FontWeight.SemiBold)
                Muted("Order emails and texts are sent by n8n; texts go through SMS Gate inside the n8n workflow.")
                Field("Webhook base URL", pay["N8N_WEBHOOK_BASE_URL"] ?: "", placeholder = "http://n8n:5678/webhook") { pay["N8N_WEBHOOK_BASE_URL"] = it }
                SecretField("Webhook secret", paySecrets["N8N_WEBHOOK_SECRET"] ?: "", hint("N8N_WEBHOOK_SECRET", "optional")) { paySecrets["N8N_WEBHOOK_SECRET"] = it }
                Button(onClick = {
                    scope.launch {
                        val body = JsonObject((pay + paySecrets).mapValues { JsonPrimitive(it.value) })
                        ctx.attempt(onAuthError) { api.put("/api/settings/payments", body) }?.let { ctx.toast("Saved"); loadPay() }
                    }
                }) { Text("Save") }
            }
            SectionCard("Tab icon") {
                Muted("The small icon shown in browser tabs and bookmarks. A square image works best.")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Thumb(api, favicon ?: "/icon.png", 48)
                    OutlinedButton(enabled = !uploading, onClick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                        Text(if (uploading) "Uploading…" else "Change")
                    }
                    if (favicon != null) TextButton(onClick = { saveFavicon("") }) { Text("Use default") }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
