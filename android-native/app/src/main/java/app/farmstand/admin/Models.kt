package app.farmstand.admin

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Serializable
data class NameOnly(val name: String? = null)

@Serializable
data class ProductRef(val product: NameOnly? = null)

@Serializable
data class OrderItem(
    val id: String,
    val quantity: Int = 1,
    val priceAtPurchase: Int = 0,
    val selections: JsonElement? = null,
    val addOns: JsonElement? = null,
    val dropProduct: ProductRef? = null,
    val farmstandItem: NameOnly? = null,
    val name: String? = null,
) {
    val displayName: String get() = dropProduct?.product?.name ?: farmstandItem?.name ?: name ?: "Item"

    /** Box picks ("Chocolate Chip × 2"), each with how many in total for this line. */
    val picks: List<Pair<String, Int>>
        get() = (selections as? JsonArray)?.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val n = o["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            n to (o["quantity"]?.jsonPrimitive?.intOrNull ?: 1)
        } ?: emptyList()

    val addOnNames: List<String>
        get() = (addOns as? JsonArray)?.mapNotNull { (it as? JsonObject)?.get("name")?.jsonPrimitive?.contentOrNull } ?: emptyList()
}

@Serializable
data class PickupSlot(
    val id: String? = null,
    val label: String? = null,
    val location: String? = null,
    val address: String? = null,
    val pickupDate: String,
    val endDate: String? = null,
    val intervalMinutes: Int = 30,
    val maxPerTime: Int? = null,
    val blockedTimes: List<String> = emptyList(),
)

@Serializable
data class OrderUser(val name: String? = null, val email: String? = null, val phone: String? = null)

@Serializable
data class OrderDrop(val title: String? = null, val orderCloseAt: String? = null)

@Serializable
data class Order(
    val id: String,
    val type: String = "DROP",
    val status: String,
    val paymentMethod: String = "",
    val total: Int = 0,
    val discount: Int = 0,
    val discountCode: String? = null,
    val giftCode: String? = null,
    val giftAmount: Int = 0,
    val notes: String? = null,
    val guestName: String? = null,
    val guestEmail: String? = null,
    val guestPhone: String? = null,
    val manualPaymentRef: String? = null,
    val createdAt: String,
    val reviewRequestedAt: String? = null,
    val pickupSlot: PickupSlot? = null,
    val pickupTime: String? = null,
    val user: OrderUser? = null,
    val drop: OrderDrop? = null,
    val items: List<OrderItem> = emptyList(),
) {
    val number: String get() = id.takeLast(6).uppercase()
    val who: String get() = guestName ?: user?.name ?: guestEmail ?: user?.email ?: "Guest"
    val email: String? get() = guestEmail ?: user?.email
    val phone: String? get() = guestPhone ?: user?.phone
    val pickupAt: Instant? get() = (pickupTime ?: pickupSlot?.pickupDate)?.let { parseInstant(it) }
    val created: Instant get() = parseInstant(createdAt) ?: Instant.EPOCH
    val paymentLabel: String
        get() = when (paymentMethod) {
            "STRIPE" -> "Card"
            "VENMO" -> "Venmo"
            "PAYPAL" -> "PayPal"
            "CASH" -> "Cash"
            "" -> ""
            else -> paymentMethod.lowercase().replaceFirstChar { it.uppercase() }
        }
}

@Serializable
data class DropProductProduct(val name: String? = null, val price: Int = 0, val boxOptions: List<String> = emptyList())

@Serializable
data class DropProduct(
    val id: String,
    val productId: String = "",
    val quantityLimit: Int? = null,
    val quantitySold: Int = 0,
    val priceOverride: Int? = null,
    val boxOptions: List<String> = emptyList(),
    val product: DropProductProduct? = null,
)

@Serializable
data class AddOn(val name: String, val price: Int = 0)

@Serializable
data class BoxGroup(val label: String = "", val size: Int = 1, val options: List<String> = emptyList(), val allSame: Boolean = false)

@Serializable
data class Product(
    val id: String,
    val name: String,
    val description: String? = null,
    val price: Int = 0,
    val imageUrl: String? = null,
    val imagePosition: String? = null,
    val category: String? = null,
    val active: Boolean = true,
    val boxSize: Int? = null,
    val boxOptions: List<String> = emptyList(),
    val boxGroups: JsonElement? = null,
    val addOns: List<AddOn> = emptyList(),
) {
    val groups: List<BoxGroup>
        get() = runCatching { json.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(BoxGroup.serializer()), boxGroups!!) }
            .getOrDefault(emptyList())
}

@Serializable
data class CustomerOrder(val id: String, val createdAt: String, val type: String = "", val status: String = "", val paymentMethod: String = "", val total: Int = 0)

