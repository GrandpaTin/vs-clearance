package com.dealfilter.vitaminshoppe.ui.viewmodel

import android.app.Application
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
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
    private val repository = DealRepository(session)
    private val local = LocalStore(application)
    private val publisher = (application as VitaminShoppeApp).webPublisher

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

    init {
        viewModelScope.launch {
            restoreSavedState()
            refresh()
        }
        viewModelScope.launch {
            publisher.state.collect { share -> _uiState.update { it.copy(webShare = share) } }
        }
        viewModelScope.launch {
            var wasVisible = false
            session.challengeVisible.collect { visible ->
                _uiState.update { it.copy(isVerificationVisible = visible) }
                if (wasVisible && !visible) runPendingAfterVerification()
                wasVisible = visible
            }
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
                lastUpdatedMillis = cache?.savedAtMillis,
                changes = ListChanges(cache?.newIds.orEmpty(), cache?.priceDrops.orEmpty()),
                isShowingSavedData = items.isNotEmpty()
            ).withDerived()
        }
    }

    // -------------------------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------------------------

    override fun refresh() {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    status = if (it.hasData) LoadStatus.REFRESHING else LoadStatus.LOADING,
                    loadError = null,
                    loadErrorIsOffline = false
                )
            }
            try {
                val fetched = repository.fetchClearance()
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
                        stockError = null
                    ).withDerived()
                }
                // Save the fresh list now, keeping the last good stock for the same store until
                // the new stock check finishes (it may fail or the app may be killed meanwhile).
                val store = _uiState.value.selectedStore
                persistCache(items, now, carried?.first, carried?.second ?: emptyMap())
                if (store != null) startStockLoad(store) else stockJob?.cancel()
            } catch (e: CancellationException) {
                throw e
            } catch (e: FetchException.VerificationRequired) {
                afterVerification["refresh"] = { refresh() }
                _uiState.update { it.copy(status = LoadStatus.IDLE, loadError = e.message) }
            } catch (e: FetchException) {
                _uiState.update {
                    it.copy(status = LoadStatus.IDLE, loadError = e.message, loadErrorIsOffline = e is FetchException.Offline)
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(status = LoadStatus.IDLE, loadError = "Something went wrong loading deals. Please try again.") }
            }
        }
    }

    /** All stock loads go through here so a newer store always cancels the older load. */
    private fun startStockLoad(store: StoreLocation, announce: Boolean = false) {
        stockJob?.cancel()
        val items = _uiState.value.allDeals
        if (items.isEmpty()) {
            _uiState.update { it.copy(isStockLoading = false) }
            return
        }
        _uiState.update { it.copy(isStockLoading = true, stockError = null) }
        val job = viewModelScope.launch {
            try {
                val stock = repository.fetchStoreStock(store.storeId, items)
                _uiState.update { state ->
                    if (state.selectedStore?.storeId != store.storeId) return@update state
                    val updated = applyStock(state.allDeals, stock)
                    val onShelf = updated.count { it.isInStockAtStore }
                    state.copy(
                        allDeals = updated,
                        message = if (announce) "$onShelf clearance items on the shelf at ${store.name}" else state.message
                    ).withDerived()
                }
                val s = _uiState.value
                if (s.selectedStore?.storeId == store.storeId) {
                    lastStock = store.storeId to stock
                    persistCache(s.allDeals, s.lastUpdatedMillis ?: System.currentTimeMillis(), store.storeId, stock)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: FetchException.VerificationRequired) {
                afterVerification["stock"] = { _uiState.value.selectedStore?.let { startStockLoad(it) } }
                _uiState.update { it.copy(stockError = "Complete the verification to check shelf stock at ${store.name}.") }
            } catch (e: Exception) {
                val detail = e.message?.let { " $it" } ?: ""
                _uiState.update { it.copy(stockError = "Couldn't check stock at ${store.name}.$detail") }
            }
        }
        stockJob = job
        job.invokeOnCompletion {
            // Only the current job may clear the spinner; a cancelled older one must not.
            if (stockJob === job) _uiState.update { it.copy(isStockLoading = false) }
        }
    }

    override fun retryStock() {
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

    private suspend fun persistCache(items: List<DealItem>, savedAt: Long, stockStoreId: String?, stock: Map<String, Int>) {
        val changes = _uiState.value.changes
        withContext(NonCancellable + Dispatchers.IO) {
            cacheLock.withLock {
                local.saveCache(CachedDeals(items, savedAt, stockStoreId, stock, changes.newIds, changes.priceDrops))
            }
        }
        // Every saved list (fresh deals, then shelf stock) also goes to the user's web server if enabled.
        if (publisher.state.value.enabled && publisher.state.value.isConfigured) {
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
        if (share.isConfigured && !share.isPublishing && _uiState.value.allDeals.isNotEmpty()) publishNow()
    }

    fun closeWebShare() = _uiState.update { it.copy(isWebShareOpen = false) }

    fun saveWebShare(url: String, token: String, enabled: Boolean) = publisher.configure(url, token, enabled)

    fun setWebShareEnabled(enabled: Boolean) {
        publisher.setEnabled(enabled)
        if (enabled) publishNow()
    }

    /** Publishes what's on screen now (deals + current shelf stock). */
    fun publishNow() {
        val s = _uiState.value
        if (s.allDeals.isEmpty()) {
            showMessage("Nothing to publish yet — wait for the deals to load.")
            return
        }
        val stock = s.selectedStore?.let { store ->
            s.allDeals.mapNotNull { d -> d.jdaSkuId?.let { sku -> d.storeQuantity?.let { sku to it } } }.toMap()
                .takeIf { it.isNotEmpty() }?.let { store.storeId to it }
        }
        viewModelScope.launch {
            val error = publisher.publish(
                s.allDeals.map { it.copy(storeQuantity = null) }, s.lastUpdatedMillis ?: System.currentTimeMillis(),
                s.selectedStore, stock?.first, stock?.second ?: emptyMap()
            )
            showMessage(error ?: if (publisher.state.value.isGitHub) "Published ${s.allDeals.size} deals — live on the site in about a minute"
                else "Published ${s.allDeals.size} deals to the web app")
        }
    }

    /** vsdeals://publish?url=...&token=... opened on the phone. */
    fun handlePairingLink(uri: android.net.Uri?) {
        val (url, token) = WebPublisher.parsePairingLink(uri) ?: return
        publisher.configure(url, token, enabled = true)
        _uiState.update { it.copy(isWebShareOpen = true, message = "Web sharing turned on") }
        if (_uiState.value.hasData) publishNow()
    }

    // -------------------------------------------------------------------------------------------
    // Filters
    // -------------------------------------------------------------------------------------------

    override fun onQueryChange(query: String) = updateFilters { it.copy(query = query.take(80)) }

    override fun onCategoryToggle(category: String) =
        updateFilters { it.copy(category = if (it.category == category) null else category) }

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
        savePreferences()
    }

    private fun DealUiState.withDerived(): DealUiState {
        // A category that vanished after a refresh would otherwise hide everything.
        val validCategory = category?.takeIf { c -> allDeals.isEmpty() || allDeals.any { it.category.equals(c, true) } }
        val base = copy(category = validCategory)
        return base.copy(
            visibleDeals = DealFilters.apply(allDeals, base.criteria),
            categories = DealFilters.topCategories(allDeals)
        )
    }

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
        val problem = validateStoreQuery(query)
        if (problem != null) {
            _uiState.update { it.copy(storeSheet = sheet.copy(message = problem, results = emptyList(), hasSearched = true)) }
            return
        }
        storeSearchJob?.cancel()
        storeSearchJob = viewModelScope.launch {
            _uiState.update { it.copy(storeSheet = it.storeSheet?.copy(isSearching = true, message = null)) }
            var results: List<StoreLocation>? = null
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
                e.message ?: "Store search failed. Please try again."
            }
            _uiState.update { state ->
                state.copy(
                    storeSheet = state.storeSheet?.let { s ->
                        s.copy(results = results ?: s.results, message = message, isSearching = false, hasSearched = true)
                    }
                )
            }
        }
    }

    override fun selectStore(store: StoreLocation) {
        if (!store.isSelectable) {
            showMessage(if (store.temporarilyClosed) "${store.name} is temporarily closed." else "${store.name} doesn't offer in-store pickup.")
            return
        }
        storeSearchJob?.cancel()
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

    /** User closed the sheet; don't retry behind their back. */
    fun cancelVerification() {
        afterVerification.clear()
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

    override fun showMessage(text: String) = _uiState.update { it.copy(message = text) }

    override fun clearMessage() = _uiState.update { it.copy(message = null) }

    companion object {
        /** Returns a user-facing problem with the store query, or null when it's searchable. */
        fun validateStoreQuery(query: String): String? = when {
            query.isBlank() -> "Enter a ZIP code or city to find stores."
            query.all(Char::isDigit) && query.length != 5 -> "ZIP codes have 5 digits."
            query.length < 3 -> "Enter at least 3 characters."
            else -> null
        }
    }
}
