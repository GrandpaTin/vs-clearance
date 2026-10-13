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
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Where shared lists go. GitHub Pages is used when it's set up (it stays online with every device
 * off); otherwise the owner's own server; otherwise nothing, and the app works the same.
 */
data class WebShareState(
    val enabled: Boolean = false,
    /** "https://github.com/owner/repo", or blank. */
    val gitHubRepo: String = "",
    val gitHubToken: String = "",
    /** The owner's own VS Clearance server (e.g. over Tailscale), or blank. */
    val serverUrl: String = "",
    val serverToken: String = "",
    val lastPublishedAt: Long? = null,
    val lastError: String? = null,
    /** The last attempt couldn't reach its target; the list goes out on the next chance. */
    val pending: Boolean = false,
    /** Why it's waiting, e.g. "Will sync when dn.example.ts.net is reachable". */
    val pendingReason: String? = null,
    /** Published, but something needs a look (e.g. GitHub refused it and the own server took it). */
    val lastNote: String? = null,
    val isPublishing: Boolean = false
) {
    enum class Status { NOT_SET_UP, OFF, SYNCING, WAITING, ERROR, LIVE, READY }

    val hasGitHub: Boolean get() = WebPublisher.gitHubRepo(gitHubRepo) != null && gitHubToken.isNotBlank()
    val hasServer: Boolean get() = serverUrl.isNotBlank() && serverToken.isNotBlank()
    val isConfigured: Boolean get() = hasGitHub || hasServer

    /** GitHub wins when both are set up. */
    val isGitHub: Boolean get() = hasGitHub

    /** Where friends open the list. */
    val viewUrl: String
        get() = WebPublisher.gitHubRepo(gitHubRepo)?.takeIf { hasGitHub || !hasServer }
            ?.let { (owner, repo) -> "https://${owner.lowercase()}.github.io/$repo/" }
            ?: serverUrl

    /** Worth a look from the toolbar: failing, or working only through the fallback. */
    val needsAttention: Boolean get() = status == Status.ERROR || (enabled && lastNote != null && !pending)

    val status: Status
        get() = when {
            !isConfigured -> Status.NOT_SET_UP
            !enabled -> Status.OFF
            isPublishing -> Status.SYNCING
            pending -> Status.WAITING
            lastError != null -> Status.ERROR
            lastPublishedAt != null -> Status.LIVE
            else -> Status.READY
        }
}

/**
 * Uploads the latest deals so friends can see them on a PC or iPhone. Nothing here is on the app's
 * critical path: the deal list never waits for it, failures are kept as [WebShareState.pending] and
 * retried on the next refresh or when the network returns, and an unreachable target is skipped quietly.
 */
