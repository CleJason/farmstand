package app.farmstand.admin.ui

import kotlinx.serialization.Serializable
import java.util.Locale

// Admin → Costs data (GET /api/costs; every change replies with the fresh copy)

@Serializable
data class CostSettings(val overheadRate: Double = 15.0, val basis: String = "average")

@Serializable
data class CostIngredientRow(
    val id: String,
    val name: String,
    val baseUnit: String = "g",
    val gramsPerCup: Double? = null,
    val manualCost: Double? = null,
    val purchases: Int = 0,
    val usedIn: Int = 0,
    val bought: Double = 0.0,
    val spent: Double = 0.0,
    val average: Double? = null,
    val latest: Double? = null,
    val cost: Double? = null,
    val onHand: Double? = null,
    val countedAt: String? = null,
)

@Serializable
data class CostPurchase(val id: String, val ingredientId: String, val date: String, val store: String? = null, val quantity: Double = 0.0, val price: Int = 0)

@Serializable
data class CostLine(val id: String? = null, val ingredientId: String, val quantity: Double = 0.0, val unit: String = "g", val note: String? = null)

@Serializable
data class CostLineResult(val cost: Double = 0.0, val amount: Double? = null, val problem: String? = null, val estimated: Boolean? = null)

@Serializable
data class RecipeCost(
    val lines: List<CostLineResult> = emptyList(),
    val ingredientsCost: Double = 0.0,
    val overhead: Double = 0.0,
    val batch: Double = 0.0,
    val perItem: Double = 0.0,
    val problems: Int = 0,
    val estimates: Int = 0,
)

@Serializable
data class CostRecipeRow(
    val id: String,
    val name: String,
    val yieldCount: Double = 1.0,
    val yieldLabel: String = "",
    val overheadHours: Double = 0.0,
    val notes: String? = null,
    val lines: List<CostLine> = emptyList(),
    val cost: RecipeCost = RecipeCost(),
)

@Serializable
data class CostReceipt(
    val id: String,
    val date: String,
    val vendor: String = "",
    val amount: Int = 0,
    val description: String? = null,
    val category: String? = null,
    val imageUrl: String? = null,
    val itemized: Int = 0,
)

@Serializable
data class CostBake(val id: String, val recipeId: String, val recipeName: String = "", val date: String, val batches: Double = 0.0, val reason: String = "", val note: String? = null, val cost: Int = 0)

@Serializable
data class CostItemOut(val id: String, val recipeId: String, val recipeName: String = "", val date: String, val count: Double = 0.0, val reason: String = "", val note: String? = null, val cost: Int = 0)

@Serializable
data class CostLink(val recipeId: String? = null, val ingredientId: String? = null, val itemsPerUnit: Double = 1.0) {
    val ref get() = if (ingredientId != null) "i:$ingredientId" else "r:$recipeId"
}

@Serializable
data class CostProduct(val name: String, val key: String, val price: Int? = null, val isBox: Boolean = false, val active: Boolean = true, val links: List<CostLink> = emptyList())

@Serializable
data class CostDrop(val id: String, val title: String, val orderOpenAt: String = "", val orderCloseAt: String = "")

@Serializable
data class CostsData(
    val settings: CostSettings = CostSettings(),
    val ingredients: List<CostIngredientRow> = emptyList(),
    val purchases: List<CostPurchase> = emptyList(),
    val recipes: List<CostRecipeRow> = emptyList(),
    val receipts: List<CostReceipt> = emptyList(),
    val bakes: List<CostBake> = emptyList(),
    val itemsOut: List<CostItemOut> = emptyList(),
    val tags: Map<String, List<CostLink>> = emptyMap(),
    val products: List<CostProduct> = emptyList(),
    val drops: List<CostDrop> = emptyList(),
)

@Serializable
data class PlanRecipe(val recipeId: String, val name: String, val items: Double = 0.0, val yieldCount: Double = 1.0, val yieldLabel: String = "", val batches: Double = 0.0, val logged: Double = 0.0)

@Serializable
data class PlanName(val name: String, val quantity: Double = 0.0)

@Serializable
data class PlanIngredient(val id: String, val name: String, val baseUnit: String = "g", val need: Double = 0.0, val onHand: Double? = null)

@Serializable
data class BakePlan(val recipes: List<PlanRecipe> = emptyList(), val unlinked: List<PlanName> = emptyList(), val ingredients: List<PlanIngredient> = emptyList())

// The same unit math as the site (src/lib/costs.ts), so the recipe editor shows costs as you type

