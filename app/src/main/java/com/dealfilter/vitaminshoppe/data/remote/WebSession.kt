package com.dealfilter.vitaminshoppe.data.remote

import android.annotation.SuppressLint
import android.content.Context
import android.content.MutableContextWrapper
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * A long-lived, invisible browser tab on vitaminshoppe.com used to call the site's JSON APIs.
 *
 * Why a WebView: the APIs are protected by DataDome, which answers any plain HTTP client
 * (OkHttp, curl) with HTTP 403 and a CAPTCHA. That is why the old OkHttp/Jsoup scraper never
 * received a single real product. Requests made by the site's own page inside a browser
 * engine succeed exactly as they do in Chrome. When DataDome does want a human check, the same
 * WebView is shown to the user ([challengeVisible]) so they can complete it themselves.
 */
@SuppressLint("SetJavaScriptEnabled")
class WebSession(context: Context) : JsonFetcher {

    private val appContext = context.applicationContext
    private val contextWrapper = MutableContextWrapper(appContext)

    private enum class PageState { NOT_LOADED, LOADING, READY, CHALLENGE, FAILED }

    private data class JsResult(val status: Int, val body: String)

    // Main-thread-only state.
    private var webView: WebView? = null
    private var pageState = PageState.NOT_LOADED
    private var pageWaiter: CompletableDeferred<PageState>? = null
    private var lastPageError: String? = null
    private var heldOpenByApi = false
    private var inForeground = true
    private var paused = false
    private var lastPageStartedAt = 0L
    private val mainHandler = Handler(Looper.getMainLooper())

    /** Set when we call loadUrl; a page-finished event before the new load starts is stale. */
    private var awaitingPageStart = false

    private val pending = ConcurrentHashMap<String, CompletableDeferred<JsResult>>()
    private val pendingRaw = ConcurrentHashMap<String, String>()
    private val readyLock = Mutex()

    private val _challengeVisible = MutableStateFlow(false)

    /** True while the site is showing a human-verification check the user needs to complete. */
    val challengeVisible: StateFlow<Boolean> = _challengeVisible.asStateFlow()

    override suspend fun getJson(url: String): String {
        if (!isOnline()) throw FetchException.Offline()
        var verificationRetries = 0
        var navigationRetries = 0
        while (true) {
            // Never reload the page underneath someone who is solving a check.
            if (_challengeVisible.value) throw FetchException.VerificationRequired()
            ensureReady()
            val result = jsFetch(url)
            when {
                result.status == STATUS_NAVIGATED -> {
                    // The page reloaded mid-request (DataDome refresh, user tapped a link).
                    if (_challengeVisible.value) throw FetchException.VerificationRequired()
                    if (++navigationRetries > 2) throw FetchException.Network("The page kept reloading.")
                }
                VsApi.isVerificationResponse(result.status, result.body) -> {
                    // Reloading the page lets DataDome re-check the session; if it still wants a
                    // human, the reloaded page shows the challenge and ensureReady() surfaces it.
                    verificationRetries++
                    withContext(Dispatchers.Main) { pageState = PageState.NOT_LOADED }
                    if (verificationRetries >= 2) {
                        // The page loads fine but the API is still refused: show the page so the
                        // user can complete whatever check DataDome overlays on it, and keep the
                        // sheet open until they tap Continue (no auto-close, so no retry loop).
                        withContext(Dispatchers.Main) {
                            heldOpenByApi = true
                            _challengeVisible.value = true
                            reloadForUser()
                        }
                        throw FetchException.VerificationRequired()
                    }
                }
                result.status == 0 -> {
                    withContext(Dispatchers.Main) { pageState = PageState.NOT_LOADED }
                    throw if (isOnline()) FetchException.Network("") else FetchException.Offline()
                }
                result.status !in 200..299 -> throw FetchException.Http(result.status)
                else -> return result.body
            }
        }
    }

    private var debugPinned = false

    /** Called when the verification sheet appears: load the check fresh at the visible size. */
    fun refreshForDisplay() {
        if (!debugPinned) reloadForUser()
    }

    /** Shows the live page to the user (used by the verification sheet's "Reload" button). */
    fun reloadForUser() {
        val wv = webView ?: return
        pageState = PageState.LOADING
        awaitingPageStart = true
        wv.loadUrl(VsApi.HOST_PAGE)
    }

