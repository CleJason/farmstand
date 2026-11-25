package app.farmstand.admin.ui

import androidx.activity.compose.BackHandler
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
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class RewardSettings(
    val enabled: Boolean = false,
    val pointsPerDollar: Double = 1.0,
    val threshold: Int = 100,
    val rewardType: String = "AMOUNT",
    val rewardValue: Int = 0,
    val expiresDays: Int = 0,
)

@Serializable
data class RewardDue(val name: String? = null, val email: String? = null, val phone: String? = null, val points: Int = 0, val rewards: Int = 0)

@Serializable
data class RewardsInfo(val settings: RewardSettings, val due: List<RewardDue> = emptyList(), val customers: Int = 0)

private fun num(d: Double) = if (d % 1.0 == 0.0) d.toLong().toString() else d.toString()

@Composable
fun RewardsScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var info by remember { mutableStateOf<RewardsInfo?>(null) }
    var perDollar by remember { mutableStateOf("") }
    var threshold by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("AMOUNT") }
    var value by remember { mutableStateOf("") }
    var expires by remember { mutableStateOf("") }
    var ask by remember { mutableStateOf<Ask?>(null) }
    var busy by remember { mutableStateOf(false) }

    suspend fun load() {
        ctx.attempt(onAuthError) { api.getAs<RewardsInfo>("/api/settings/rewards") }?.let { d ->
            info = d
            val s = d.settings
            perDollar = num(s.pointsPerDollar); threshold = s.threshold.toString(); type = s.rewardType
            value = if (s.rewardType == "PERCENT") s.rewardValue.toString() else dollarsText(s.rewardValue)
            expires = s.expiresDays.toString()
        }
    }
    suspend fun save(body: JsonObject): Boolean {
        busy = true
        val ok = ctx.attempt(onAuthError) { api.put("/api/settings/rewards", body) } != null
        busy = false
        if (ok) load()
        return ok
    }
    LaunchedEffect(Unit) { load() }
    BackHandler(onBack = onBack)
    ask?.let { a -> ConfirmDialog(a.title, a.text, "Yes", { ask = null }) { ask = null; a.action() } }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Rewards", onBack)
        val d = info
        if (d == null) { Muted("Loading…", Modifier.padding(16.dp)); return@Column }
        val s = d.settings
        Column(Modifier.verticalScroll(rememberScrollState()).imePadding()) {
            Muted("Customers earn points for what they pay. When they reach the goal, they get a discount code by email or text.", Modifier.padding(horizontal = 16.dp))
            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            if (s.enabled) "Rewards are on" else "Rewards are off",
                            fontWeight = FontWeight.SemiBold,
                            color = if (s.enabled) Green else MaterialTheme.colorScheme.onSurface,
                        )
                        Muted(
                            if (s.enabled) "Codes go out automatically when someone reaches the goal (checked every 10 minutes)."
                            else "Points still add up in Customers. Nothing is sent until you turn it on."
                        )
                    }
                    Button(enabled = !busy, onClick = {
                        if (!s.enabled) {
                            val now = d.due.sumOf { it.rewards }
                            val warn = if (now > 0) "${d.due.size} customer(s) already have enough points, so $now reward code(s) will go out within about 10 minutes." else ""
                            ask = Ask("Turn rewards on?", warn) { scope.launch { if (save(buildJsonObject { put("enabled", true) })) ctx.toast("Rewards are on") } }
                        } else {
                            ask = Ask("Turn rewards off?", "Points keep counting; no new codes go out.") {
                                scope.launch { if (save(buildJsonObject { put("enabled", false) })) ctx.toast("Rewards are off") }
                            }
                        }
                    }) { Text(if (s.enabled) "Turn off" else "Turn on") }
                }
            }
            SectionCard("Settings") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Points per \$1 paid", perDollar, Modifier.weight(1f), decimal = true) { perDollar = it }
                    Field("Points for a reward", threshold, Modifier.weight(1f), number = true) { threshold = it.filter(Char::isDigit) }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FilterChip(type == "AMOUNT", { type = "AMOUNT" }, label = { Text("\$ off") })
                    Spacer(Modifier.width(8.dp))
                    FilterChip(type == "PERCENT", { type = "PERCENT" }, label = { Text("% off") })
                    Spacer(Modifier.width(8.dp))
                    Field(if (type == "PERCENT") "Percent" else "Dollars", value, Modifier.weight(1f), decimal = true) { value = it }
                }
                Field("Code expires after (days, 0 = never)", expires, number = true) { expires = it.filter(Char::isDigit) }
                val v = value.toDoubleOrNull() ?: 0.0
                val reward = if (type == "PERCENT") "${v.toInt()}% off" else "\$${dollarsText(Math.round(v * 100).toInt())} off"
                val spend = (threshold.toDoubleOrNull() ?: 0.0) / (perDollar.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0)
                val exp = expires.toIntOrNull()?.takeIf { it > 0 }?.let { ", good for $it days" } ?: ""
                val spent = "%.2f".format(java.util.Locale.US, spend)
                Muted("Every ${threshold.ifBlank { "?" }} points (about \$$spent spent) = $reward their next order$exp. Each code works once.")
                Button(enabled = !busy, onClick = {
                    val rv = if (type == "PERCENT") Math.round(v).toInt() else Math.round(v * 100).toInt()
                    scope.launch {
                        val ok = save(buildJsonObject {
                            put("pointsPerDollar", perDollar); put("threshold", threshold); put("rewardType", type)
                            put("rewardValue", rv); put("expiresDays", expires)
                        })
                        if (ok) ctx.toast("Saved")
                    }
                }) { Text("Save") }
            }
            SectionCard("With these settings") {
                Muted("${d.customers} customer(s) have points. Points count paid orders here plus imported Hotplate history and points you added by hand.")
                if (d.due.isEmpty()) Muted("Nobody is at the goal yet.")
                else {
                    Text("${d.due.size} customer(s) are already at the goal and would get a code as soon as rewards are on:", color = AmberDark)
                    d.due.forEach { p ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(p.name ?: p.email ?: p.phone ?: "", Modifier.weight(1f))
                            Muted("${p.points} pts → ${p.rewards} code(s)")
                        }
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
