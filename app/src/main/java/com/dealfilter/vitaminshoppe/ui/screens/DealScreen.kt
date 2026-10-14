package com.dealfilter.vitaminshoppe.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshContainer
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.dealfilter.vitaminshoppe.VitaminShoppeApp
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.ui.components.AiPromptPreviewBottomSheet
import com.dealfilter.vitaminshoppe.ui.components.AskAiWideButton
import com.dealfilter.vitaminshoppe.ui.components.CategoryChips
import com.dealfilter.vitaminshoppe.ui.components.DealCard
import com.dealfilter.vitaminshoppe.ui.components.DiscountChips
import com.dealfilter.vitaminshoppe.ui.components.ModeAndStoreRow
import com.dealfilter.vitaminshoppe.ui.components.StoreSelectorBottomSheet
import com.dealfilter.vitaminshoppe.ui.components.SummaryRow
import com.dealfilter.vitaminshoppe.ui.components.VerificationDialog
import com.dealfilter.vitaminshoppe.ui.components.WebShareSheet
import com.dealfilter.vitaminshoppe.ui.components.openProductPage
import com.dealfilter.vitaminshoppe.ui.components.shareDeal
import com.dealfilter.vitaminshoppe.ui.theme.DealTheme
import com.dealfilter.vitaminshoppe.ui.theme.NavyDark
import com.dealfilter.vitaminshoppe.ui.theme.NavyPrimary
import com.dealfilter.vitaminshoppe.ui.theme.SkyBlueSecondary
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealActions
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealUiState
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebShareState
import com.dealfilter.vitaminshoppe.domain.DealFilters
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.MoreVert
import com.dealfilter.vitaminshoppe.ui.components.plainNotes
import com.dealfilter.vitaminshoppe.ui.components.UpdateDialog
import com.dealfilter.vitaminshoppe.BuildConfig
import com.dealfilter.vitaminshoppe.ui.viewmodel.RefreshNotice
import com.dealfilter.vitaminshoppe.ui.viewmodel.ago
import com.dealfilter.vitaminshoppe.ui.viewmodel.refreshNotice
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealViewModel
import com.dealfilter.vitaminshoppe.ui.viewmodel.LoadStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

@Composable
fun DealScreen(viewModel: DealViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    DealScreenContent(state, viewModel, modifier)
    if (state.isWebShareOpen) {
        WebShareSheet(
            share = state.webShare,
            onSave = viewModel::saveWebShare,
            onToggle = viewModel::setWebShareEnabled,
            onPublishNow = viewModel::publishNow,
            onSaveAndPublish = viewModel::saveAndPublish,
            onDismiss = viewModel::closeWebShare,
            onNotSaved = viewModel::showMessage
        )
    }
    state.pendingPairing?.let { (url, _) ->
        AlertDialog(
            onDismissRequest = viewModel::rejectPairing,
            title = { Text("Share deals to the web?") },
            text = {
                val repo = WebPublisher.gitHubRepo(url)
                val target = repo?.let { "GitHub (${it.first}/${it.second})" } ?: WebPublisher.normalizeUrl(url).removePrefix("https://")
                val current = if (repo != null) state.webShare.gitHubRepo.takeIf { it.isNotBlank() && WebPublisher.gitHubRepo(it) != repo }
                    ?.let { WebPublisher.gitHubRepo(it)?.let { r -> "GitHub (${r.first}/${r.second})" } ?: it }
                else state.webShare.serverUrl.takeIf { it.isNotBlank() && it != WebPublisher.normalizeUrl(url) }?.removePrefix("https://")
                Text(
                    "This link asks VS Clearance to publish your deal list to $target." +
                        (current?.let { " It replaces your current setup ($it) and its token." } ?: "") +
                        " Only accept links you made yourself."
                )
            },
            confirmButton = { Button(onClick = viewModel::acceptPairing) { Text("Share there") } },
            dismissButton = { TextButton(onClick = viewModel::rejectPairing) { Text("Cancel") } }
        )
    }
    if (state.update.isDialogOpen) {
        UpdateDialog(
            update = state.update,
            onUpdate = viewModel::startUpdate,
            onOpenSettings = { viewModel.openInstallPermission(context) },
            onLater = viewModel::laterUpdate,
            onHide = viewModel::closeUpdate,
            onCancelDownload = viewModel::cancelUpdateDownload,
            onOpenDownloadPage = { state.update.available?.let { openProductPage(context, it.pageUrl) } },
            onDismiss = viewModel::closeUpdate
        )
    }
    if (state.isVerificationVisible) {
        val session = (context.applicationContext as VitaminShoppeApp).webSession
        VerificationDialog(
            session = session,
            onContinue = viewModel::finishVerification,
            onReload = viewModel::reloadVerificationPage,
            onCancel = viewModel::cancelVerification
        )
    }
}

