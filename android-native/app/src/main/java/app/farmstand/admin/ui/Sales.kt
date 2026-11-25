package app.farmstand.admin.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import app.farmstand.admin.Api
import kotlinx.serialization.Serializable
import java.io.File
import java.time.LocalDate
import java.util.Locale

@Serializable
data class SaleLine(val name: String, val quantity: Int = 0, val amount: Double? = null)

@Serializable
data class SaleRow(
    val date: String,
    val source: String = "",
    val orderNumber: String = "",
    val type: String = "",
    val customer: String = "",
    val items: String = "",
    val payment: String = "",
    val lines: List<SaleLine> = emptyList(),
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    val giftCardUsed: Double = 0.0,
    val tip: Double = 0.0,
    val tax: Double = 0.0,
    val fees: Double? = null,
    val refunded: Double = 0.0,
    val revenue: Double = 0.0,
    val estCost: Double? = null,
)

private fun usd(n: Double) = "$" + "%,.2f".format(Locale.US, n)

private fun range(name: String): Pair<LocalDate, LocalDate> {
    val now = LocalDate.now()
    return when (name) {
        "This week" -> now.minusDays((now.dayOfWeek.value % 7).toLong()) to now
        "Last month" -> now.minusMonths(1).withDayOfMonth(1) to now.withDayOfMonth(1).minusDays(1)
        "This year" -> now.withDayOfYear(1) to now
        "All time" -> LocalDate.of(2020, 1, 1) to now
        else -> now.withDayOfMonth(1) to now
    }
}

@Composable
fun SalesScreen(api: Api, onAuthError: () -> Unit, onBack: () -> Unit) {
    val ctx = LocalContext.current
    var preset by remember { mutableStateOf("This month") }
    var from by remember { mutableStateOf(range("This month").first) }
    var to by remember { mutableStateOf(range("This month").second) }
    var sales by remember { mutableStateOf<List<SaleRow>?>(null) }
    var payment by remember { mutableStateOf<String?>(null) }
    var kind by remember { mutableStateOf<String?>(null) }
    BackHandler(onBack = onBack)

    LaunchedEffect(from, to) {
        sales = null
        sales = ctx.attempt(onAuthError) { api.getAs<List<SaleRow>>("/api/sales?from=$from&to=$to") } ?: emptyList()
    }

    Column(Modifier.fillMaxSize()) {
        EditorBar("Sales", onBack) {
            TextButton(onClick = onClick@{
                val rows = sales ?: return@onClick
                val esc = { v: Any? -> val s = v?.toString() ?: ""; if (s.any { it == ',' || it == '"' || it == '\n' }) "\"" + s.replace("\"", "\"\"") + "\"" else s }
                val head = listOf("Date", "Source", "Order #", "Type", "Payment", "Customer", "Items", "Subtotal ($)", "Discount ($)", "Paid with Gift Card ($)", "Tip ($)", "Tax ($)", "Fees ($)", "Refunded ($)", "Revenue ($)", "Est. Cost ($)")
                val csv = (listOf(head) + rows.map { r ->
                    listOf(r.date, r.source, r.orderNumber, r.type, r.payment, r.customer, r.items, r.subtotal, r.discount, r.giftCardUsed, r.tip, r.tax, r.fees ?: "", r.refunded, r.revenue, r.estCost ?: "")
                }).joinToString("\n") { row -> row.joinToString(",") { esc(it) } }
                val f = File(ctx.cacheDir, "sales-$from-to-$to.csv").apply { writeText(csv) }
                val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/csv").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share sales CSV"))
            }) { Text("Share CSV") }
        }
        LazyColumn(Modifier.fillMaxWidth()) {
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("This week", "This month", "Last month", "This year", "All time").forEach { p ->
                        FilterChip(preset == p, { preset = p; range(p).let { from = it.first; to = it.second } }, label = { Text(p) })
                    }
                }
                Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DateField("From", from, Modifier.weight(1f)) { from = it; preset = "" }
                    DateField("To", to, Modifier.weight(1f)) { to = it; preset = "" }
                }
            }
            val all = sales
            if (all == null) {
                item { Muted("Loading…", Modifier.padding(16.dp)) }
                return@LazyColumn
            }
            item {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    all.map { it.payment }.distinct().sorted().forEach { p -> FilterChip(payment == p, { payment = if (payment == p) null else p }, label = { Text(p) }) }
                    all.map { it.type }.distinct().sorted().forEach { k -> FilterChip(kind == k, { kind = if (kind == k) null else k }, label = { Text(k) }) }
                }
            }
            val rows = all.filter { (payment == null || it.payment == payment) && (kind == null || it.type == kind) }
            val revenue = rows.sumOf { it.revenue }
            val costed = rows.filter { it.estCost != null }
            val costedRevenue = costed.sumOf { it.revenue }
            val cost = costed.sumOf { it.estCost ?: 0.0 }
            item {
                SectionCard {
                    Text(usd(revenue), fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Muted("${rows.size} orders · average ${usd(if (rows.isEmpty()) 0.0 else revenue / rows.size)}")
                    if (costed.isNotEmpty()) {
                        val profit = costedRevenue - cost
                        Text("Profit (est.) ${usd(profit)}" + if (costedRevenue > 0) " · ${(profit / costedRevenue * 100).toInt()}%" else "")
                        Muted("Cost to make ${usd(cost)}, from the ${costed.size} of ${rows.size} orders with recipes tagged")
                    }
                    Muted("Tips ${usd(rows.sumOf { it.tip })} · Discounts ${usd(rows.sumOf { it.discount })}")
                }
            }
            fun breakdown(title: String, key: (SaleRow) -> String, byKey: Boolean = false) {
                val groups = rows.groupBy(key).map { (k, v) -> Triple(k, v.size, v.sumOf { it.revenue }) }
                    .let { g -> if (byKey) g.sortedByDescending { it.first } else g.sortedByDescending { it.third } }
                item {
                    SectionCard(title) {
                        groups.forEach { (k, n, r) ->
                            Row {
                                Text(k, Modifier.weight(1f))
                                Muted("$n  ")
                                Text(usd(r), fontWeight = FontWeight.Medium)
                                Muted("  ${if (revenue > 0) (r / revenue * 100).toInt() else 0}%")
                            }
                        }
                    }
                }
            }
            if (rows.isNotEmpty()) {
                breakdown("By payment", { it.payment })
                breakdown("By kind", { it.type })
                breakdown("By month", { it.date.take(7) }, byKey = true)
                val products = rows.flatMap { it.lines }.groupBy { it.name }
                    .map { (n, l) -> Triple(n, l.sumOf { it.quantity }, l.sumOf { it.amount ?: 0.0 }) }.sortedByDescending { it.second }
                item {
                    SectionCard("By product") {
                        products.forEach { (n, q, a) ->
                            Row {
                                Text(n, Modifier.weight(1f))
                                Muted("$q  ")
                                Text(if (a > 0) usd(a) else "")
                            }
                        }
                    }
                }
                item {
                    SectionCard("Orders") {
                        rows.reversed().take(300).forEach { r ->
                            Row {
                                Column(Modifier.weight(1f)) {
                                    Text("${r.date} · ${r.customer}")
                                    Muted("${r.payment} · ${r.items}")
                                }
                                Text(usd(r.revenue))
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
