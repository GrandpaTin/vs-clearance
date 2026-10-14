package com.dealfilter.vitaminshoppe.data.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.dealfilter.vitaminshoppe.BuildConfig
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** A published version of the app, from GitHub Releases. */
data class AppRelease(
    val versionCode: Int,
    val versionName: String,
    val notes: String,
    val apkUrl: String,
    val apkBytes: Long,
    val pageUrl: String
)

/** Everything the update banner and dialog show. */
data class UpdateState(
    val available: AppRelease? = null,
    val isChecking: Boolean = false,
    /** 0..1 while downloading, null otherwise. */
    val progress: Float? = null,
    val readyToInstall: Boolean = false,
    /** Android needs the one-time "install unknown apps" permission for this app first. */
    val needsInstallPermission: Boolean = false,
    /** Retrying can't help (signed with another key, no installer): send the user to the download page. */
    val needsManualInstall: Boolean = false,
    val error: String? = null,
    /** The user tapped "Later" on this version; don't show the banner for it again. */
    val dismissed: Boolean = false,
    val isDialogOpen: Boolean = false
) {
    val showBanner: Boolean get() = available != null && !dismissed && !isDialogOpen
}

/**
 * Checks GitHub Releases for a newer build, downloads it inside the app and hands it to Android's
 * installer. Android itself only installs an update signed with the same key as the installed app,
 * and the file is checked against that before the installer is opened.
 */