/** Stateless screen body: renders [state] and reports intents to [viewModel]. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DealScreenContent(state: DealUiState, viewModel: DealActions, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val snackbar = remember { SnackbarHostState() }
    val listState = rememberLazyListState()
    val pullState = rememberPullToRefreshState()
    val current by rememberUpdatedState(state)
    val dark = DealTheme.badges.isDark
    val largeFont = LocalDensity.current.fontScale >= 1.3f
    val headerColor = if (dark) NavyDark else NavyPrimary

    val scope = rememberCoroutineScope()
    LaunchedEffect(state.message) {
        val text = state.message ?: return@LaunchedEffect
        // Clear first so a rotation can't show it twice; show from a scope that clearing
        // (which restarts this effect) doesn't cancel.
        viewModel.clearMessage()
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            snackbar.showSnackbar(text)
        }
    }

    // Pull-to-refresh <-> view model loading state. The indicator is also shown for automatic
    // refreshes; only a pull while idle is the user asking (which resets retries and cool-downs).
    // Keyed on the indicator turning on: an automatic refresh ending (indicator still on for a frame
    // while status is already IDLE) must not count as a pull.
    LaunchedEffect(pullState.isRefreshing) {
        if (pullState.isRefreshing && current.status == LoadStatus.IDLE) {
            viewModel.refresh()
            // If a refresh was already finishing, status may never flip; don't spin forever.
            delay(400)
            if (current.status == LoadStatus.IDLE) pullState.endRefresh()
        }
    }
    LaunchedEffect(state.status) {
        if (state.status == LoadStatus.REFRESHING) pullState.startRefresh() else pullState.endRefresh()
    }

    // Dismiss the keyboard as soon as the list is scrolled.
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress }.distinctUntilChanged().collect { if (it) focusManager.clearFocus() }
    }

    // A new filter or sort should show its top results, not leave the user stranded mid-list.
    // (Typing in search keeps position to avoid jumpiness while typing.)
    LaunchedEffect(listState) {
        snapshotFlow { current.let { listOf(it.sort, it.discountFloor, it.category, it.mode, it.inStockOnly) } }
            .distinctUntilChanged()
            .drop(1)
            .collect { if (listState.firstVisibleItemIndex > HEADER_ITEMS) listState.animateScrollToItem(HEADER_ITEMS) }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Column(Modifier.background(headerColor)) {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                "Clearance Deals",
                                style = if (largeFont) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.semantics { heading() }
                            )
                            HeaderSubtitle(state, compact = largeFont)
                        }
                    },
                    actions = {
                        IconButton(onClick = viewModel::openWebShare) {
                            Icon(
                                when {
                                    state.webShare.needsAttention -> Icons.Default.CloudOff
                                    state.webShare.enabled && state.webShare.isConfigured -> Icons.Default.CloudDone
                                    else -> Icons.Default.CloudUpload
                                },
                                contentDescription = when {
                                    state.webShare.needsAttention -> "Share to web: needs attention"
                                    state.webShare.enabled && state.webShare.isConfigured -> "Share to web (on)"
                                    else -> "Share to web"
                                },
                                tint = Color.White
                            )
                        }
                        IconButton(onClick = viewModel::refresh) {
                            if (state.status == LoadStatus.IDLE) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh deals", tint = Color.White)
                            } else {
                                CircularProgressIndicator(
                                    Modifier
                                        .size(24.dp)
                                        .semantics { contentDescription = "Refreshing" },
                                    color = Color.White,
                                    strokeWidth = 2.5.dp
                                )
                            }
                        }
                        AppMenu(viewModel)
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = headerColor)
                )
                SearchField(
                    placeholder = if (largeFont) "Search deals" else "Search brand or product",
                    query = state.query,
                    onQueryChange = viewModel::onQueryChange,
                    onDone = { focusManager.clearFocus() },
                    container = if (dark) MaterialTheme.colorScheme.surfaceVariant else NavyDark
                )
                if (state.isStockLoading) {
                    LinearProgressIndicator(
                        Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Checking shelf stock" },
                        color = SkyBlueSecondary,
                        trackColor = headerColor
                    )
                }
            }
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .nestedScroll(pullState.nestedScrollConnection)
        ) {
            Column(Modifier.fillMaxSize()) {
            // Pinned above the list: inside a LazyColumn a banner appearing at the top is scrolled
            // out of sight (the list stays anchored to the first row), which hid every refresh error.
            Banners(state, viewModel)
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(bottom = 96.dp),
                modifier = Modifier.weight(1f).fillMaxWidth()
            ) {
                item(key = "mode") {
                    ModeAndStoreRow(
                        mode = state.mode,
                        store = state.selectedStore,
                        onModeChange = viewModel::onModeChange,
                        onOpenStores = viewModel::openStoreSheet,
                        modifier = Modifier.padding(top = 12.dp, bottom = 8.dp)
                    )
                }
                // Pickup with a store whose shelves haven't been checked yet (app closed mid-check, offline):
                // no item has a count, so an empty list means "unknown", not "nothing there".
                val stockUnknown = state.mode == FulfillmentMode.PICKUP && state.selectedStore != null &&
                    state.hasData && state.allDeals.none { it.storeQuantity != null }
                // What's on this shelf before search / category / discount: the shelf states only apply when that's empty.
                val shelf = if (state.mode == FulfillmentMode.PICKUP) DealFilters.apply(
                    state.allDeals, state.criteria.copy(query = "", category = null, minDiscount = 0, onlyIds = null)
                ) else null
                val shelfEmpty = shelf?.isEmpty() == true
                val stockBlocked = state.mode == FulfillmentMode.PICKUP && shelfEmpty &&
                    (state.isStockLoading || state.stockError != null || stockUnknown)
                if (state.hasData && !stockBlocked) {
                    item(key = "discount") {
                        DiscountChips(
                            selected = state.discountFloor,
                            onSelect = viewModel::onDiscountFloor,
                            showInStock = state.mode == FulfillmentMode.SHIP,
                            inStockOnly = state.inStockOnly,
                            onInStockOnly = viewModel::onInStockOnly,
                            showClear = state.hasActiveFilters,
                            clearDescription = clearDescription(state),
                            onClear = viewModel::clearFilters
                        )
                    }
                    item(key = "categories") {
                        CategoryChips(
                            categories = state.categories,
                            selected = state.category,
                            onToggle = viewModel::onCategoryToggle,
                            // Counted where the user is looking: in pickup, only changed items on this shelf.
                            changeCount = changedInMode(state),
                            onlyChanges = state.onlyChanges,
                            onOnlyChanges = viewModel::onOnlyChanges
                        )
                    }
                    stickyHeader(key = "summary") {
                        Surface(color = MaterialTheme.colorScheme.background) {
                            SummaryRow(
                                shown = state.visibleDeals.size,
                                total = shelf?.size ?: state.allDeals.size,
                                onShelf = shelf != null && state.selectedStore != null,
                                sort = state.sort,
                                onSort = viewModel::onSort,
                                aiCount = state.promptItemCount,
                                onAskAi = viewModel::openPrompt,
                                largeFont = largeFont,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }

                when {
                    !state.hasData && state.status == LoadStatus.LOADING -> {
                        item(key = "skeletonChips") { SkeletonChips() }
                        items(4, key = { "skeleton$it" }) { SkeletonCard() }
                    }
                    !state.hasData && state.loadError != null && state.needsVerification -> item(key = "error") {
                        StatusMessage(
                            icon = Icons.Default.VerifiedUser,
                            title = "Quick check needed",
                            body = "Vitamin Shoppe wants to confirm a person is browsing before it shows prices. Tap Check now to see its check.",
                            primary = "Check now" to viewModel::refresh
                        )
                    }
                    !state.hasData && state.loadError != null -> item(key = "error") {
                        StatusMessage(
                            icon = if (state.loadErrorIsOffline) Icons.Default.CloudOff else Icons.Default.ErrorOutline,
                            title = if (state.loadErrorIsOffline) "You're offline" else "Couldn't load deals",
                            body = state.loadError,
                            primary = "Try again" to viewModel::refresh
                        )
                    }
                    state.needsStoreForPickup -> item(key = "needStore") {
                        StatusMessage(
                            icon = Icons.Default.Storefront,
                            title = "Pick a store",
                            body = "Choose your Vitamin Shoppe to see which clearance items are on its shelves.",
                            primary = "Choose store" to viewModel::openStoreSheet
                        )
                    }
                    state.mode == FulfillmentMode.PICKUP && state.isStockLoading && shelfEmpty -> item(key = "checking") {
                        StatusMessage(
                            icon = Icons.Default.Storefront,
                            title = "Checking shelves…",
                            body = "Looking up stock at ${state.selectedStore?.name ?: "your store"}.",
                            showProgress = true
                        )
                    }
                    stockUnknown && state.visibleDeals.isEmpty() && state.stockError == null -> item(key = "stockUnknown") {
                        if (state.status == LoadStatus.REFRESHING) StatusMessage(
                            icon = Icons.Default.Storefront,
                            title = "Checking shelves…",
                            body = "Getting the latest list, then stock at ${state.selectedStore?.name ?: "your store"}.",
                            showProgress = true
                        ) else StatusMessage(
                            icon = Icons.Default.Storefront,
                            title = "Shelf stock not checked yet",
                            body = "VS Clearance hasn't checked the shelves at ${state.selectedStore?.name ?: "your store"} yet." +
                                if (state.loadErrorIsOffline) " Connect to the internet, then check." else "",
                            primary = "Check shelves" to viewModel::retryStock,
                            secondary = "Show ship-to-home" to { viewModel.onModeChange(FulfillmentMode.SHIP) }
                        )
                    }
                    state.mode == FulfillmentMode.PICKUP && state.stockError != null && shelfEmpty -> item(key = "stockFailed") {
                        StatusMessage(
                            icon = Icons.Default.ErrorOutline,
                            warning = true,
                            title = "Couldn't check shelves at ${state.selectedStore?.name ?: "your store"}",
                            body = if (state.stockNeedsVerification) "Vitamin Shoppe wants a quick check first. Tap Check now, or browse ship-to-home deals meanwhile."
                            else (state.stockErrorCause ?: "Shelf stock didn't load.") + " Try again, or browse ship-to-home deals meanwhile.",
                            primary = (if (state.stockNeedsVerification) "Check now" else "Try again") to viewModel::retryStock,
                            secondary = "Show ship-to-home" to { viewModel.onModeChange(FulfillmentMode.SHIP) }
                        )
                    }
                    state.hasData && state.visibleDeals.isEmpty() -> item(key = "empty") { NoMatches(state, viewModel) }
                    !state.hasData && state.status == LoadStatus.IDLE -> item(key = "none") {
                        StatusMessage(
                            icon = Icons.Default.SearchOff,
                            title = "No clearance items listed",
                            body = "Vitamin Shoppe isn't listing any clearance products right now.",
                            primary = "Refresh" to viewModel::refresh
                        )
                    }
                    else -> {
                        if (largeFont) item(key = "askAi") { AskAiWideButton(state.promptItemCount, viewModel::openPrompt) }
                        items(state.visibleDeals, key = { it.id }) { deal ->
                        DealCard(
                            deal = deal,
                            store = state.selectedStore,
                            isStockLoading = state.isStockLoading,
                            shipMode = state.mode == FulfillmentMode.SHIP,
                            isNew = deal.id in state.changes.newIds,
                            previousPrice = state.changes.priceDrops[deal.id],
                            onOpen = {
                                if (!openProductPage(context, it.productUrl)) viewModel.showMessage("No browser app is installed to open this page.")
                            },
                            onShare = {
                                if (!shareDeal(context, it)) viewModel.showMessage("No app available to share with.")
                            },
                            modifier = Modifier.animateItemPlacement()
                        )
                        }
                    }
                }
            }
            }
            PullToRefreshContainer(state = pullState, modifier = Modifier.align(Alignment.TopCenter))
        }
    }

    state.storeSheet?.let { sheet ->
        StoreSelectorBottomSheet(
            sheet = sheet,
            selectedStore = state.selectedStore,
            onQueryChange = viewModel::onStoreQueryChange,
            onSearch = viewModel::searchStores,
            onSelect = viewModel::selectStore,
            onClearStore = viewModel::clearStore,
            onDismiss = viewModel::closeStoreSheet
        )
    }

    state.promptText?.let { text ->
        AiPromptPreviewBottomSheet(
            promptText = text,
            itemCount = state.promptItemCount,
            totalMatching = state.visibleDeals.size,
            scopeSummary = promptScope(state),
            onCopy = { viewModel.copyPrompt(context) },
            onShare = { viewModel.sharePrompt(context) },
            onDismiss = viewModel::closePrompt
        )
    }
}

/** mode, discount, categories — the sticky summary header is the next item. */
private const val HEADER_ITEMS = 3

