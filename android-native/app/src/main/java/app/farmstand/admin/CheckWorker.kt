package app.farmstand.admin

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Every ~15 minutes (Android's shortest background interval): a notification
 * for new orders and new texts since the last check.
 */
class CheckWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val api = Api(applicationContext)
        if (api.site.isBlank()) return Result.success()
        val prefs = applicationContext.getSharedPreferences("farmstand", Context.MODE_PRIVATE)
        return try {
            val orders = api.getAs<List<Order>>("/api/orders")
            val seen = prefs.getString("lastOrderAt", null)
            val fresh = orders.filter { it.status in listOf("AWAITING_CONFIRM", "PAID") && (seen == null || it.createdAt > seen) }
            orders.maxOfOrNull { it.createdAt }?.let { prefs.edit().putString("lastOrderAt", it).apply() }
            // First run only records where we are, so old orders don't all pop up
            if (seen != null && fresh.isNotEmpty()) {
                val title = if (fresh.size == 1) "New order: ${fresh[0].who} · ${money(fresh[0].total)}" else "${fresh.size} new orders"
                val text = fresh.joinToString("\n") { o ->
                    "${o.who}: " + o.items.joinToString(", ") { "${it.quantity}× ${it.displayName}" } +
                        if (o.status == "AWAITING_CONFIRM") " (${o.paymentLabel}, confirm payment)" else ""
                }
                notify(1, title, text, "Orders")
            }

            val threads = api.getAs<List<Thread>>("/api/messages")
            val lastText = prefs.getString("lastTextAt", null)
            val newTexts = threads.filter { it.unread > 0 && it.last.direction == "IN" && (lastText == null || it.last.createdAt > lastText) }
            threads.maxOfOrNull { it.last.createdAt }?.let { prefs.edit().putString("lastTextAt", it).apply() }
            if (lastText != null && newTexts.isNotEmpty()) {
                val title = if (newTexts.size == 1) "Text from ${newTexts[0].name ?: newTexts[0].phone}" else "${newTexts.size} new texts"
                notify(2, title, newTexts.joinToString("\n") { "${it.name ?: it.phone}: ${it.last.body}" }, "Messages")
            }
            Result.success()
        } catch (e: ApiException) {
            if (e.code == 401) Result.success() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun notify(id: Int, title: String, text: String, tab: String) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Orders and texts", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(
            ctx, id,
            Intent(ctx, MainActivity::class.java).putExtra("tab", tab).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_fg)
            .setContentTitle(title)
            .setContentText(text.lineSequence().firstOrNull() ?: "")
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (_: SecurityException) {
        }
    }

    companion object {
        private const val CHANNEL = "shop"
        private const val NAME = "check"

        fun schedule(context: Context) {
            val req = PeriodicWorkRequestBuilder<CheckWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
