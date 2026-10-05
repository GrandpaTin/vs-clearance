package com.dealfilter.vitaminshoppe.data.remote

import android.content.Context
import android.net.Uri
import com.dealfilter.vitaminshoppe.BuildConfig
import com.dealfilter.vitaminshoppe.data.local.LocalStore
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class WebShareState(
    val enabled: Boolean = false,
    val serverUrl: String = "",
    val token: String = "",
    val lastPublishedAt: Long? = null,
    val lastError: String? = null,
    val isPublishing: Boolean = false
) {
    val isConfigured: Boolean get() = serverUrl.isNotBlank() && token.isNotBlank()

    /** Where friends open the list: the GitHub Pages site for a repo target, else the server itself. */
    val viewUrl: String
        get() = WebPublisher.gitHubRepo(serverUrl)?.let { (owner, repo) -> "https://${owner.lowercase()}.github.io/$repo/" }
            ?: serverUrl

    val isGitHub: Boolean get() = WebPublisher.gitHubRepo(serverUrl) != null
}

/**
 * Uploads the latest deals to the user's own VS Clearance web server so they can be viewed on a PC
 * or iPhone. The server can't fetch from vitaminshoppe.com itself (bot protection), so the phone,
 * which browses the site as a real user, is the data source.
 */
class WebPublisher(
    context: Context,
    defaultUrl: String = BuildConfig.SHARE_URL,
    defaultToken: String = BuildConfig.SHARE_TOKEN
) {
    private val prefs = context.applicationContext.getSharedPreferences("vs_web_share", Context.MODE_PRIVATE)
    private val lock = Mutex()

    // The owner build ships with its server built in, so sharing is on until the user says otherwise;
    // anything saved on the phone (a pairing link, an edit, the switch) wins over the defaults.
    private val builtIn = normalizeUrl(defaultUrl).isNotEmpty() && defaultToken.isNotBlank()

    private val _state = MutableStateFlow(
        WebShareState(
            enabled = prefs.getBoolean("enabled", builtIn),
            serverUrl = prefs.getString("url", null) ?: if (builtIn) normalizeUrl(defaultUrl) else "",
            token = prefs.getString("token", null) ?: if (builtIn) defaultToken.trim() else "",
            lastPublishedAt = prefs.getLong("last", 0L).takeIf { it > 0 }
        )
    )
    val state: StateFlow<WebShareState> = _state.asStateFlow()

    fun configure(serverUrl: String, token: String, enabled: Boolean) {
        val url = normalizeUrl(serverUrl)
        prefs.edit().putString("url", url).putString("token", token.trim()).putBoolean("enabled", enabled).apply()
        _state.update { it.copy(serverUrl = url, token = token.trim(), enabled = enabled, lastError = null) }
    }

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("enabled", enabled).apply()
        _state.update { it.copy(enabled = enabled, lastError = null) }
    }

    /** Returns null on success, or a user-facing error. */
    suspend fun publish(
        items: List<DealItem>,
        savedAt: Long,
        store: StoreLocation?,
        stockStoreId: String?,
        stock: Map<String, Int>
    ): String? = lock.withLock {
        val s = _state.value
        if (!s.isConfigured) return@withLock "Add the server address and token first."
        _state.update { it.copy(isPublishing = true) }
        val error = withContext(Dispatchers.IO) {
            val gitHub = gitHubRepo(s.serverUrl)
            if (gitHub != null) {
                return@withContext try {
                    publishToGitHub(gitHub, s.token, buildPayload(items, savedAt, store, stockStoreId, stock, System.currentTimeMillis()))
                } catch (e: Exception) {
                    "Couldn't reach GitHub (${e.javaClass.simpleName})."
                }
            }
            try {
                val body = buildPayload(items, savedAt, store, stockStoreId, stock).toByteArray(Charsets.UTF_8)
                val conn = (URL(s.serverUrl.trimEnd('/') + "/api/snapshot").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15_000
                    readTimeout = 30_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer ${s.token}")
                    setFixedLengthStreamingMode(body.size)
                }
                try {
                    conn.outputStream.use { it.write(body) }
                    when (val code = conn.responseCode) {
                        in 200..299 -> null
                        401 -> "The server rejected the token. Re-copy it from the server's /setup page."
                        429 -> "The server is rate-limiting; try again in a minute."
                        else -> "Server answered $code${readError(conn)?.let { ": $it" } ?: ""}"
                    }
                } finally {
                    conn.disconnect()
                }
            } catch (e: Exception) {
                "Couldn't reach ${Uri.parse(s.serverUrl).host ?: "the server"} (${e.javaClass.simpleName})."
            }
        }
        val now = System.currentTimeMillis()
        if (error == null) prefs.edit().putLong("last", now).apply()
        _state.update {
            it.copy(isPublishing = false, lastError = error, lastPublishedAt = if (error == null) now else it.lastPublishedAt)
        }
        error
    }

    /**
     * Replaces the repo's `deals` branch with one commit holding snapshot.json; the Pages workflow
     * redeploys on that push. A single force-updated commit keeps the repo from growing with every refresh.
     */
    private fun publishToGitHub(repo: Pair<String, String>, token: String, payload: String): String? {
        val (owner, name) = repo
        val git = "https://api.github.com/repos/$owner/$name/git"
        val who = JSONObject().put("name", "VS Clearance").put("email", "vs-clearance@users.noreply.github.com")
        val tree = JSONObject().put("tree", JSONArray().put(
            JSONObject().put("path", "snapshot.json").put("mode", "100644").put("type", "blob").put("content", payload)
        ))
        val (treeCode, treeBody) = gitHub("POST", "$git/trees", token, tree)
        if (treeCode !in 200..299) return gitHubError(treeCode, owner, name)
        val commit = JSONObject().put("message", "Deals update").put("tree", treeBody!!.getString("sha"))
            .put("parents", JSONArray()).put("author", who).put("committer", who)
        val (commitCode, commitBody) = gitHub("POST", "$git/commits", token, commit)
        if (commitCode !in 200..299) return gitHubError(commitCode, owner, name)
        val sha = commitBody!!.getString("sha")
        val (refCode, _) = gitHub("PATCH", "$git/refs/heads/deals", token, JSONObject().put("sha", sha).put("force", true))
        if (refCode in 200..299) return null
        // First publish: the branch doesn't exist yet.
        val (newCode, _) = gitHub("POST", "$git/refs", token, JSONObject().put("ref", "refs/heads/deals").put("sha", sha))
        return if (newCode in 200..299) null else gitHubError(newCode, owner, name)
    }

    private fun gitHubError(code: Int, owner: String, name: String): String = when (code) {
        401 -> "GitHub rejected the token — it may have expired. Make a new one with Contents: Read and write."
        403, 404 -> "This token can't write to $owner/$name. Give it access to that repo with Contents: Read and write."
        422 -> "GitHub couldn't save the list (422). Try again in a minute."
        else -> "GitHub answered $code."
    }

    private fun gitHub(method: String, url: String, token: String, body: JSONObject): Pair<Int, JSONObject?> {
        val bytes = body.toString().toByteArray(Charsets.UTF_8)
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            setMethod(conn, method)
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("User-Agent", "VS-Clearance-Android")
            conn.setFixedLengthStreamingMode(bytes.size)
            conn.outputStream.use { it.write(bytes) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() }
            return code to text?.let { runCatching { JSONObject(it) }.getOrNull() }
        } finally {
            conn.disconnect()
        }
    }

    // Android's HttpURLConnection accepts PATCH; plain Java's doesn't, so fall back to setting the field.
    private fun setMethod(conn: HttpURLConnection, method: String) {
        try {
            conn.requestMethod = method
        } catch (e: java.net.ProtocolException) {
            val f = HttpURLConnection::class.java.getDeclaredField("method")
            f.isAccessible = true
            f.set(conn, method)
        }
    }

    private fun readError(conn: HttpURLConnection): String? = runCatching {
        conn.errorStream?.bufferedReader()?.use { r -> JSONObject(r.readText()).optString("error").ifBlank { null } }
    }.getOrNull()

    companion object {
        /** Same field names as the app's cache file, which the web app reads directly. */
        fun buildPayload(
            items: List<DealItem>,
            savedAt: Long,
            store: StoreLocation?,
            stockStoreId: String?,
            stock: Map<String, Int>,
            publishedAt: Long? = null
        ): String = JSONObject()
            .put("v", 1)
            .put("savedAt", savedAt)
            .apply { if (publishedAt != null) put("publishedAt", publishedAt) }
            .put("items", JSONArray().apply { items.forEach { put(LocalStore.dealToJson(it)) } })
            .put("store", store?.let { LocalStore.storeToJson(it) } ?: JSONObject.NULL)
            .put("stockStoreId", stockStoreId ?: JSONObject.NULL)
            .put("stock", JSONObject().apply { stock.forEach { (k, v) -> put(k, v) } })
            .toString()

        private val GITHUB_REPO = Regex("""^https://(?:www\.)?github\.com/([A-Za-z0-9-]+)/([A-Za-z0-9._-]+?)(?:\.git)?/?$""")

        /** "github.com/owner/repo" -> (owner, repo): publish to that repo's GitHub Pages site instead of a server. */
        fun gitHubRepo(url: String): Pair<String, String>? =
            GITHUB_REPO.find(normalizeUrl(url))?.let { it.groupValues[1] to it.groupValues[2] }

        /** "dn.example.ts.net:10000" -> "https://dn.example.ts.net:10000" (https only; Android blocks cleartext). */
        fun normalizeUrl(raw: String): String {
            val t = raw.trim().trimEnd('/')
            if (t.isEmpty()) return ""
            return when {
                t.startsWith("https://", ignoreCase = true) -> t
                t.startsWith("http://", ignoreCase = true) -> "https://" + t.substring(7)
                else -> "https://$t"
            }
        }

        /** Parses vsdeals://publish?url=...&token=... ; null if it isn't a valid pairing link. */
        fun parsePairingLink(uri: Uri?): Pair<String, String>? {
            if (uri == null || uri.scheme != "vsdeals" || uri.host != "publish") return null
            val url = uri.getQueryParameter("url")?.takeIf { it.isNotBlank() } ?: return null
            val token = uri.getQueryParameter("token")?.takeIf { it.length >= 16 } ?: return null
            return normalizeUrl(url) to token
        }
    }
}