private fun changedInMode(state: DealUiState): Int {
    val ids = state.changes.newIds + state.changes.priceDrops.keys
    if (ids.isEmpty()) return 0
    // Same availability rules as the list (pickup shelf, "In stock" in ship mode), no other filters.
    return DealFilters.apply(state.allDeals, state.criteria.copy(query = "", category = null, minDiscount = 0, onlyIds = ids)).size
}

private fun clearDescription(state: DealUiState): String {
    val parts = listOfNotNull(
        "search".takeIf { state.query.isNotBlank() },
        "category".takeIf { state.category != null },
        "discount".takeIf { state.discountFloor != DiscountFloor.ANY },
        "new and price drops".takeIf { state.onlyChanges }
    )
    if (parts.isEmpty()) return "Clear filters"
    return "Clear " + when (parts.size) {
        0, 1 -> parts.firstOrNull() ?: "filters"
        else -> parts.dropLast(1).joinToString(", ") + " and " + parts.last()
    } + " filter" + if (parts.size > 1) "s" else ""
}

@Composable
private fun SkeletonChips() {
    val block = MaterialTheme.colorScheme.surfaceVariant
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        repeat(4) { Box(Modifier.size(width = 88.dp, height = 32.dp).clip(RoundedCornerShape(8.dp)).background(block)) }
    }
}