open class AppUpdater(
    private val context: Context,
    private val currentVersionCode: Int = BuildConfig.VERSION_CODE,
    private val latestUrl: String = LATEST_RELEASE_URL
) {
    private val prefs = context.getSharedPreferences("vs_updates", Context.MODE_PRIVATE)
    private val lock = Mutex()

    /** Downloads belong to the app, not a screen: they survive the screen going away. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var downloadJob: Job? = null
    @Volatile private var signerMismatch = false

    // The last release found survives the app being closed, so its banner is back on the next launch.
    private val _state = MutableStateFlow(
        UpdateState(
            available = prefs.getString(K_RELEASE, null)
                ?.let { runCatching { parseRelease(it) }.getOrNull() }
                ?.takeIf { it.versionCode > currentVersionCode },
            dismissed = prefs.getInt(K_DISMISSED, 0).let { d -> d != 0 && d == (prefs.getString(K_RELEASE, null)?.let { runCatching { parseRelease(it)?.versionCode }.getOrNull() }) }
        )
    )

    init {
        val release = _state.value.available
        if (release != null) scope.launch {
            val ready = withContext(Dispatchers.IO) { apkFile.exists() && verifyMatchesInstalledApp(apkFile, release, exact = true) == null }
            if (ready) _state.update { if (it.available?.versionCode == release.versionCode) it.copy(readyToInstall = true) else it }
            // Restarted after granting "install unknown apps": open the installer as promised.
            if (ready && prefs.getBoolean(K_INSTALL_AFTER_GRANT, false)) {
                installWhenSeen = true
                withContext(Dispatchers.Main) { onReturnedToApp() }
            }
        }
    }
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    private val apkFile: File get() = File(File(context.cacheDir, "updates").apply { mkdirs() }, "VS-Clearance-update.apk")

    /** Daily at most, unless [force] (the "Check for updates" menu item). Returns a message for a manual check. */
    suspend fun check(force: Boolean = false): String? = lock.withLock {
        val now = System.currentTimeMillis()
        if (!force && now - prefs.getLong(K_CHECKED, 0L) < DAY_MS) return@withLock null
        _state.update { it.copy(isChecking = true, error = null) }
        val result = withContext(Dispatchers.IO) { runCatching { fetchLatest() } }
        // Only a check that got an answer counts; an offline morning mustn't silence it for a day.
        if (result.isSuccess) prefs.edit().putLong(K_CHECKED, now).putString(K_RELEASE, result.getOrNull()?.second).apply()
        if (result.isFailure) {
            // Offline or GitHub hiccup: keep any update already found (and its download) as it is.
            _state.update { it.copy(isChecking = false) }
            return@withLock if (result.exceptionOrNull() is IOException) "Couldn't check for updates — you're offline." else "Couldn't check for updates right now."
        }
        if (downloadJob?.isActive == true) {
            // Finish the download in progress; a newer release is offered on the next check.
            _state.update { it.copy(isChecking = false) }
            return@withLock null
        }
        withContext(Dispatchers.IO) { deleteStaleDownload() }
        val release = result.getOrNull()?.first
        val newer = release?.takeIf { it.versionCode > currentVersionCode }
        if (force && newer != null) prefs.edit().remove(K_DISMISSED).apply()
        val dismissedCode = prefs.getInt(K_DISMISSED, 0)
        _state.update {
            it.copy(
                isChecking = false,
                available = newer,
                dismissed = newer != null && !force && newer.versionCode == dismissedCode,
                readyToInstall = newer != null && it.readyToInstall && it.available?.versionCode == newer.versionCode
            )
        }
        when {
            newer != null -> null // the banner / dialog says it
            else -> "You're up to date (version ${BuildConfig.VERSION_NAME})."
        }
    }

    /** Keeps any error: a download that failed while the dialog was hidden still says why. */
    fun openDialog() = _state.update { it.copy(isDialogOpen = true) }

    /** Set by the screen: Android won't open the installer for an app that isn't in view. */
    @Volatile var inForeground: Boolean = true
    private var installWhenSeen = false

    /** "Later": hide this version's banner until a newer one or a manual check. */
    fun dismiss() {
        _state.value.available?.let { prefs.edit().putInt(K_DISMISSED, it.versionCode).remove(K_INSTALL_AFTER_GRANT).apply() }
        _state.update { it.copy(isDialogOpen = false, dismissed = true, error = null) }
    }

    fun startDownloadAndInstall() {
        if (downloadJob?.isActive == true) return
        val previous = downloadJob
        // A cancelled download may still be blocked in a read; let it finish deleting its file first.
        downloadJob = scope.launch { previous?.cancelAndJoin(); downloadAndInstall() }
    }

    fun cancelDownload() {
        downloadJob?.cancel()
        _state.update { it.copy(progress = null) }
    }

    /** Downloads (unless a verified copy is already here), verifies, then opens Android's installer. */
    suspend fun downloadAndInstall() {
        val release = _state.value.available ?: return
        val haveFile = withContext(Dispatchers.IO) { apkFile.exists() && verifyMatchesInstalledApp(apkFile, release, exact = true) == null }
        if (!haveFile) {
            signerMismatch = false
            _state.update { it.copy(progress = 0f, error = null, needsInstallPermission = false, needsManualInstall = false, readyToInstall = false) }
            try {
                val error = withContext(Dispatchers.IO) { download(release) }
                if (error != null) {
                    _state.update { it.copy(error = error, needsManualInstall = signerMismatch) }
                    return
                }
            } finally {
                _state.update { it.copy(progress = null) }
            }
        }
        _state.update { it.copy(readyToInstall = true) }
        install()
    }

    /** Opens the installer for an already downloaded file, or explains the permission it needs. */
    fun install() {
        if (!apkFile.exists()) {
            // The system may clear the cache; start over rather than hand the installer nothing.
            _state.update { it.copy(readyToInstall = false, error = "The download was cleared. Tap Try again to download it once more.") }
            return
        }
        if (!canInstall()) {
            // Granting the permission can restart the app: remember to carry on afterwards.
            prefs.edit().putBoolean(K_INSTALL_AFTER_GRANT, true).apply()
            _state.update { it.copy(needsInstallPermission = true) }
            return
        }
        if (!inForeground) {
            // Finished downloading in the background: open the installer when the app is next seen.
            installWhenSeen = true
            return
        }
        installWhenSeen = false
        val uri = FileProvider.getUriForFile(context, context.packageName + ".updates", apkFile)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
            prefs.edit().remove(K_INSTALL_AFTER_GRANT).apply()
            _state.update { it.copy(needsInstallPermission = false, error = null) }
        } catch (e: Exception) {
            _state.update { it.copy(error = "Android couldn't open its installer. Get the update from the download page instead.", needsManualInstall = true) }
        }
    }

    /** The settings page where Android grants "install unknown apps" to this app. */
    fun installPermissionIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Back from Settings: carry on if the permission was granted. */
    fun onReturnedToApp() {
        val s = _state.value
        if ((s.needsInstallPermission || installWhenSeen) && s.readyToInstall && canInstall()) install()
    }

    fun closeDialog() = _state.update { it.copy(isDialogOpen = false) }

    open fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    /** The parsed release plus its raw JSON (kept so the banner survives a restart). */
    private fun fetchLatest(): Pair<AppRelease?, String?> {
        val conn = (URL(latestUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "VS-Clearance-Android")
        }
        try {
            if (conn.responseCode == 404) return null to null // no release published yet
            if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
            val json = conn.inputStream.bufferedReader().use { it.readText() }
            return parseRelease(json) to json
        } finally {
            conn.disconnect()
        }
    }

    private suspend fun download(release: AppRelease): String? {
        val target = apkFile
        val partial = File(target.parentFile, target.name + ".part")
        try {
            val conn = (URL(release.apkUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = true
                setRequestProperty("User-Agent", "VS-Clearance-Android")
            }
            try {
                if (conn.responseCode !in 200..299) return "The download failed (error ${conn.responseCode}). Try again in a minute."
                val total = conn.contentLengthLong.takeIf { it > 0 } ?: release.apkBytes
                conn.inputStream.use { input ->
                    partial.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        var done = 0L
                        var lastShown = 0f
                        while (true) {
                            coroutineContext.ensureActive()
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            done += n
                            if (total <= 0 && done == n.toLong()) _state.update { it.copy(progress = -1f) } // size unknown
                            if (total > 0) {
                                val p = (done.toFloat() / total).coerceIn(0f, 1f)
                                if (p - lastShown >= 0.02f && coroutineContext.isActive) { lastShown = p; _state.update { it.copy(progress = p) } }
                            }
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }
            verifyMatchesInstalledApp(partial, release, exact = true)?.let { partial.delete(); return it }
            if (!partial.renameTo(target)) {
                target.delete()
                if (!partial.renameTo(target)) return "Couldn't save the update. Free up some space and try again."
            }
            return null
        } catch (e: IOException) {
            partial.delete()
            return "The download stopped — check your connection and try again."
        } catch (e: kotlinx.coroutines.CancellationException) {
            partial.delete()
            throw e
        }
    }

    /** A download that's already installed (or older) is just taking up space. */
    private fun deleteStaleDownload() {
        val f = apkFile
        if (!f.exists()) return
        @Suppress("DEPRECATION")
        val code = context.packageManager.getPackageArchiveInfo(f.path, 0)?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.longVersionCode.toInt() else it.versionCode
        }
        if (code == null || code <= currentVersionCode) f.delete()
    }

    /**
     * Same app, newer version, signed with the same key: anything else would fail to install anyway.
     * With [exact], it must also be this very release (an older cached download isn't reused).
     */
    private fun verifyMatchesInstalledApp(apk: File, release: AppRelease, exact: Boolean = false): String? {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val downloaded = pm.getPackageArchiveInfo(apk.path, flags) ?: return "The downloaded file isn't a valid app. Try again."
        if (downloaded.packageName != context.packageName) return "The download wasn't VS Clearance."
        @Suppress("DEPRECATION")
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) downloaded.longVersionCode.toInt() else downloaded.versionCode
        if (code <= currentVersionCode) return "That download isn't newer than this app."
        if (exact && code != release.versionCode) return "An older download is cached."
        val installed = pm.getPackageInfo(context.packageName, flags)
        if (signers(downloaded) != signers(installed)) {
            signerMismatch = true
            return "This update is signed with a different key than the app on your phone. " +
                "Uninstall VS Clearance once, then install it from the download page — updates work in-app after that."
        }
        return null
    }

    private fun signers(info: PackageInfo): Set<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners.orEmpty().map { it.toCharsString() }.toSet()
        } else {
            @Suppress("DEPRECATION")
            info.signatures.orEmpty().map { it.toCharsString() }.toSet()
        }

    companion object {
        const val LATEST_RELEASE_URL = "https://api.github.com/repos/GrandpaTin/vs-clearance/releases/latest"
        const val APK_NAME = "VS-Clearance.apk"
        private const val K_CHECKED = "checked"
        private const val K_DISMISSED = "dismissed"
        private const val K_RELEASE = "release"
        private const val K_INSTALL_AFTER_GRANT = "install_after_grant"
        private const val DAY_MS = 24 * 3600_000L

        private val VERSION_CODE = Regex("""versionCode:\s*(\d+)""")
        private val HIDDEN = Regex("""<!--.*?-->""", RegexOption.DOT_MATCHES_ALL)

        /**
         * Reads GitHub's "latest release" JSON. The release notes carry the build number in a hidden
         * comment (`<!-- versionCode: 26101318 -->`, written by scripts/release.mjs); the APK is the
         * asset named [APK_NAME]. Anything else (a draft, a missing APK) is ignored.
         */
        fun parseRelease(json: String): AppRelease? {
            val o = JSONObject(json)
            if (o.optBoolean("draft") || o.optBoolean("prerelease")) return null
            val body = o.optString("body")
            val code = VERSION_CODE.find(body)?.groupValues?.get(1)?.toIntOrNull() ?: return null
            val assets = o.optJSONArray("assets") ?: return null
            var url: String? = null
            var size = 0L
            for (i in 0 until assets.length()) {
                val a = assets.optJSONObject(i) ?: continue
                if (a.optString("name") == APK_NAME) {
                    url = a.optString("browser_download_url").takeIf { it.startsWith("https://") }
                    size = a.optLong("size")
                }
            }
            return AppRelease(
                versionCode = code,
                versionName = o.optString("tag_name").removePrefix("v").ifBlank { code.toString() },
                notes = body.replace(HIDDEN, "").trim(),
                apkUrl = url ?: return null,
                apkBytes = size,
                pageUrl = o.optString("html_url").ifBlank { "https://github.com/GrandpaTin/vs-clearance/releases/latest" }
            )
        }
    }
}