class WebPublisher(
    context: Context,
    defaultServerUrl: String = BuildConfig.SHARE_URL,
    defaultServerToken: String = BuildConfig.SHARE_TOKEN,
    defaultGitHubRepo: String = BuildConfig.GITHUB_REPO,
    defaultGitHubToken: String = BuildConfig.GITHUB_TOKEN
) {
    private val prefs = context.applicationContext.getSharedPreferences("vs_web_share", Context.MODE_PRIVATE)
    private val lock = Mutex()

    init {
        migrateSingleTarget()
        // Built-in owner defaults are written into the saved settings once, so a later update to a
        // build without them (the public APK) keeps everything working. Saved values always win.
        val edit = prefs.edit()
        if (!prefs.contains(K_GH_REPO) && defaultGitHubRepo.isNotBlank()) edit.putString(K_GH_REPO, normalizeUrl(defaultGitHubRepo))
        if (!prefs.contains(K_GH_TOKEN) && defaultGitHubToken.isNotBlank()) edit.putString(K_GH_TOKEN, defaultGitHubToken.trim())
        if (!prefs.contains(K_SRV_URL) && defaultServerUrl.isNotBlank()) edit.putString(K_SRV_URL, normalizeUrl(defaultServerUrl))
        if (!prefs.contains(K_SRV_TOKEN) && defaultServerToken.isNotBlank()) edit.putString(K_SRV_TOKEN, defaultServerToken.trim())
        if (!prefs.contains(K_ENABLED)) {
            val ready = (gitHubRepo(defaultGitHubRepo) != null && defaultGitHubToken.isNotBlank()) ||
                (defaultServerUrl.isNotBlank() && defaultServerToken.isNotBlank())
            edit.putBoolean(K_ENABLED, ready)
        }
        edit.apply()
    }

    private val _state = MutableStateFlow(readState())
    val state: StateFlow<WebShareState> = _state.asStateFlow()

    private fun readState() = WebShareState(
        enabled = prefs.getBoolean(K_ENABLED, false),
        gitHubRepo = prefs.getString(K_GH_REPO, "") ?: "",
        gitHubToken = prefs.getString(K_GH_TOKEN, "") ?: "",
        serverUrl = prefs.getString(K_SRV_URL, "") ?: "",
        serverToken = prefs.getString(K_SRV_TOKEN, "") ?: "",
        lastPublishedAt = prefs.getLong(K_LAST, 0L).takeIf { it > 0 },
        lastError = prefs.getString(K_ERROR, null),
        pending = prefs.getBoolean(K_PENDING, false),
        pendingReason = prefs.getString(K_PENDING_REASON, null),
        lastNote = prefs.getString(K_NOTE, null)
    )

    /** Versions before 3.1 kept one target under "url"/"token"; sort it into the right slot. */
    private fun migrateSingleTarget() {
        val url = prefs.getString("url", null) ?: return
        val token = prefs.getString("token", "") ?: ""
        val edit = prefs.edit().remove("url").remove("token")
        if (gitHubRepo(url) != null) edit.putString(K_GH_REPO, normalizeUrl(url)).putString(K_GH_TOKEN, token)
        else edit.putString(K_SRV_URL, normalizeUrl(url)).putString(K_SRV_TOKEN, token)
        edit.apply()
    }

    /** Saves both targets from the sheet. Blank fields clear that target. */
    fun configure(gitHubRepo: String, gitHubToken: String, serverUrl: String, serverToken: String, enabled: Boolean) {
        val before = _state.value
        val changed = normalizeUrl(gitHubRepo) != before.gitHubRepo || gitHubToken.trim() != before.gitHubToken ||
            normalizeUrl(serverUrl) != before.serverUrl || serverToken.trim() != before.serverToken
        val edit = prefs.edit()
            .putString(K_GH_REPO, normalizeUrl(gitHubRepo)).putString(K_GH_TOKEN, gitHubToken.trim())
            .putString(K_SRV_URL, normalizeUrl(serverUrl)).putString(K_SRV_TOKEN, serverToken.trim())
            .putBoolean(K_ENABLED, enabled)
        // An old "token rejected" error belongs to the old settings; the next sync reports on the new ones.
        if (changed) edit.remove(K_ERROR).remove(K_NOTE)
        edit.apply()
        _state.update { readState().copy(lastPublishedAt = it.lastPublishedAt, pending = it.pending) }
    }

    /** One target from a pairing link (vsdeals://publish?url=&token=): it goes in the slot its address fits. */
    fun configure(url: String, token: String, enabled: Boolean) {
        val s = _state.value
        if (gitHubRepo(url) != null) configure(url, token, s.serverUrl, s.serverToken, enabled)
        else configure(s.gitHubRepo, s.gitHubToken, url, token, enabled)
    }

    fun setEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(K_ENABLED, enabled).remove(K_ERROR).remove(K_NOTE).apply()
        _state.update { it.copy(enabled = enabled, lastError = null, lastNote = null) }
    }

    private class Outcome(val error: String?, val retryLater: Boolean = false, val note: String? = null)

    /** Returns null on success, or a user-facing reason (an unreachable target is marked pending). */
    suspend fun publish(
        items: List<DealItem>,
        savedAt: Long,
        store: StoreLocation?,
        stockStoreId: String?,
        stock: Map<String, Int>
    ): String? = lock.withLock {
        val s = _state.value
        if (!s.isConfigured) return@withLock "Sharing isn't set up yet."
        _state.update { it.copy(isPublishing = true) }
        val outcome = withContext(Dispatchers.IO) {
            val repo = gitHubRepo(s.gitHubRepo)
            if (s.hasGitHub && repo != null) {
                val viaGitHub = try {
                    publishToGitHub(repo, s.gitHubToken, buildPayload(items, savedAt, store, stockStoreId, stock, System.currentTimeMillis()))
                } catch (e: IOException) {
                    Outcome("Will sync when online", retryLater = true)
                } catch (e: Exception) {
                    Outcome("GitHub sent an unexpected reply; it will try again on the next sync", retryLater = true)
                }
                // GitHub didn't take it but the owner's own server is set up: use that rather than nothing.
                if (viaGitHub.error != null && s.hasServer) {
                    val viaServer = publishToServer(s, buildPayload(items, savedAt, store, stockStoreId, stock))
                    if (viaServer.error == null) Outcome(
                        null,
                        // A passing GitHub problem is retried so the shared link catches up; a token problem needs the user.
                        retryLater = viaGitHub.retryLater,
                        note = if (viaGitHub.retryLater) "Published to your server; the GitHub copy will catch up"
                        else "GitHub: ${viaGitHub.error.trimEnd('.')}. Published to your server instead."
                    ) else viaGitHub
                } else viaGitHub
            } else {
                publishToServer(s, buildPayload(items, savedAt, store, stockStoreId, stock))
            }
        }
        val now = System.currentTimeMillis()
        val ok = outcome.error == null
        prefs.edit().putBoolean(K_PENDING, outcome.retryLater)
            .putString(K_ERROR, if (outcome.retryLater) null else outcome.error)
            .putString(K_NOTE, outcome.note)
            .putString(K_PENDING_REASON, if (outcome.retryLater) outcome.error ?: outcome.note else null)
            .apply { if (ok) putLong(K_LAST, now) }.apply()
        _state.update {
            it.copy(
                isPublishing = false,
                pending = outcome.retryLater,
                pendingReason = if (outcome.retryLater) outcome.error ?: outcome.note else null,
                lastError = if (outcome.retryLater) null else outcome.error,
                lastNote = outcome.note,
                lastPublishedAt = if (ok) now else it.lastPublishedAt
            )
        }
        outcome.error
    }

    private fun publishToServer(s: WebShareState, payload: String): Outcome {
        val body = payload.toByteArray(Charsets.UTF_8)
        return try {
            val conn = (URL(s.serverUrl.trimEnd('/') + "/api/snapshot").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                // Short: an owner's PC that's off shouldn't hold anything up.
                connectTimeout = 8_000
                readTimeout = 30_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer ${s.serverToken}")
                setFixedLengthStreamingMode(body.size)
            }
            try {
                conn.outputStream.use { it.write(body) }
                when (val code = conn.responseCode) {
                    in 200..299 -> Outcome(null)
                    401 -> Outcome("The server rejected the token. Re-copy it from the server's /setup page.")
                    429 -> Outcome("The server is busy; it will sync next time.", retryLater = true)
                    in 500..599 -> Outcome("Will sync when your server is back", retryLater = true)
                    else -> Outcome("Server answered $code${readError(conn)?.let { ": $it" } ?: ""}")
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: IOException) {
            // PC off, Tailscale down or no network: not an error worth showing, just try again later.
            Outcome("Will sync when ${Uri.parse(s.serverUrl).host ?: "your server"} is reachable", retryLater = true)
        }
    }

    /**
     * Replaces the repo's `deals` branch with one commit holding snapshot.json; the Pages workflow
     * redeploys on that push. A single force-updated commit keeps the repo from growing with every refresh.
     */
    private fun publishToGitHub(repo: Pair<String, String>, token: String, payload: String): Outcome {
        val (owner, name) = repo
        val git = "https://api.github.com/repos/$owner/$name/git"
        val who = JSONObject().put("name", "VS Clearance").put("email", "vs-clearance@users.noreply.github.com")
        val tree = JSONObject().put("tree", JSONArray().put(
            JSONObject().put("path", "snapshot.json").put("mode", "100644").put("type", "blob").put("content", payload)
        ))
        val (treeCode, treeBody) = gitHub("POST", "$git/trees", token, tree)
        if (treeCode !in 200..299) return gitHubFailure(treeCode, treeBody, owner, name)
        val commit = JSONObject().put("message", "Deals update").put("tree", treeBody!!.getString("sha"))
            .put("parents", JSONArray()).put("author", who).put("committer", who)
        val (commitCode, commitBody) = gitHub("POST", "$git/commits", token, commit)
        if (commitCode !in 200..299) return gitHubFailure(commitCode, commitBody, owner, name)
        val sha = commitBody!!.getString("sha")
        val (refCode, refBody) = gitHub("PATCH", "$git/refs/heads/deals", token, JSONObject().put("sha", sha).put("force", true))
        if (refCode !in 200..299) {
            // First publish: the branch doesn't exist yet.
            val (newCode, newBody) = gitHub("POST", "$git/refs", token, JSONObject().put("ref", "refs/heads/deals").put("sha", sha))
            if (newCode !in 200..299) return gitHubFailure(newCode, newBody ?: refBody, owner, name)
        }
        // Rebuild the site from main (a push to `deals` alone runs no workflow).
        val (kick, _) = gitHub("POST", "https://api.github.com/repos/$owner/$name/dispatches", token, JSONObject().put("event_type", "deals"))
        // The list is saved; only the rebuild didn't start. The next sync starts it, so this is "waiting", not an error.
        return if (kick in 200..299) Outcome(null) else Outcome(null, retryLater = true, note = "Saved; the site will rebuild on the next sync")
    }

    /** Outages and rate limits retry by themselves; only a real permission problem asks about the token. */
    private fun gitHubFailure(code: Int, body: JSONObject?, owner: String, name: String): Outcome {
        val rateLimited = code == 429 || (code == 403 && body?.optString("message").orEmpty().contains("rate limit", ignoreCase = true))
        return when {
            rateLimited -> Outcome("GitHub is busy; it will sync shortly", retryLater = true)
            code >= 500 -> Outcome("Will sync when GitHub is back", retryLater = true)
            code == 401 -> Outcome("GitHub rejected the token — it may have expired. Make a new one with Contents: Read and write.")
            code == 403 || code == 404 -> Outcome("This token can't write to $owner/$name. Give it access to that repo with Contents: Read and write.")
            code == 422 -> Outcome("GitHub couldn't save the list (422). It will try again on the next sync.", retryLater = true)
            else -> Outcome("GitHub answered $code. It will try again on the next sync.", retryLater = true)
        }
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
        private const val K_ENABLED = "enabled"
        private const val K_GH_REPO = "gh_repo"
        private const val K_GH_TOKEN = "gh_token"
        private const val K_SRV_URL = "srv_url"
        private const val K_SRV_TOKEN = "srv_token"
        private const val K_LAST = "last"
        private const val K_PENDING = "pending"
        private const val K_ERROR = "error"
        private const val K_PENDING_REASON = "pending_reason"
        private const val K_NOTE = "note"

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
            .put("items", JSONArray().apply { items.forEach { put(LocalStore.dealToJson(it.copy(storeQuantity = null))) } })
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