private fun promptScope(state: DealUiState): String = listOfNotNull(
    if (state.mode == FulfillmentMode.PICKUP && state.selectedStore != null) "On the shelf at ${state.selectedStore.name}" else "Ship to home",
    state.discountFloor.takeIf { it != DiscountFloor.ANY }?.let { "${it.label} off" },
    state.category,
    state.query.takeIf { it.isNotBlank() }?.let { "“${it.trim()}”" }
).joinToString(" · ")

@Composable
private fun NoMatches(state: DealUiState, viewModel: DealActions) {
    val atStore = if (state.mode == FulfillmentMode.PICKUP && state.selectedStore != null) " at ${state.selectedStore.name}" else ""
    val reasons = listOfNotNull(
        state.query.takeIf { it.isNotBlank() }?.let { "matching “${it.trim()}”" },
        state.category?.let { "in $it" },
        state.discountFloor.takeIf { it != DiscountFloor.ANY }?.let { "at ${it.label} off" },
        "in stock online".takeIf { state.mode == FulfillmentMode.SHIP && state.inStockOnly },
        "new or cheaper since your last check".takeIf { state.onlyChanges }
    )
    val body = if (reasons.isEmpty()) "Nothing on clearance$atStore right now. Pull down to refresh."
    else "Nothing on clearance$atStore ${reasons.joinToString(", ")}."
    val onlyStockFilter = state.query.isBlank() && state.category == null && state.discountFloor == DiscountFloor.ANY && !state.onlyChanges
    val fixes = listOfNotNull(
        ("Show all deals" to { viewModel.onOnlyChanges(false) }).takeIf { state.onlyChanges },
        state.query.takeIf { it.isNotBlank() }?.let { "Clear search" to viewModel::clearSearch },
        state.category?.let { "All categories" to viewModel::clearCategory },
        state.discountFloor.takeIf { it != DiscountFloor.ANY }?.let { "Any discount" to { viewModel.onDiscountFloor(DiscountFloor.ANY) } },
        ("Include out of stock" to { viewModel.onInStockOnly(false) })
            .takeIf { state.mode == FulfillmentMode.SHIP && state.inStockOnly && onlyStockFilter },
        ("Show ship-to-home" to { viewModel.onModeChange(FulfillmentMode.SHIP) }).takeIf { state.mode == FulfillmentMode.PICKUP }
    )
    StatusMessage(icon = Icons.Default.SearchOff, title = "No matching deals", body = body, fixes = fixes)
}