    /**
     * Pause the hidden tab's scripts while the app is in the background (battery) — but only
     * once it's idle. Pausing mid-request would freeze the fetch while its timeout keeps
     * counting, turning "user opened a product page" into a false "took too long" error.
     */
    fun setForeground(foreground: Boolean) {
        setForegroundInternal(foreground)
    }

    /**
     * Debug builds only: shows the verification sheet with a page shaped like DataDome's challenge
     * (an iframe at height:100vh) so its rendering can be checked without triggering a real one.
     */
    fun debugShowChallengeLayout() {
        val wv = webView ?: createWebView().also { webView = it }
        val inner = "<body style='margin:0;background:#e0f2fe;font:24px sans-serif;display:grid;place-items:center;height:100vh'>Puzzle area (100vh)</body>"
        val html = "<html><body style='margin:0'><iframe style='height:100vh;width:100%;border:0' srcdoc=\"$inner\"></iframe></body></html>"
        heldOpenByApi = true
        debugPinned = true
        pageState = PageState.CHALLENGE
        wv.loadDataWithBaseURL(VsApi.SITE, html, "text/html", "utf-8", null)
        _challengeVisible.value = true
    }

    private fun setForegroundInternal(foreground: Boolean) {
        inForeground = foreground
        if (foreground) resumeIfPaused() else schedulePause()
    }

    /** Debounced so the short gaps between paged requests don't pause/resume the page each time. */
    private fun schedulePause() {
        mainHandler.removeCallbacks(pauseRunnable)
        mainHandler.postDelayed(pauseRunnable, 1_000)
    }

    private val pauseRunnable = Runnable { pauseIfIdle() }

    private fun pauseIfIdle() {
        val wv = webView ?: return
        if (inForeground || paused || pending.isNotEmpty() || pageWaiter != null) return
        // onPause alone doesn't stop page JavaScript; pauseTimers does (process-wide, but this
        // is the app's only WebView).
        wv.onPause()
        wv.pauseTimers()
        paused = true
    }

    private fun resumeIfPaused() {
        val wv = webView ?: return
        if (!paused) return
        wv.onResume()
        wv.resumeTimers()
        paused = false
    }

    /**
     * Hands the WebView to the verification sheet. Re-parenting into the Activity's context
     * lets the CAPTCHA widget open popups and follow the Activity theme.
     */
    fun attachForDisplay(activityContext: Context): WebView? {
        val wv = webView ?: return null
        (wv.parent as? ViewGroup)?.removeView(wv)
        contextWrapper.baseContext = activityContext
        // Must be MATCH_PARENT: a WebView left at the host's default WRAP_CONTENT height sizes its
        // viewport to its content, so `100vh` (the challenge frame's height) resolves to 0 px.
        wv.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        return wv
    }

    fun detachFromDisplay() {
        val wv = webView ?: return
        (wv.parent as? ViewGroup)?.removeView(wv)
        contextWrapper.baseContext = appContext
        sizeOffscreen(wv)
    }

    /**
     * A WebView that isn't attached to a window has a 0x0 viewport, so a page loaded while hidden
     * lays out as if the screen had no height. DataDome's challenge frame is `height: 100vh`, which
     * then stays 0 px tall: the user sees a blank sheet with no slider or puzzle. Keeping the hidden
     * tab at full-screen size makes pages load exactly as they would on screen.
     */
    private fun sizeOffscreen(wv: WebView) {
        val dm = appContext.resources.displayMetrics
        val w = View.MeasureSpec.makeMeasureSpec(dm.widthPixels, View.MeasureSpec.EXACTLY)
        val h = View.MeasureSpec.makeMeasureSpec(dm.heightPixels, View.MeasureSpec.EXACTLY)
        wv.measure(w, h)
        wv.layout(0, 0, dm.widthPixels, dm.heightPixels)
    }

    /** The verification sheet was closed (Continue or dismiss); the next request re-checks the page. */
    fun dismissChallenge() {
        heldOpenByApi = false
        debugPinned = false
        if (pageState == PageState.CHALLENGE) pageState = PageState.NOT_LOADED
        _challengeVisible.value = false
    }

    // -------------------------------------------------------------------------------------------

