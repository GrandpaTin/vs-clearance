package com.dealfilter.vitaminshoppe.ui.viewmodel

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.dealfilter.vitaminshoppe.VitaminShoppeApp
import com.dealfilter.vitaminshoppe.data.local.CachedDeals
import com.dealfilter.vitaminshoppe.data.local.LocalStore
import com.dealfilter.vitaminshoppe.data.local.SavedPreferences
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.data.remote.FetchException
import com.dealfilter.vitaminshoppe.data.remote.QuietChallenge
import com.dealfilter.vitaminshoppe.data.remote.VsApi
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebSession
import com.dealfilter.vitaminshoppe.data.repository.DealRepository
import com.dealfilter.vitaminshoppe.domain.AiPrompt
import com.dealfilter.vitaminshoppe.domain.DealFilters
import com.dealfilter.vitaminshoppe.domain.ListChanges
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class DealViewModel(application: Application) : AndroidViewModel(application), DealActions {

    private val session: WebSession = (application as VitaminShoppeApp).webSession
    private val repository = DealRepository((application as VitaminShoppeApp).fetcher)
    private val local = LocalStore(application)
    private val publisher = (application as VitaminShoppeApp).webPublisher
    private val updater = (application as VitaminShoppeApp).updater

    private val _uiState = MutableStateFlow(DealUiState())
    val uiState: StateFlow<DealUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null
    private var stockJob: Job? = null
    private var storeSearchJob: Job? = null

    /** Cache writes are serialized so two jobs can never interleave the same file. */
    private val cacheLock = Mutex()

    /** Requests blocked by a human check, re-run once it's completed. Keyed so none are lost or doubled. */
    private val afterVerification = LinkedHashMap<String, () -> Unit>()

    private var lastStoreQuery: String = ""

    /** Preferences must not be written before they're restored, or defaults would overwrite them. */
    private var restored = false

    /** Last good shelf stock, carried into the cache so a refresh can't erase it before new stock arrives. */
    private var lastStock: Pair<String, Map<String, Int>>? = null

    private val restoreJob: Job

    /** Visible to the user right now (between the Activity's onStart and onStop). */
    private var inForeground = false

    /** Automatic retries after a failed refresh, spaced out so a struggling site isn't hammered. */
    private var autoRetryJob: Job? = null
    private var autoFailures = 0

    /** The user asked to refresh while a background refresh was running. */
    private var userWaiting = false

    /** Whether the running list load is a background (quiet) one. */
    private var loadJobAuto = false

    /** The user's own "Check for updates" (one at a time). */
    private var manualUpdateCheck: Job? = null
    private var lastFailureAt = 0L

    /** The last refresh's list looked broken (far too short) and was kept out; the user can insist. */
    private var shortRejected = false

    /** The user chose "Load anyway" on the short-list banner: the next refresh takes what comes back. */
    private var acceptShortOnce = false

    /** Keeps an on-screen list fresh while the app stays open (e.g. propped up in the store). */
    private var freshnessJob: Job? = null

    /** Timed retries of a failed shelf check (30 s, then 2 min), like the list's backoff. */
    private var stockRetryJob: Job? = null
    private var stockFailures = 0

    /** The store whose running stock check will announce its shelf count when done. */
    private var announcingFor: String? = null

    /** Whether the running stock check was started in the background (vs. by the user). */
    private var stockJobQuiet = true

    /** A store the user picked before there was a list to check against. */
    private var pendingUserStock: String? = null

    /** The query of the last store search sent (to skip an identical repeat). */
    private var storeSearchQuery: String? = null

    /** When the user closed the site's check; automatic refreshes leave them alone for a while after. */
    private var verificationDeclinedAt = 0L

    private val connectivity = application.getSystemService(ConnectivityManager::class.java)

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            viewModelScope.launch { onNetworkAvailable() }
        }
    }

    init {
        restoreJob = viewModelScope.launch { restoreSavedState() }
        viewModelScope.launch {
            publisher.state.collect { share -> _uiState.update { it.copy(webShare = share) } }
        }
        viewModelScope.launch {
            updater.state.collect { u -> _uiState.update { it.copy(update = u) } }
        }
        viewModelScope.launch {
            var wasVisible = false
            session.challengeVisible.collect { visible ->
                _uiState.update { it.copy(isVerificationVisible = visible) }
                if (wasVisible && !visible) runPendingAfterVerification()
                wasVisible = visible
            }
        }
        runCatching { connectivity?.registerDefaultNetworkCallback(networkCallback) }
    }

    override fun onCleared() {
        runCatching { connectivity?.unregisterNetworkCallback(networkCallback) }
        super.onCleared()
    }

    // -------------------------------------------------------------------------------------------
    // Keeping the list fresh
    // -------------------------------------------------------------------------------------------

    /** The app came into view: refresh if the list is missing or older than [STALE_AFTER_MS]. */
    private var configChanging = false

    /** The activity is being recreated (rotation, theme): keep timers and skip the "came back" checks. */
    fun onConfigurationChanging() {
        configChanging = true
    }

    fun onAppForeground() {
        if (configChanging) {
            configChanging = false
            return
        }
        inForeground = true
        updater.inForeground = true
        updater.onReturnedToApp()
        viewModelScope.launch {
            restoreJob.join()
            // Nothing saved yet: opening the app is the user asking, so a check the site wants is shown now.
            val firstEver = !_uiState.value.hasData && _uiState.value.lastUpdatedMillis == null
            if (isRefreshDue(System.currentTimeMillis())) refreshInternal(auto = !firstEver)
            else {
                retryStockIfFailed()
                if (publisher.state.value.pending) shareIfOn()
            }
        }
        // At most once a day; quiet unless there's something new.
        viewModelScope.launch { updater.check() }
        freshnessJob?.cancel()
        freshnessJob = viewModelScope.launch {
            while (true) {
                delay(5 * 60_000L)
                // After a failure isRefreshDue waits out lastFailureAt, so this is at most one try per 5 minutes.
                if (inForeground && isRefreshDue(System.currentTimeMillis())) refreshInternal(auto = true)
            }
        }
    }

    fun onAppBackground() {
        inForeground = false
        updater.inForeground = false
        autoRetryJob?.cancel()
        stockRetryJob?.cancel()
        freshnessJob?.cancel()
    }

    internal fun isRefreshDue(now: Long): Boolean {
        val s = _uiState.value
        if (loadJob?.isActive == true || s.isVerificationVisible) return false
        if (now - verificationDeclinedAt < STALE_AFTER_MS) return false
        // The last attempt failed: try again however recent the list is. A site error waits out at least
        // the first backoff step, so repeated returns can't hammer a struggling site; offline is local.
        // Waiting on the site's human check: Check now is the way; a quiet try at most every 30 minutes.
        if (s.loadError != null && s.needsVerification) return now - lastFailureAt >= STALE_AFTER_MS
        if (s.loadError != null) return s.loadErrorIsOffline || now - lastFailureAt >= RETRY_DELAYS_MS[0]
        val updated = s.lastUpdatedMillis ?: return true
        // More than a minute in the future: saved while the phone's clock was ahead — its age is unknown.
        val age = now - updated
        return age < -60_000 || age >= STALE_AFTER_MS
    }

    private suspend fun onNetworkAvailable() {
        // Let the new connection settle; the first requests on a just-joined network often fail.
        delay(1_500)
        // The callback fires right at start-up: decide against the saved list, not an empty one.
        restoreJob.join()
        val s = _uiState.value
        val now = System.currentTimeMillis()
        val offlineRetry = s.loadErrorIsOffline && !s.isVerificationVisible && now - verificationDeclinedAt >= STALE_AFTER_MS
        if (inForeground && (offlineRetry || isRefreshDue(now))) refreshInternal(auto = true)
        else if (inForeground) retryStockIfFailed()
        // A list that couldn't be shared earlier goes out now (a refresh above publishes it anyway).
        val share = publisher.state.value
        if (share.pending && share.enabled && loadJob?.isActive != true) publishCurrent(announce = false)
    }

    /**
     * Shelf stock that failed to load (no signal, site hiccup), or never arrived for this store (the app
     * was closed mid-check), is tried again; a pending human check waits for the user.
     */
    private fun retryStockIfFailed() {
        val s = _uiState.value
        val store = s.selectedStore ?: return
        val neverLoaded = lastStock?.first != store.storeId && s.allDeals.isNotEmpty()
        if ((s.stockError == null && !neverLoaded) || stockJob?.isActive == true || afterVerification.containsKey("stock") || s.isVerificationVisible) return
        startStockLoad(store, quiet = true)
    }

    private fun scheduleAutoRetry() {
        if (!inForeground || autoFailures >= RETRY_DELAYS_MS.size) return
        val wait = RETRY_DELAYS_MS[autoFailures++]
        autoRetryJob?.cancel()
        autoRetryJob = viewModelScope.launch {
            delay(wait)
            if (inForeground && _uiState.value.loadError != null) refreshInternal(auto = true)
        }
    }

    private suspend fun restoreSavedState() {
        // Parsing a large cache is real work; keep it off the main thread.
        val (prefs, cache) = withContext(Dispatchers.IO) { local.loadPreferences() to local.loadCache() }
        val store = prefs.store
        val items = cache?.items.orEmpty().let { list ->
            if (cache != null && store != null && cache.stockStoreId == store.storeId) applyStock(list, cache.stock, missingIsUnknown = true) else list
        }
        lastStoreQuery = prefs.lastStoreQuery
        if (cache?.stockStoreId != null) lastStock = cache.stockStoreId to cache.stock
        restored = true
        _uiState.update {
            it.copy(
                selectedStore = store,
                // Pickup without a remembered store can't show anything useful; start in Ship.
                mode = if (store == null) FulfillmentMode.SHIP else prefs.mode,
                discountFloor = prefs.discountFloor,
                sort = prefs.sort,
                inStockOnly = prefs.inStockOnly,
                category = prefs.category,
                allDeals = items,
                lastUpdatedMillis = cache?.savedAtMillis?.takeIf { it > 0 },
                changes = ListChanges(cache?.newIds.orEmpty(), cache?.priceDrops.orEmpty()),
                isShowingSavedData = items.isNotEmpty(),
                // With a saved list there's something to show; with none, the first refresh is coming.
                status = if (items.isEmpty()) LoadStatus.LOADING else LoadStatus.IDLE
            ).withDerived()
        }
    }

    // -------------------------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------------------------

    /** "Load anyway" on the short-list banner: accept the shorter list on this (user) run only. */
    override fun loadShortListAnyway() {
        if (loadJobAuto) loadJob?.cancel() // a quiet run in progress mustn't pick up the user's choice
        acceptShortOnce = true
        refresh()
    }

    /** The user asked: start over on retries and forget an earlier "not now" on the site's check. */
    override fun refresh() {
        // A background refresh is already running: if it ends needing the site's check, run the user's own
        // refresh right after so the real check is shown (a quiet run never shows it).
        if (loadJob?.isActive == true && loadJobAuto) {
            userWaiting = true
            // A quiet retry was running behind an unchanged banner: show it, so the tap visibly does something.
            if (_uiState.value.status == LoadStatus.IDLE) _uiState.update {
                it.copy(status = if (it.hasData) LoadStatus.REFRESHING else LoadStatus.LOADING, loadError = null, loadErrorIsOffline = false, needsVerification = false)
            }
        }
        autoFailures = 0
        stockFailures = 0
        autoRetryJob?.cancel()
        verificationDeclinedAt = 0L
        refreshInternal(auto = false)
    }

    private fun refreshInternal(auto: Boolean) {
        if (loadJob?.isActive == true) return
        loadJobAuto = auto
        // Taken by this run only (a user run), so a failed "Load anyway" can't linger into a later one.
        val acceptShort = acceptShortOnce && !auto
        acceptShortOnce = false
        loadJob = viewModelScope.launch {
            // An automatic try while offline keeps the offline banner up (no "Refreshing…" flash, no
            // TalkBack re-announcement); the screen only changes if it gets through.
            if (auto && _uiState.value.loadErrorIsOffline && _uiState.value.hasData) Unit
            else _uiState.update {
                it.copy(
                    status = if (it.hasData) LoadStatus.REFRESHING else LoadStatus.LOADING,
                    loadError = null,
                    loadErrorIsOffline = false,
                    needsVerification = false
                )
            }
            try {
                val fetched = if (auto) withContext(QuietChallenge()) { repository.fetchClearance() } else repository.fetchClearance()
                val before = _uiState.value.allDeals.size
                // A list far shorter than the saved one AND than the site's own product count is a broken
                // answer (changed format, cut-off pages); a real sell-off has a matching count and is kept.
                // If the count itself is missing (0), a second refresh by the user takes the list anyway.
                val reported = repository.lastReportedTotal
                val suspicious = before >= 20 && fetched.size < before / 5 && (reported == 0 || fetched.size < reported * 0.8)
                if (suspicious && !acceptShort) {
                    shortRejected = true
                    throw FetchException.BadData("Vitamin Shoppe's list came back much shorter than usual — keeping your saved deals.")
                }
                val now = System.currentTimeMillis()
                // Show the last known shelf stock right away (new SKUs stay "unknown") so pickup
                // mode doesn't empty out while the fresh stock check runs.
                val storeNow = _uiState.value.selectedStore
                val carried = lastStock?.takeIf { it.first == storeNow?.storeId }
                val items = if (carried != null) applyStock(fetched, carried.second, missingIsUnknown = true) else fetched
                // Markers stay until a refresh that actually changes something replaces them.
                val diff = DealFilters.changes(_uiState.value.allDeals, fetched)
                _uiState.update {
                    val changes = if (diff.isEmpty) DealFilters.prune(it.changes, fetched) else diff
                    it.copy(
                        changes = changes,
                        onlyChanges = it.onlyChanges && !changes.isEmpty,
                        allDeals = items,
                        status = LoadStatus.IDLE,
                        lastUpdatedMillis = now,
                        isShowingSavedData = false,
                        needsVerification = false,
                        shortListPending = false,
                        loadError = null,
                        loadErrorIsOffline = false,
                        stockError = null
                    ).withDerived()
                }
                autoFailures = 0
                userWaiting = false
                afterVerification.remove("refresh") // the list came in: nothing left to redo after a check
                if (categoryDropped) { categoryDropped = false; savePreferences() }
                // Save the fresh list now, keeping the last good stock for the same store until
                // the new stock check finishes (it may fail or the app may be killed meanwhile).
                val store = _uiState.value.selectedStore
                // With a store, the stock check that follows publishes (once, with fresh stock).
                persistCache(items, now, carried?.first, carried?.second ?: emptyMap(), publish = store == null)
                // A stock check the user started (picking a store) stays a user action when restarted.
                val userPicked = store != null && pendingUserStock == store.storeId
                pendingUserStock = null
                if (store != null) startStockLoad(
                    store,
                    announce = userPicked,
                    quiet = auto && !userPicked && !(stockJob?.isActive == true && !stockJobQuiet)
                ) else stockJob?.cancel()
            } catch (e: CancellationException) {
                throw e
            } catch (e: FetchException.VerificationRequired) {
                afterVerification["refresh"] = { refreshInternal(auto = false) }
                val wanted = auto && userWaiting
                userWaiting = false
                if (wanted) {
                    val job = loadJob
                    viewModelScope.launch { job?.join(); refreshInternal(auto = false) }
                }
                lastFailureAt = System.currentTimeMillis()
                _uiState.update { it.copy(status = LoadStatus.IDLE, loadError = e.message, loadErrorIsOffline = false, needsVerification = true) }
            } catch (e: FetchException) {
                userWaiting = false
                val short = shortRejected
                shortRejected = false
                _uiState.update {
                    it.copy(status = LoadStatus.IDLE, loadError = e.message, loadErrorIsOffline = e is FetchException.Offline, shortListPending = short)
                }
                // Offline waits for the network to come back instead of a timer.
                if (e !is FetchException.Offline) { lastFailureAt = System.currentTimeMillis(); scheduleAutoRetry() }
            } catch (e: Exception) {
                userWaiting = false
                _uiState.update { it.copy(status = LoadStatus.IDLE, loadError = "Something went wrong loading deals. Please try again.", loadErrorIsOffline = false) }
                lastFailureAt = System.currentTimeMillis()
                scheduleAutoRetry()
            }
        }
    }

    /** All stock loads go through here so a newer store always cancels the older load. */
    private fun startStockLoad(store: StoreLocation, announce: Boolean = false, quiet: Boolean = false) {
        if (!quiet) afterVerification.remove("stock") // this run is the retry
        // A check that was going to announce "N on the shelf" for this store still does when restarted.
        val announceNow = announce || (stockJob?.isActive == true && announcingFor == store.storeId)
        announcingFor = if (announceNow) store.storeId else null
        stockJobQuiet = quiet
        stockJob?.cancel()
        val items = _uiState.value.allDeals
        if (items.isEmpty()) {
            // Nothing to check yet (first load still running): the refresh that brings the list runs
            // this store's check as the user's own, announced.
            if (!quiet) pendingUserStock = store.storeId
            _uiState.update { it.copy(isStockLoading = false) }
            return
        }
        _uiState.update { it.copy(isStockLoading = true, stockError = null) }
        val job = viewModelScope.launch {
            try {
                val stock = if (quiet) withContext(QuietChallenge()) { repository.fetchStoreStock(store.storeId, items) }
                else repository.fetchStoreStock(store.storeId, items)
                _uiState.update { state ->
                    if (state.selectedStore?.storeId != store.storeId) return@update state
                    val updated = applyStock(state.allDeals, stock)
                    val onShelf = updated.count { it.isInStockAtStore }
                    state.copy(
                        allDeals = updated,
                        message = if (announceNow) "$onShelf clearance items on the shelf at ${store.name}" else state.message
                    ).withDerived()
                }
                val s = _uiState.value
                if (s.selectedStore?.storeId == store.storeId) {
                    lastStock = store.storeId to stock
                    stockFailures = 0
                    afterVerification.remove("stock")
                    _uiState.update { it.copy(stockNeedsVerification = false) }
                    persistCache(s.allDeals, s.lastUpdatedMillis ?: System.currentTimeMillis(), store.storeId, stock)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: FetchException.VerificationRequired) {
                afterVerification["stock"] = { _uiState.value.selectedStore?.let { startStockLoad(it) } }
                _uiState.update {
                    it.copy(stockError = "Complete the verification to check shelf stock at ${store.name}.", stockNeedsVerification = true, stockErrorCause = null)
                }
                shareIfOn()
            } catch (e: Exception) {
                val cause = when (e) {
                    is FetchException.Offline -> "You're offline."
                    is FetchException.Timeout -> "Vitamin Shoppe took too long to answer."
                    is FetchException.Network -> "Couldn't reach vitaminshoppe.com."
                    is FetchException -> e.message
                    else -> null
                }
                val said = (cause ?: e.message)?.takeIf { it.isNotBlank() }?.let { " $it" } ?: ""
                _uiState.update { it.copy(stockError = "Couldn't check stock at ${store.name}.$said", stockErrorCause = cause, stockNeedsVerification = false) }
                if (inForeground && stockFailures < STOCK_RETRY_DELAYS_MS.size) {
                    val wait = STOCK_RETRY_DELAYS_MS[stockFailures++]
                    stockRetryJob?.cancel()
                    stockRetryJob = viewModelScope.launch { delay(wait); retryStockIfFailed() }
                }
                // The fresh deals still go out, just without this store's stock.
                shareIfOn()
            }
        }
        stockJob = job
        job.invokeOnCompletion {
            // Only the current job may clear the spinner; a cancelled older one must not.
            if (stockJob === job) { announcingFor = null; _uiState.update { it.copy(isStockLoading = false) } }
        }
    }

    override fun retryStock() {
        stockFailures = 0
        stockRetryJob?.cancel()
        _uiState.value.selectedStore?.let { startStockLoad(it) }
    }

    /**
     * A fresh stock response covers every SKU asked about, so a missing one means none on hand.
     * Stock carried over from an older list knows nothing about newer SKUs: leave them unknown.
     */
    private fun applyStock(items: List<DealItem>, stock: Map<String, Int>, missingIsUnknown: Boolean = false): List<DealItem> =
        items.map { item ->
            item.copy(storeQuantity = item.jdaSkuId?.let { sku -> stock[sku] ?: if (missingIsUnknown) null else 0 })
        }

    private suspend fun persistCache(items: List<DealItem>, savedAt: Long, stockStoreId: String?, stock: Map<String, Int>, publish: Boolean = true) {
        val changes = _uiState.value.changes
        withContext(NonCancellable + Dispatchers.IO) {
            cacheLock.withLock {
                local.saveCache(CachedDeals(items, savedAt, stockStoreId, stock, changes.newIds, changes.priceDrops))
            }
        }
        // Every saved list (fresh deals, then shelf stock) also goes to the user's web server if enabled.
        // Never awaited: sharing must not slow the list down, and its failures stay in the sheet.
        if (publish && publisher.state.value.enabled && publisher.state.value.isConfigured) {
            val store = _uiState.value.selectedStore
            viewModelScope.launch { publisher.publish(items, savedAt, store, stockStoreId, stock) }
        }
    }

    // -------------------------------------------------------------------------------------------
    // Share to web
    // -------------------------------------------------------------------------------------------

    /** The cloud button: shows the sheet and, when a server is set up, syncs right away. */
    override fun openWebShare() {
        _uiState.update { it.copy(isWebShareOpen = true) }
        val share = publisher.state.value
        // Only when sharing is on: with it off, opening the sheet must not publish anything.
        // ...and only when there's something unsent; just looking at the status shouldn't rebuild the site.
        val unsent = share.pending || share.lastError != null || (share.lastPublishedAt ?: 0L) < (_uiState.value.lastUpdatedMillis ?: 0L)
        if (share.enabled && share.isConfigured && !share.isPublishing && unsent && _uiState.value.allDeals.isNotEmpty()) publishCurrent(announce = false)
    }

    fun closeWebShare() = _uiState.update { it.copy(isWebShareOpen = false) }

    /** Save, and publish once with the new settings (the sheet's "Publish now"). */
    fun saveAndPublish(gitHubRepo: String, gitHubToken: String, serverUrl: String, serverToken: String, enabled: Boolean) {
        publisher.configure(gitHubRepo, gitHubToken, serverUrl, serverToken, enabled)
        publishNow()
    }

    fun saveWebShare(gitHubRepo: String, gitHubToken: String, serverUrl: String, serverToken: String, enabled: Boolean) {
        val before = publisher.state.value
        publisher.configure(gitHubRepo, gitHubToken, serverUrl, serverToken, enabled)
        val after = publisher.state.value
        // New credentials: try them now rather than leaving the old error up until the next refresh.
        if (after.gitHubRepo != before.gitHubRepo || after.gitHubToken != before.gitHubToken ||
            after.serverUrl != before.serverUrl || after.serverToken != before.serverToken) shareIfOn()
    }

    fun setWebShareEnabled(enabled: Boolean) {
        publisher.setEnabled(enabled)
        if (enabled) publishNow()
    }

    /** Publishes what's on screen now (deals + current shelf stock). */
    fun publishNow() = publishCurrent(announce = true)

    private fun shareIfOn() {
        val share = publisher.state.value
        if (share.enabled && share.isConfigured) publishCurrent(announce = false)
    }

    private fun publishCurrent(announce: Boolean) {
        val s = _uiState.value
        if (s.allDeals.isEmpty()) {
            if (announce) showMessage("Nothing to publish yet — wait for the deals to load.")
            return
        }
        val stock = s.selectedStore?.let { store ->
            s.allDeals.mapNotNull { d -> d.jdaSkuId?.let { sku -> d.storeQuantity?.let { sku to it } } }.toMap()
                .takeIf { it.isNotEmpty() }?.let { store.storeId to it }
        }
        viewModelScope.launch {
            val error = publisher.publish(
                s.allDeals.map { it.copy(storeQuantity = null) }, s.lastUpdatedMillis ?: System.currentTimeMillis(),
                s.selectedStore, stock?.first, stock?.second ?: emptyMap(),
                force = announce
            )
            if (!announce) return@launch
            showMessage(
                when {
                    error == WebPublisher.SUPERSEDED -> error
                    error != null && publisher.state.value.pending -> "Saved for later — " + (publisher.state.value.pendingReason ?: "it will sync when online").replaceFirstChar { it.lowercase() }
                    error != null -> error
                    publisher.state.value.pending -> "Published — " + (publisher.state.value.pendingReason ?: "the site will update on the next sync")
                        .removePrefix("Saved; ").replaceFirstChar { it.lowercase() }
                    publisher.state.value.isGitHub -> "Published ${s.allDeals.size} deals — live on the site in about a minute"
                    else -> "Published ${s.allDeals.size} deals to the web app"
                }
            )
        }
    }

    /** vsdeals://publish?url=...&token=... opened on the phone: any web page can open one, so ask first. */
    fun handlePairingLink(uri: android.net.Uri?) {
        val link = WebPublisher.parsePairingLink(uri) ?: return
        _uiState.update { it.copy(pendingPairing = link) }
    }

    fun acceptPairing() {
        val (url, token) = _uiState.value.pendingPairing ?: return
        publisher.configure(url, token, enabled = true)
        _uiState.update { it.copy(pendingPairing = null, isWebShareOpen = true, message = "Web sharing turned on") }
        if (_uiState.value.hasData) publishNow()
    }

    fun rejectPairing() = _uiState.update { it.copy(pendingPairing = null) }

    // -------------------------------------------------------------------------------------------
    // Filters
    // -------------------------------------------------------------------------------------------

    override fun onQueryChange(query: String) = updateFilters { it.copy(query = query.take(80)) }

    override fun onCategoryToggle(category: String) =
        updateFilters { it.copy(category = if (it.category.equals(category, true)) null else category) }

    override fun onDiscountFloor(floor: DiscountFloor) = updateFilters { it.copy(discountFloor = floor) }

    override fun onSort(sort: SortOption) = updateFilters { it.copy(sort = sort) }

    override fun onInStockOnly(enabled: Boolean) = updateFilters { it.copy(inStockOnly = enabled) }

    override fun clearFilters() = updateFilters { it.copy(query = "", category = null, discountFloor = DiscountFloor.ANY, onlyChanges = false) }

    override fun onOnlyChanges(enabled: Boolean) = updateFilters { it.copy(onlyChanges = enabled && !it.changes.isEmpty) }

    override fun clearSearch() = updateFilters { it.copy(query = "") }

    override fun clearCategory() = updateFilters { it.copy(category = null) }

    override fun onModeChange(mode: FulfillmentMode) {
        if (mode == FulfillmentMode.PICKUP && _uiState.value.selectedStore == null) {
            openStoreSheet()
            return
        }
        updateFilters { it.copy(mode = mode) }
    }

    private inline fun updateFilters(change: (DealUiState) -> DealUiState) {
        _uiState.update { change(it).withDerived() }
        if (categoryDropped) { categoryDropped = false; savePreferences() }
        savePreferences()
    }

    private fun DealUiState.withDerived(): DealUiState {
        // A category that vanished after a refresh would otherwise hide everything.
        val validCategory = category?.let { c -> if (allDeals.isEmpty()) c else allDeals.firstOrNull { it.category.equals(c, true) }?.category }
        if (category != null && validCategory == null && restored) categoryDropped = true
        val base = copy(category = validCategory)
        return base.copy(
            visibleDeals = DealFilters.apply(allDeals, base.criteria),
            categories = run {
                val onShelf = mode == FulfillmentMode.PICKUP && selectedStore != null && allDeals.any { it.storeQuantity != null }
                if (allDeals === categoriesFor && onShelf == categoriesOnShelf) categories
                else DealFilters.topCategories(if (onShelf) allDeals.filter { it.isInStockAtStore } else allDeals)
                    .also { categoriesFor = allDeals; categoriesOnShelf = onShelf }
            }
        )
    }

    /** A refresh removed the chosen category: saved preferences are updated after the state change. */
    private var categoryDropped = false

    /** The list [DealUiState.categories] was computed from (they only change when the list does). */
    private var categoriesFor: List<DealItem>? = null
    private var categoriesOnShelf = false

    private fun savePreferences() {
        if (!restored) return
        val s = _uiState.value
        local.savePreferences(SavedPreferences(s.selectedStore, s.mode, s.discountFloor, s.sort, s.inStockOnly, lastStoreQuery, s.category))
    }

    // -------------------------------------------------------------------------------------------
    // Store picker
    // -------------------------------------------------------------------------------------------

    override fun openStoreSheet() {
        val selected = _uiState.value.selectedStore
        val query = lastStoreQuery.ifBlank { selected?.zipCode.orEmpty() }
        _uiState.update { it.copy(storeSheet = StoreSheetState(query = query)) }
        if (query.isNotBlank()) searchStores()
    }

    override fun closeStoreSheet() {
        storeSearchJob?.cancel()
        afterVerification.remove("storeSearch")
        _uiState.update { it.copy(storeSheet = null) }
    }

    override fun onStoreQueryChange(query: String) {
        val clean = query.take(60)
        _uiState.update { it.copy(storeSheet = (it.storeSheet ?: StoreSheetState()).copy(query = clean, message = null)) }
        // A complete ZIP is unambiguous, so search right away instead of waiting for the button.
        if (clean.length == 5 && clean.all(Char::isDigit)) searchStores()
    }

    override fun searchStores() {
        val sheet = _uiState.value.storeSheet ?: return
        val query = sheet.query.trim()
        // Already searching (or already showing results) for exactly this: nothing new to ask the site.
        if (query == storeSearchQuery && (sheet.isSearching || (sheet.hasSearched && sheet.results.isNotEmpty() && sheet.message == null))) return
        storeSearchQuery = query
        val problem = validateStoreQuery(query)
        if (problem != null) {
            _uiState.update { it.copy(storeSheet = sheet.copy(message = problem, results = emptyList(), hasSearched = true)) }
            return
        }
        storeSearchJob?.cancel()
        storeSearchJob = viewModelScope.launch {
            _uiState.update { it.copy(storeSheet = it.storeSheet?.copy(isSearching = true, message = null)) }
            var results: List<StoreLocation>? = null
            var isError = false
            val message: String? = try {
                val result = repository.searchStores(query)
                results = result.stores
                lastStoreQuery = query
                savePreferences()
                when (result.status) {
                    VsApi.StoreSearchStatus.FOUND -> null
                    VsApi.StoreSearchStatus.NONE_NEARBY -> "No Vitamin Shoppe stores near “$query”. Try a nearby city or ZIP."
                    VsApi.StoreSearchStatus.UNRECOGNIZED_LOCATION -> "Couldn't find “$query”. Try a 5-digit ZIP code or “City, ST”."
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: FetchException.VerificationRequired) {
                afterVerification["storeSearch"] = { if (_uiState.value.storeSheet != null) searchStores() }
                "Complete the verification and the search will run again."
            } catch (e: Exception) {
                isError = true
                e.message ?: "Store search failed. Please try again."
            }
            _uiState.update { state ->
                state.copy(
                    storeSheet = state.storeSheet?.let { s ->
                        s.copy(results = results ?: if (query == lastStoreQuery) s.results else emptyList(), message = message, messageIsError = isError, isSearching = false, hasSearched = true)
                    }
                )
            }
        }
    }

    override fun selectStore(store: StoreLocation) {
        if (!store.isSelectable) {
            showMessage("${store.name} is temporarily closed.")
            return
        }
        storeSearchJob?.cancel()
        stockFailures = 0
        stockRetryJob?.cancel()
        _uiState.update {
            it.copy(
                selectedStore = store,
                mode = FulfillmentMode.PICKUP,
                storeSheet = null,
                stockError = null,
                // Old quantities belong to the previous store.
                allDeals = it.allDeals.map { d -> d.copy(storeQuantity = null) }
            ).withDerived()
        }
        savePreferences()
        startStockLoad(store, announce = true)
    }

    override fun clearStore() {
        stockJob?.cancel()
        stockRetryJob?.cancel()
        stockFailures = 0
        afterVerification.remove("stock")
        _uiState.update {
            it.copy(
                selectedStore = null,
                mode = FulfillmentMode.SHIP,
                storeSheet = null,
                isStockLoading = false,
                stockError = null,
                allDeals = it.allDeals.map { d -> d.copy(storeQuantity = null) },
                message = "Store cleared — showing ship-to-home deals"
            ).withDerived()
        }
        savePreferences()
        // Friends' copy shouldn't keep showing the old store's shelf counts (an unchanged list isn't re-sent).
        shareIfOn()
    }

    // -------------------------------------------------------------------------------------------
    // Verification
    // -------------------------------------------------------------------------------------------

    private fun runPendingAfterVerification() {
        val actions = afterVerification.values.toList()
        afterVerification.clear()
        actions.forEach { it() }
    }

    /** User tapped Continue after completing (or not needing) the check. */
    fun finishVerification() {
        if (afterVerification.isEmpty()) afterVerification["refresh"] = { refresh() }
        session.dismissChallenge()
    }

    /** User closed the sheet; don't retry behind their back (the banner keeps a Verify button). */
    fun cancelVerification() {
        if (afterVerification.containsKey("storeSearch")) {
            _uiState.update { s -> s.copy(storeSheet = s.storeSheet?.copy(message = "Search again when you're ready.", messageIsError = false)) }
        }
        afterVerification.clear()
        verificationDeclinedAt = System.currentTimeMillis()
        session.dismissChallenge()
    }

    fun reloadVerificationPage() = session.reloadForUser()

    // -------------------------------------------------------------------------------------------
    // AI prompt
    // -------------------------------------------------------------------------------------------

    override fun openPrompt() {
        val s = _uiState.value
        if (s.visibleDeals.isEmpty()) {
            showMessage("No deals to review — loosen your filters first.")
            return
        }
        val text = AiPrompt.build(s.visibleDeals, s.visibleDeals.size, s.selectedStore, s.mode)
        _uiState.update { it.copy(promptText = text) }
    }

    override fun closePrompt() = _uiState.update { it.copy(promptText = null) }

    override fun copyPrompt(context: Context) {
        val text = _uiState.value.promptText ?: return
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        if (clipboard == null) {
            showMessage("Clipboard isn't available on this device.")
            return
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("Vitamin Shoppe deals for AI review", text))
        // Android 13+ shows its own "Copied" confirmation.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            showMessage("Copied ${_uiState.value.promptItemCount} deals — paste into your AI chat")
        }
    }

    override fun sharePrompt(context: Context) {
        val text = _uiState.value.promptText ?: return
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
            putExtra(Intent.EXTRA_SUBJECT, "Vitamin Shoppe clearance deals to review")
        }
        try {
            context.startActivity(Intent.createChooser(send, "Send prompt to…"))
        } catch (e: Exception) {
            showMessage("No app available to share with.")
        }
    }

    // -------------------------------------------------------------------------------------------

    // -------------------------------------------------------------------------------------------
    // App updates
    // -------------------------------------------------------------------------------------------

    override fun checkForUpdates() {
        if (manualUpdateCheck?.isActive == true) return
        showMessage("Checking for updates…")
        // (An automatic check may be running; check() waits its turn, so the user still gets an answer.)
        manualUpdateCheck = viewModelScope.launch {
            val message = updater.check(force = true)
            if (message != null) showMessage(message) else if (updater.state.value.available != null) updater.openDialog()
        }
    }

    override fun openUpdate() = updater.openDialog()

    fun startUpdate() = updater.startDownloadAndInstall()

    fun cancelUpdateDownload() = updater.cancelDownload()

    fun laterUpdate() = updater.dismiss()

    fun closeUpdate() = updater.closeDialog()

    fun openInstallPermission(context: Context) {
        try {
            context.startActivity(updater.installPermissionIntent())
        } catch (e: Exception) {
            showMessage("Open Settings › Apps › VS Clearance › Install unknown apps, and allow it.")
        }
    }

    override fun showMessage(text: String) = _uiState.update { it.copy(message = text) }

    override fun clearMessage() = _uiState.update { it.copy(message = null) }

    companion object {
        /** Waits before the 1st, 2nd and 3rd automatic retry of a failed refresh. */
        private val RETRY_DELAYS_MS = longArrayOf(30_000L, 2 * 60_000L, 10 * 60_000L)
        private val STOCK_RETRY_DELAYS_MS = longArrayOf(30_000L, 2 * 60_000L)

        /** Returns a user-facing problem with the store query, or null when it's searchable. */
        fun validateStoreQuery(query: String): String? = when {
            query.isBlank() -> "Enter a ZIP code or city to find stores."
            query.all(Char::isDigit) && query.length != 5 -> "ZIP codes have 5 digits."
            query.length < 3 -> "Enter at least 3 characters."
            else -> null
        }
    }
}