/** The current time, ticking every 30 s so "saved 5 minutes ago" text stays true. */
@Composable
internal fun rememberNowMillis(): Long {
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(30_000)
            value = System.currentTimeMillis()
        }
    }
    return now
}

@Composable
private fun HeaderSubtitle(state: DealUiState, compact: Boolean) {
    val now = rememberNowMillis()
    // At large font sizes the bar has room for one short line only ("4 min ago").
    val updated = state.lastUpdatedMillis?.let { ago(it, now) }
        ?.let { if (compact) it.replace(" minutes", " min").replace(" minute", " min").replace(" hours", " hr").replace(" hour", " hr") else it }
    val changed = changedInMode(state)
    val text = when {
        state.status == LoadStatus.LOADING -> "Loading live prices…"
        state.status == LoadStatus.REFRESHING -> "Refreshing…"
        state.isShowingSavedData && updated != null -> "Saved $updated"
        updated != null && changed > 0 -> "Updated $updated · $changed new or cheaper"
        updated != null -> "Updated $updated"
        else -> "Live from vitaminshoppe.com"
    }
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = Color.White.copy(alpha = 0.85f),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
    )
}

@Composable
private fun SearchField(placeholder: String, query: String, onQueryChange: (String) -> Unit, onDone: () -> Unit, container: Color) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = {
            Text(
                placeholder,
                color = Color.White.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = SkyBlueSecondary) },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Default.Clear, contentDescription = "Clear search", tint = Color.White)
                }
            }
        },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { onDone() }),
        shape = RoundedCornerShape(12.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = container,
            unfocusedContainerColor = container,
            focusedTextColor = Color.White,
            unfocusedTextColor = Color.White,
            cursorColor = SkyBlueSecondary,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent
        ),
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, bottom = 10.dp)
    )
}