@Serializable
data class PointAdjustment(val id: String, val points: Int, val reason: String = "", val createdAt: String = "")

@Serializable
data class Imported(val orders: Int = 0, val spent: Int = 0, val firstOrderAt: String? = null, val lastOrderAt: String? = null)

@Serializable
data class Customer(
    val key: String,
    val kind: String = "guest",
    val name: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val previousEmails: List<String> = emptyList(),
    val previousPhones: List<String> = emptyList(),
    val contactId: String? = null,
    val imported: Imported? = null,
    val note: String? = null,
    val signedUpAt: String? = null,
    val orderCount: Int = 0,
    val totalSpent: Int = 0,
    val points: Int = 0,
    val pointAdjustments: List<PointAdjustment> = emptyList(),
    val lastOrderAt: String? = null,
    val orders: List<CustomerOrder> = emptyList(),
) {
    val label: String get() = name ?: email ?: phone ?: "Customer"
}

@Serializable
data class Drop(
    val id: String,
    val title: String,
    val description: String? = null,
    val alertNote: String? = null,
    val maxOrders: Int? = null,
    val reminderSentAt: String? = null,
    val status: String = "DRAFT",
    val orderOpenAt: String,
    val orderCloseAt: String,
    val dropProducts: List<DropProduct> = emptyList(),
    val pickupSlots: List<PickupSlot> = emptyList(),
) {
    val opens: Instant? get() = parseInstant(orderOpenAt)
    val closes: Instant? get() = parseInstant(orderCloseAt)
    fun isOpen(now: Instant = Instant.now()) =
        status != "DRAFT" && (opens?.let { it <= now } ?: false) && (closes?.let { it > now } ?: false)
}

@Serializable
data class SmsMessage(val id: String, val phone: String, val direction: String, val body: String, val createdAt: String, val read: Boolean = true)

@Serializable
data class Thread(val phone: String, val name: String? = null, val last: SmsMessage, val unread: Int = 0)

@Serializable
data class Conversation(val phone: String, val name: String? = null, val optedOut: Boolean = false, val messages: List<SmsMessage> = emptyList())

// ---- Shared helpers ----

val PAID_STATUSES = listOf("PAID", "READY", "PICKED_UP")

fun statusLabel(s: String) = when (s) {
    "PAID" -> "Paid"
    "AWAITING_CONFIRM" -> "Awaiting payment"
    "READY" -> "Ready"
    "PICKED_UP" -> "Picked up"
    "PENDING" -> "Card not paid (yet)"
    "CANCELLED" -> "Cancelled"
    "REFUNDED" -> "Refunded"
    else -> s
}

fun parseInstant(s: String): Instant? = runCatching { Instant.parse(s) }.getOrNull()

private val zone: ZoneId get() = ZoneId.systemDefault()

fun money(cents: Int): String = NumberFormat.getCurrencyInstance(Locale.US).format(cents / 100.0)

fun Instant.localDate(): LocalDate = atZone(zone).toLocalDate()

fun Instant.timeText(): String =
    DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(atZone(zone)).lowercase().replace(" ", "")

fun Instant.dayText(): String = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US).format(atZone(zone))

fun Instant.dayTimeText(): String = DateTimeFormatter.ofPattern("EEE, MMM d · h:mm a", Locale.US).format(atZone(zone))

fun LocalDate.dayText(): String = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US).format(this)

fun ago(i: Instant): String {
    val mins = maxOf(0L, (System.currentTimeMillis() - i.toEpochMilli()) / 60_000)
    if (mins < 60) return "$mins min ago"
    val hrs = mins / 60
    return if (hrs < 24) "${hrs}h ago" else "${hrs / 24}d ago"
}

data class BakeLine(val name: String, val count: Int, val extras: List<Pair<String, Int>>)

/** What to make for a set of orders (paid ones), with box picks and add-ons under each product. */
fun bakeList(orders: List<Order>): List<BakeLine> {
    val counts = linkedMapOf<String, Int>()
    val extras = mutableMapOf<String, MutableMap<String, Int>>()
    for (o in orders) {
        if (o.status !in PAID_STATUSES) continue
        for (item in o.items) {
            val n = item.displayName
            counts[n] = (counts[n] ?: 0) + item.quantity
            val ex = extras.getOrPut(n) { linkedMapOf() }
            for ((p, q) in item.picks) ex[p] = (ex[p] ?: 0) + q * item.quantity
            for (a in item.addOnNames) ex["+ $a"] = (ex["+ $a"] ?: 0) + item.quantity
        }
    }
    return counts.map { (n, c) -> BakeLine(n, c, extras[n].orEmpty().toList().sortedByDescending { it.second }) }
        .sortedByDescending { it.count }
}