    private suspend fun ensureReady() = readyLock.withLock {
        withContext(Dispatchers.Main) {
            when (pageState) {
                PageState.READY -> return@withContext
                PageState.CHALLENGE -> {
                    _challengeVisible.value = true
                    throw FetchException.VerificationRequired()
                }
                else -> Unit
            }
            val existing = webView
            val wv = existing ?: createWebView().also { webView = it }
            resumeIfPaused()
            val waiter = CompletableDeferred<PageState>()
            pageWaiter = waiter
            lastPageError = null
            val loadIsFresh = SystemClock.elapsedRealtime() - lastPageStartedAt < 10_000
            if (existing != null && pageState == PageState.LOADING && loadIsFresh) {
                // A load is already under way (e.g. DataDome's own reload); wait for it rather
                // than cutting it short with a new one.
            } else {
                pageState = PageState.LOADING
                awaitingPageStart = true
                wv.loadUrl(VsApi.HOST_PAGE)
            }

            val outcome = withTimeoutOrNull(PAGE_TIMEOUT_MS) { waiter.await() }
            pageWaiter = null
            schedulePause()
            when (outcome) {
                PageState.READY -> Unit
                PageState.CHALLENGE -> {
                    _challengeVisible.value = true
                    throw FetchException.VerificationRequired()
                }
                PageState.FAILED -> {
                    pageState = PageState.NOT_LOADED
                    throw if (isOnline()) FetchException.Network(lastPageError ?: "") else FetchException.Offline()
                }
                else -> {
                    pageState = PageState.NOT_LOADED
                    wv.stopLoading()
                    throw FetchException.Timeout()
                }
            }
        }
    }

    private suspend fun jsFetch(url: String): JsResult {
        val id = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<JsResult>()
        pending[id] = deferred
        try {
            withContext(Dispatchers.Main) {
                val wv = webView ?: throw FetchException.Network("")
                resumeIfPaused()
                wv.evaluateJavascript(fetchScript(id, url), null)
            }
            val result = withTimeoutOrNull(FETCH_TIMEOUT_MS) { deferred.await() }
                ?: run {
                    // A hung request usually means the page navigated away; reload next time.
                    withContext(Dispatchers.Main) { pageState = PageState.NOT_LOADED }
                    throw FetchException.Timeout()
                }
            if (result.status != STATUS_RAW) return result
            // postMessage payloads are parsed here, off the main thread (they can be ~400 KB).
            val raw = pendingRaw.remove(id) ?: return JsResult(0, "")
            return withContext(Dispatchers.Default) {
                runCatching { JSONObject(raw).let { JsResult(it.getInt("s"), it.getString("b")) } }
                    .getOrElse { JsResult(0, "") }
            }
        } finally {
            pending.remove(id)
            pendingRaw.remove(id)
            mainHandler.post { schedulePause() }
        }
    }

    private fun fetchScript(id: String, url: String): String {
        val qid = JSONObject.quote(id)
        val qurl = JSONObject.quote(url)
        // Two bridge flavours: an origin-restricted WebMessageListener (postMessage) where the
        // WebView supports it, else the classic JavascriptInterface (onResult).
        return """
            (function(){
              function done(s, b) {
                var br = window.$BRIDGE;
                if (!br) return;
                if (typeof br.onResult === 'function') br.onResult($qid, s, b);
                else br.postMessage(JSON.stringify({id: $qid, s: s, b: b}));
              }
              try {
                fetch($qurl, {credentials: 'include', headers: {'Accept': 'application/json'}})
                  .then(function(r){ return r.text().then(function(t){ done(r.status, t); }); })
                  .catch(function(e){ done(0, String(e)); });
              } catch (e) { done(0, String(e)); }
            })();
        """.trimIndent()
    }