/** Overflow menu: app-level things that don't belong next to the deals. */
@Composable
private fun AppMenu(viewModel: DealActions) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(Icons.Default.MoreVert, contentDescription = "More options", tint = Color.White)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text("Check for updates") },
                leadingIcon = { Icon(Icons.Default.SystemUpdate, contentDescription = null) },
                onClick = { open = false; viewModel.checkForUpdates() }
            )
            DropdownMenuItem(
                text = { Text("Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", style = MaterialTheme.typography.bodySmall) },
                enabled = false,
                onClick = {}
            )
        }
    }
}

@Composable
private fun Banners(state: DealUiState, viewModel: DealActions) {
    val now = rememberNowMillis()
    val badges = DealTheme.badges
    Column {
        val release = state.update.available
        val downloading = state.update.progress
        val refresh = refreshNotice(state, now)
        val stockShown = state.stockError != null && state.mode == FulfillmentMode.PICKUP && state.visibleDeals.isNotEmpty()
        val updateWaits = refresh?.kind == RefreshNotice.Kind.STALE || stockShown
        if (release != null && downloading == null && !state.update.isDialogOpen && state.update.error != null && !state.update.dismissed && !updateWaits) {
            Banner(
                icon = Icons.Default.SystemUpdate,
                text = "Update ${release.versionName} didn't download",
                detail = state.update.error,
                container = badges.amberContainer,
                content = badges.onAmberContainer,
                action = "Show",
                onAction = viewModel::openUpdate
            )
        } else if (release != null && state.update.readyToInstall && downloading == null && !state.update.isDialogOpen && !state.update.dismissed && !updateWaits) {
            Banner(
                icon = Icons.Default.SystemUpdate,
                text = "Update ${release.versionName} downloaded",
                detail = "Ready to install — your filters and saved deals stay as they are",
                container = badges.skyBlueContainer,
                content = badges.onSkyBlueContainer,
                action = "Install",
                onAction = viewModel::openUpdate
            )
        } else if (release != null && downloading != null && !state.update.isDialogOpen) {
            Banner(
                icon = Icons.Default.SystemUpdate,
                text = "Downloading update ${release.versionName}",
                detail = (if (downloading < 0f) "Downloading" else "${(downloading * 100).toInt()}%") + " — keep using the app; it installs when ready",
                container = badges.skyBlueContainer,
                content = badges.onSkyBlueContainer,
                action = "Show",
                onAction = viewModel::openUpdate
            )
        } else if (release != null && state.update.showBanner && !updateWaits) {
            Banner(
                icon = Icons.Default.SystemUpdate,
                text = "Update available: ${release.versionName}",
                detail = plainNotes(release.notes).lineSequence().firstOrNull { it.isNotBlank() }?.removePrefix("• "),
                container = badges.skyBlueContainer,
                content = badges.onSkyBlueContainer,
                action = "Update",
                onAction = viewModel::openUpdate
            )
        }
        refresh?.let { notice ->
            Banner(
                icon = when (notice.kind) {
                    RefreshNotice.Kind.OFFLINE -> Icons.Default.CloudOff
                    RefreshNotice.Kind.VERIFY -> Icons.Default.VerifiedUser
                    RefreshNotice.Kind.FAILED -> Icons.Default.ErrorOutline
                    RefreshNotice.Kind.STALE -> Icons.Default.Schedule
                },
                text = notice.title,
                detail = notice.detail,
                container = badges.amberContainer,
                content = badges.onAmberContainer,
                action = notice.action,
                onAction = viewModel::refresh
            )
        }
        // In pickup mode with nothing listed, the full-screen state explains this instead.
        val stockError = state.stockError
        val sameCheck = state.stockNeedsVerification && refresh?.kind == RefreshNotice.Kind.VERIFY
        if (stockError != null && !sameCheck && state.mode == FulfillmentMode.PICKUP && state.visibleDeals.isNotEmpty()) {
            Banner(
                icon = Icons.Default.Storefront,
                text = stockError,
                container = badges.redContainer,
                content = badges.onRedContainer,
                action = if (state.stockNeedsVerification) "Check now" else "Retry",
                onAction = viewModel::retryStock
            )
        }
    }
}

