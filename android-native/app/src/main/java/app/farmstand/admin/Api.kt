package app.farmstand.admin

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiException(message: String, val code: Int = 0) : Exception(message)

val json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    coerceInputValues = true
    explicitNulls = false
}

/** Cookies kept on the phone, so the sign-in lasts like it does in a browser. */
private class SavedCookies(private val prefs: SharedPreferences) : CookieJar {
    private val cookies = mutableListOf<Cookie>()

    init {
        prefs.getStringSet("cookies", emptySet())?.forEach { line ->
            val parts = line.split("\n", limit = 2)
            if (parts.size == 2) parts[0].toHttpUrlOrNull()?.let { url -> Cookie.parse(url, parts[1])?.let { cookies += it } }
        }
        prune()
    }

    private fun prune() {
        val now = System.currentTimeMillis()
        cookies.removeAll { it.expiresAt < now }
    }

    private fun save() {
        prefs.edit().putStringSet(
            "cookies",
            cookies.filter { it.persistent }.map { c ->
                "${if (c.secure) "https" else "http"}://${c.domain}${c.path}\n$c"
            }.toSet(),
        ).apply()
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (c in cookies) {
            this.cookies.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
            this.cookies += c
        }
        prune()
        save()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        prune()
        return cookies.filter { it.matches(url) }
    }

    @Synchronized
    fun all(): List<Cookie> {
        prune()
        return cookies.toList()
    }

    @Synchronized
    fun clear() {
        cookies.clear()
        save()
    }
}

/** Talks to the shop's own admin API (the same one the website's admin pages use). */
class Api(context: Context) {
    val appContext: Context = context.applicationContext
    private val prefs = context.getSharedPreferences("farmstand", Context.MODE_PRIVATE)
    private val jar = SavedCookies(prefs)
    private val client = OkHttpClient.Builder()
        .cookieJar(jar)
        .followRedirects(false)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(40, TimeUnit.SECONDS)
        .build()

    var site: String
        get() = prefs.getString("site", null) ?: BuildConfig.DEFAULT_SITE
        set(value) = prefs.edit().putString("site", value).apply()

    var email: String
        get() = prefs.getString("email", "") ?: ""
        set(value) = prefs.edit().putString("email", value).apply()

    val base: String
        get() {
            val s = site.trim().trimEnd('/')
            return if (s.startsWith("http://") || s.startsWith("https://")) s else "https://$s"
        }

    fun webUrl(path: String) = base + path

    private suspend fun call(method: String, path: String, body: JsonObject? = null): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(base + path).header("Accept", "application/json")
        val rb = body?.toString()?.toRequestBody("application/json".toMediaType())
        when (method) {
            "GET" -> req.get()
            "DELETE" -> req.delete(rb)
            else -> req.method(method, rb ?: "{}".toRequestBody("application/json".toMediaType()))
        }
        val request = req.build()
        // One quiet retry: the first call after the phone wakes up often hits a stale connection
        val response = try {
            client.newCall(request).execute()
        } catch (e: java.io.IOException) {
            // Only reads are retried, so a text or status change is never sent twice
            if (method != "GET") throw ApiException("Can't reach ${site.ifBlank { "the shop" }}. Check your connection.")
            try {
                client.newCall(request).execute()
            } catch (e2: Exception) {
                throw ApiException("Can't reach ${site.ifBlank { "the shop" }}. Check your connection.")
            }
        }
        try {
            response.use { res ->
                val text = res.body?.string() ?: ""
                if (res.code == 401 || res.code == 403 || (res.code in 300..399 && res.header("Location")?.contains("/login") == true)) {
                    throw ApiException("Signed out", 401)
                }
                if (!res.isSuccessful) {
                    val msg = runCatching { json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                    throw ApiException(msg ?: "Something went wrong (${res.code})", res.code)
                }
                text
            }
        } catch (e: ApiException) {
            throw e
        } catch (e: Exception) {
            throw ApiException("Can't reach ${site.ifBlank { "the shop" }}. Check your connection.")
        }
    }

    suspend fun get(path: String) = call("GET", path)
    suspend fun post(path: String, body: JsonObject? = null) = call("POST", path, body)
    suspend fun put(path: String, body: JsonObject) = call("PUT", path, body)
    suspend fun delete(path: String) = call("DELETE", path)

    suspend inline fun <reified T> getAs(path: String): T = json.decodeFromString(get(path))

    // ---- Sign in: email → 6-digit code, the same as the website ----

    suspend fun sendCode(address: String) {
        val em = address.trim()
        val check = json.parseToJsonElement(post("/api/login/admin-check", buildJsonObject { put("email", em) })).jsonObject
        if (check["admin"]?.jsonPrimitive?.content != "true") throw ApiException("That email isn't an admin for this shop.")

        withContext(Dispatchers.IO) {
            val csrfText = client.newCall(Request.Builder().url("$base/api/auth/csrf").build()).execute().use { it.body?.string() ?: "" }
            val csrf = runCatching { json.parseToJsonElement(csrfText).jsonObject["csrfToken"]?.jsonPrimitive?.content }.getOrNull()
                ?: throw ApiException("Couldn't start sign-in. Is the site address right?")
            val form = FormBody.Builder()
                .add("csrfToken", csrf)
                .add("email", em)
                .add("callbackUrl", "$base/admin")
                .build()
            client.newCall(Request.Builder().url("$base/api/auth/signin/nodemailer").post(form).build()).execute().use { res ->
                val loc = res.header("Location") ?: ""
                if (res.code !in 200..399 || loc.contains("error")) throw ApiException("Couldn't send the email. Try again.")
            }
        }
        email = em
    }

    suspend fun verifyCode(address: String, code: String) {
        val res = json.parseToJsonElement(
            post("/api/login/code", buildJsonObject { put("email", address.trim()); put("code", code) }),
        ).jsonObject
        when (res["result"]?.jsonPrimitive?.content) {
            "ok" -> {}
            "locked" -> throw ApiException("Too many wrong codes. Request a new one in a little while.")
            "expired" -> throw ApiException("That code has expired. Request a new one.")
            else -> throw ApiException("That code isn't right. Check the email and try again.")
        }
        val normalized = res["email"]?.jsonPrimitive?.content ?: address.trim().lowercase()
        withContext(Dispatchers.IO) {
            val url = "$base/api/auth/callback/nodemailer".toHttpUrlOrNull()!!.newBuilder()
                .addQueryParameter("callbackUrl", "$base/admin")
                .addQueryParameter("token", code)
                .addQueryParameter("email", normalized)
                .build()
            client.newCall(Request.Builder().url(url).build()).execute().close()
        }
        if (!isAdmin()) throw ApiException("Signed in, but this email isn't an admin.")
    }

    suspend fun isAdmin(): Boolean = try {
        val s = json.parseToJsonElement(get("/api/auth/session"))
        (s as? JsonObject)?.get("user")?.jsonObject?.get("role")?.jsonPrimitive?.content == "ADMIN"
    } catch (e: Exception) {
        false
    }

    fun signOut() {
        jar.clear()
        android.webkit.CookieManager.getInstance().removeAllCookies(null)
    }

    /** Gives the in-app web pages the same sign-in as the app. */
    fun shareCookiesWithWebView() {
        val cm = android.webkit.CookieManager.getInstance()
        cm.setAcceptCookie(true)
        for (c in jar.all()) cm.setCookie(base, c.toString())
        cm.flush()
    }
}