    private fun createWebView(): WebView {
        // Debug builds make WebViews inspectable by default; the site's bot check notices that
        // ("close the DevTools panel") and treats the session as suspicious.
        WebView.setWebContentsDebuggingEnabled(false)
        val wv = WebView(contextWrapper)
        sizeOffscreen(wv)
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadsImagesAutomatically = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(wv, true)
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Only the store's own top-level origin can reach the bridge, not ad or captcha iframes.
            WebViewCompat.addWebMessageListener(wv, BRIDGE, setOf(VsApi.SITE)) { _, message, _, _, _ ->
                val raw = message.data ?: return@addWebMessageListener
                val id = runCatching { JSONObject(raw).getString("id") }.getOrNull() ?: return@addWebMessageListener
                pendingRaw[id] = raw
                pending[id]?.complete(JsResult(STATUS_RAW, ""))
            }
        } else {
            wv.addJavascriptInterface(Bridge(), BRIDGE)
        }
        wv.webViewClient = Client()
        return wv
    }

    private inner class Bridge {
        @JavascriptInterface
        fun onResult(id: String, status: Int, body: String) {
            pending[id]?.complete(JsResult(status, body))
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            // Keep this tab on the store and its verification provider; never wander off-site.
            return !isAllowedNavigation(request.url)
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            awaitingPageStart = false
            lastPageStartedAt = SystemClock.elapsedRealtime()
            if (pageState != PageState.CHALLENGE) pageState = PageState.LOADING
            // Requests from the old document can never answer now; fail them fast instead of
            // letting each wait out the full timeout.
            pending.values.forEach { it.complete(JsResult(STATUS_NAVIGATED, "")) }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            if (awaitingPageStart) return
            val host = url?.let { Uri.parse(it).host } ?: return
            if (!host.endsWith("vitaminshoppe.com")) return
            view.evaluateJavascript(PROBE_SCRIPT) { raw ->
                val kind = raw?.trim('"') ?: ""
                when (kind) {
                    // DataDome's automatic device check reloads by itself; keep waiting.
                    "i" -> Unit
                    "c", "b" -> {
                        pageState = PageState.CHALLENGE
                        pageWaiter?.complete(PageState.CHALLENGE)
                        _challengeVisible.value = true
                    }
                    else -> {
                        pageState = PageState.READY
                        pageWaiter?.complete(PageState.READY)
                        if (!heldOpenByApi) _challengeVisible.value = false
                    }
                }
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            lastPageError = error.description?.toString()
            pageState = PageState.FAILED
            pageWaiter?.complete(PageState.FAILED)
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            // While a human check is on screen, load everything so the widget is never broken.
            if (_challengeVisible.value) return null
            return if (isBlockedSubresource(request.url)) EMPTY_RESPONSE() else null
        }
    }

    private fun isOnline(): Boolean {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    companion object {
        private const val BRIDGE = "VsDealsBridge"
        private const val STATUS_NAVIGATED = -1
        private const val STATUS_RAW = -2
        private const val PAGE_TIMEOUT_MS = 35_000L
        private const val FETCH_TIMEOUT_MS = 30_000L

        /** "c"/"b" = DataDome captcha/block page, "i" = automatic interstitial, "ok" = real page. */
        private const val PROBE_SCRIPT =
            "(function(){try{return (window.dd && window.dd.host) ? String(window.dd.rt || 'c') : 'ok';}catch(e){return 'ok';}})()"

        @Suppress("FunctionName")
        private fun EMPTY_RESPONSE() =
            WebResourceResponse("text/plain", "utf-8", 204, "No Content", emptyMap(), ByteArrayInputStream(ByteArray(0)))

        private val ALLOWED_NAV_HOSTS = listOf("vitaminshoppe.com", "captcha-delivery.com", "datadome.co")

        /**
         * Analytics, ads, chat and product imagery are not needed to call the APIs. Skipping them
         * keeps the hidden tab light on data and battery and avoids feeding trackers.
         */
        private val BLOCKED_HOST_SUFFIXES = listOf(
            "google-analytics.com", "googletagmanager.com", "doubleclick.net", "googleadservices.com",
            "googlesyndication.com", "google.com", "facebook.net", "facebook.com", "attn.tv",
            "useinsider.com", "liadm.com", "riskified.com", "reddit.com", "redditstatic.com",
            "visualwebsiteoptimizer.com", "pure.cloud", "mypurecloud.com", "brsrvr.com", "mczbf.com",
            "jstid.net", "typekit.net", "fonts.gstatic.com", "fonts.googleapis.com", "s7media.vitaminshoppe.com",
            "scene7.com", "osano.com", "bing.com", "tiktok.com", "pinterest.com", "criteo.com",
            "criteo.net", "clarity.ms", "hotjar.com", "amplience.net", "cdn.c1.amplience.net",
            "ca-05418ff615e9423a9fb31ec154f4d8ad.ecs.us-east-1.on.aws"
        )

        private fun isAllowedNavigation(uri: Uri): Boolean {
            val host = uri.host ?: return false
            return uri.scheme == "https" && ALLOWED_NAV_HOSTS.any { host == it || host.endsWith(".$it") }
        }

        fun isBlockedSubresource(uri: Uri): Boolean {
            val host = uri.host ?: return false
            if (host.endsWith("captcha-delivery.com") || host.endsWith("datadome.co")) return false
            if (BLOCKED_HOST_SUFFIXES.any { host == it || host.endsWith(".$it") }) return true
            // Server-side tag-manager proxy on the store's own domain.
            return host.endsWith("vitaminshoppe.com") && (uri.path ?: "").startsWith("/p391/")
        }
    }
}