@Composable
private fun Banner(
    icon: ImageVector,
    text: String,
    container: Color,
    content: Color,
    action: String,
    onAction: () -> Unit,
    detail: String? = null
) {
    Surface(
        color = container,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 12.dp, end = 12.dp, top = 12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp)) {
            Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
                // Only the title is a live region: TalkBack announces a banner once when it appears, not the
                // "saved N minutes ago" clock or download percentage changing underneath it.
                Text(
                    text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = content,
                    fontWeight = if (detail != null) FontWeight.SemiBold else null,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
                )
                if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = content)
            }
            TextButton(onClick = onAction, modifier = Modifier.semantics { contentDescription = "$action: $text" }) {
                Text(action, color = content, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusMessage(
    icon: ImageVector,
    title: String,
    body: String,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
    fixes: List<Pair<String, () -> Unit>> = emptyList(),
    showProgress: Boolean = false,
    warning: Boolean = false
) {
    val badges = DealTheme.badges
    val circle = if (warning) badges.amberContainer else badges.skyBlueContainer
    val glyph = if (warning) badges.onAmberContainer else badges.onSkyBlueContainer
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 40.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(88.dp)
                .clip(CircleShape)
                .background(circle)
        ) {
            if (showProgress) CircularProgressIndicator(color = glyph)
            else Icon(icon, contentDescription = null, modifier = Modifier.size(40.dp), tint = glyph)
        }
        Spacer(Modifier.height(8.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(4.dp))
        primary?.let { (label, onClick) -> Button(onClick = onClick) { Text(label) } }
        secondary?.let { (label, onClick) -> OutlinedButton(onClick = onClick) { Text(label) } }
        if (fixes.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fixes.forEachIndexed { i, (label, onClick) ->
                    if (i == 0) Button(onClick = onClick) { Text(label) } else OutlinedButton(onClick = onClick) { Text(label) }
                }
            }
        }
    }
}

@Composable
private fun SkeletonCard() {
    val block = MaterialTheme.colorScheme.surfaceVariant
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .semantics { contentDescription = "Loading deal" }
    ) {
        Row(Modifier.padding(12.dp)) {
            Box(Modifier.size(88.dp).clip(RoundedCornerShape(12.dp)).background(block))
            Spacer(Modifier.width(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth(0.4f).height(10.dp).clip(RoundedCornerShape(4.dp)).background(block))
                Box(Modifier.fillMaxWidth().height(14.dp).clip(RoundedCornerShape(4.dp)).background(block))
                Box(Modifier.fillMaxWidth(0.7f).height(14.dp).clip(RoundedCornerShape(4.dp)).background(block))
                Box(Modifier.fillMaxWidth(0.35f).height(20.dp).clip(RoundedCornerShape(4.dp)).background(block))
            }
        }
    }
}