private val WEIGHT = mapOf("g" to 1.0, "kg" to 1000.0, "oz" to 28.35, "lb" to 453.59, "stick" to 113.4)
private val VOLUME = mapOf(
    "ml" to 1.0, "l" to 1000.0, "pinch" to 0.31, "dash" to 0.62, "tsp" to 4.93, "tbsp" to 14.79,
    "fl oz" to 29.57, "cup" to 236.59, "pt" to 473.18, "qt" to 946.35, "gal" to 3785.41,
)
private val COUNT = mapOf("pc" to 1.0, "dozen" to 12.0)
private const val ML_PER_CUP = 236.59

val WEIGHT_UNITS = WEIGHT.keys.toList()
val VOLUME_UNITS = VOLUME.keys.toList()
val COUNT_UNITS = COUNT.keys.toList()
val ALL_UNITS = WEIGHT_UNITS + VOLUME_UNITS + COUNT_UNITS

fun unitsFor(baseUnit: String?) = if (baseUnit == "pc") COUNT_UNITS + VOLUME_UNITS + WEIGHT_UNITS else VOLUME_UNITS + WEIGHT_UNITS + COUNT_UNITS

/** An amount in the ingredient's base unit; null amount = can't convert. */
fun toBase(quantity: Double, unit: String, baseUnit: String, gramsPerCup: Double?): CostLineResult {
    val gpc = gramsPerCup?.takeIf { it > 0 }
    val gPerMl = gpc?.let { it / ML_PER_CUP } ?: 1.0
    if (baseUnit == "pc") return COUNT[unit]?.let { CostLineResult(amount = quantity * it) } ?: CostLineResult(problem = "$unit of something counted in pieces")
    if (unit in COUNT) return CostLineResult(problem = "pieces of something weighed or measured")
    if (baseUnit == "ml") {
        VOLUME[unit]?.let { return CostLineResult(amount = quantity * it) }
        WEIGHT[unit]?.let { return CostLineResult(amount = quantity * it / gPerMl, estimated = gpc == null) }
    } else {
        WEIGHT[unit]?.let { return CostLineResult(amount = quantity * it) }
        VOLUME[unit]?.let { return CostLineResult(amount = quantity * it * gPerMl, estimated = gpc == null) }
    }
    return CostLineResult(problem = "unknown unit \"$unit\"")
}

fun lineCost(quantity: Double, unit: String, ing: CostIngredientRow?): CostLineResult {
    if (ing == null) return CostLineResult(problem = "missing ingredient")
    val b = toBase(quantity, unit, ing.baseUnit, ing.gramsPerCup)
    val amt = b.amount ?: return b
    val c = ing.cost ?: return CostLineResult(amount = amt, problem = "no price yet")
    return CostLineResult(cost = amt * c, amount = amt, estimated = b.estimated)
}

fun usd(n: Double?, digits: Int = 2): String = if (n == null || !n.isFinite()) "—" else "\$" + "%.${digits}f".format(Locale.US, n)

/** A base-unit cost as people think of it: per lb, per fl oz, or each. */
fun unitPrice(cost: Double?, baseUnit: String): String = when {
    cost == null -> "no price"
    baseUnit == "g" -> "${usd(cost * 453.59)}/lb"
    baseUnit == "ml" -> "${usd(cost * 29.57)}/fl oz"
    else -> "${usd(cost, if (cost < 1) 3 else 2)} each"
}

fun amountText(n: Double, baseUnit: String): String = when (baseUnit) {
    "g" -> if (n >= 1000) "%.2f kg (%.1f lb)".format(Locale.US, n / 1000, n / 453.59) else "${Math.round(n)} g"
    "ml" -> if (n >= 1000) "%.2f L".format(Locale.US, n / 1000) else "${Math.round(n)} ml"
    else -> "${Math.round(n * 100) / 100.0} pc"
}

fun numText(d: Double): String = if (d % 1.0 == 0.0) d.toLong().toString() else d.toString()

/** What one of a tag ("r:<recipe>" or "i:<ingredient>") costs, and the unit its amount is in. */
data class RefCost(val each: Double, val unit: String, val name: String)

fun CostsData.refCost(ref: String): RefCost? {
    if (ref.length < 3) return null
    val id = ref.substring(2)
    return if (ref.startsWith("i:")) ingredients.firstOrNull { it.id == id }?.let { RefCost(it.cost ?: 0.0, it.baseUnit, it.name) }
    else recipes.firstOrNull { it.id == id }?.let { RefCost(it.cost.perItem, it.yieldLabel, it.name) }
}

fun CostsData.linksCost(links: List<CostLink>) = links.sumOf { (refCost(it.ref)?.each ?: 0.0) * it.itemsPerUnit }

fun tagKey(name: String) = name.trim().lowercase().replace(Regex("\\s+"), " ")
