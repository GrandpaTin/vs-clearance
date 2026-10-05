package com.dealfilter.vitaminshoppe.ui.screens

import android.text.format.DateUtils
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
            onDismiss = viewModel::closeWebShare
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
        scope.launch { snackbar.showSnackbar(text) }
    }

    // Pull-to-refresh <-> view model loading state.
    if (pullState.isRefreshing) {
        LaunchedEffect(Unit) {
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
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                modifier = Modifier.semantics { heading() }
                            )
                            HeaderSubtitle(state)
                        }
                    },
                    actions = {
                        IconButton(onClick = viewModel::openWebShare) {
                            Icon(
                                if (state.webShare.enabled) Icons.Default.CloudDone else Icons.Default.CloudUpload,
                                contentDescription = if (state.webShare.enabled) "Share to web (on)" else "Share to web",
                                tint = Color.White
                            )
                        }
                        IconButton(onClick = viewModel::refresh, enabled = state.status == LoadStatus.IDLE) {
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
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(bottom = 96.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                item(key = "banner") { Banners(state, viewModel) }
                item(key = "mode") {
                    ModeAndStoreRow(
                        mode = state.mode,
                        store = state.selectedStore,
                        onModeChange = viewModel::onModeChange,
                        onOpenStores = viewModel::openStoreSheet,
                        modifier = Modifier.padding(top = 12.dp, bottom = 8.dp)
                    )
                }
                val stockBlocked = state.mode == FulfillmentMode.PICKUP && state.visibleDeals.isEmpty() &&
                    (state.isStockLoading || state.stockError != null)
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
                            changeCount = state.changes.count,
                            onlyChanges = state.onlyChanges,
                            onOnlyChanges = viewModel::onOnlyChanges
                        )
                    }
                    stickyHeader(key = "summary") {
                        Surface(color = MaterialTheme.colorScheme.background) {
                            SummaryRow(
                                shown = state.visibleDeals.size,
                                total = state.allDeals.size,
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
                    state.mode == FulfillmentMode.PICKUP && state.isStockLoading && state.visibleDeals.isEmpty() -> item(key = "checking") {
                        StatusMessage(
                            icon = Icons.Default.Storefront,
                            title = "Checking shelves…",
                            body = "Looking up stock at ${state.selectedStore?.name ?: "your store"}.",
                            showProgress = true
                        )
                    }
                    state.mode == FulfillmentMode.PICKUP && state.stockError != null && state.visibleDeals.isEmpty() -> item(key = "stockFailed") {
                        StatusMessage(
                            icon = Icons.Default.ErrorOutline,
                            warning = true,
                            title = "Couldn't check shelves at ${state.selectedStore?.name ?: "your store"}",
                            body = "Shelf stock didn't load. You can try again, or browse ship-to-home deals meanwhile.",
                            primary = "Try again" to viewModel::retryStock,
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

/** banner, mode, discount, categories — the summary header is the next item. */
private const val HEADER_ITEMS = 4

private fun clearDescription(state: DealUiState): String {
    val parts = listOfNotNull(
        "search".takeIf { state.query.isNotBlank() },
        "category".takeIf { state.category != null },
        "discount".takeIf { state.discountFloor != DiscountFloor.ANY }
    )
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
        "in stock online".takeIf { state.mode == FulfillmentMode.SHIP && state.inStockOnly }
    )
    val body = if (reasons.isEmpty()) "Nothing on clearance$atStore right now. Pull down to refresh."
    else "Nothing on clearance$atStore ${reasons.joinToString(", ")}."
    val onlyStockFilter = state.query.isBlank() && state.category == null && state.discountFloor == DiscountFloor.ANY
    val fixes = listOfNotNull(
        state.query.takeIf { it.isNotBlank() }?.let { "Clear search" to viewModel::clearSearch },
        state.category?.let { "All categories" to viewModel::clearCategory },
        state.discountFloor.takeIf { it != DiscountFloor.ANY }?.let { "Any discount" to { viewModel.onDiscountFloor(DiscountFloor.ANY) } },
        ("Include out of stock" to { viewModel.onInStockOnly(false) })
            .takeIf { state.mode == FulfillmentMode.SHIP && state.inStockOnly && onlyStockFilter },
        ("Show ship-to-home" to { viewModel.onModeChange(FulfillmentMode.SHIP) }).takeIf { state.mode == FulfillmentMode.PICKUP }
    )
    StatusMessage(icon = Icons.Default.SearchOff, title = "No matching deals", body = body, fixes = fixes)
}

@Composable
private fun HeaderSubtitle(state: DealUiState) {
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            delay(30_000)
            value = System.currentTimeMillis()
        }
    }
    val updated = state.lastUpdatedMillis?.let {
        if (now - it < DateUtils.MINUTE_IN_MILLIS) "just now"
        else DateUtils.getRelativeTimeSpanString(it, now, DateUtils.MINUTE_IN_MILLIS).toString()
    }
    val text = when {
        state.status == LoadStatus.LOADING -> "Loading live prices…"
        state.status == LoadStatus.REFRESHING -> "Refreshing…"
        state.isShowingSavedData && updated != null -> "Saved $updated"
        updated != null && state.changes.count > 0 -> "Updated $updated · ${state.changes.count} new or cheaper"
        updated != null -> "Updated $updated"
        else -> "Live from vitaminshoppe.com"
    }
    Text(text, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.85f))
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
            .semantics { contentDescription = "Search deals" }
    )
}

@Composable
private fun Banners(state: DealUiState, viewModel: DealActions) {
    val badges = DealTheme.badges
    Column {
        if (state.hasData && state.loadError != null) {
            Banner(
                icon = if (state.loadErrorIsOffline) Icons.Default.CloudOff else Icons.Default.ErrorOutline,
                text = (if (state.loadErrorIsOffline) "Offline" else "Couldn't refresh") + " · showing saved deals",
                container = badges.amberContainer,
                content = badges.onAmberContainer,
                action = "Retry",
                onAction = viewModel::refresh
            )
        }
        // In pickup mode with nothing listed, the full-screen state explains this instead.
        val stockError = state.stockError
        if (stockError != null && !(state.mode == FulfillmentMode.PICKUP && state.visibleDeals.isEmpty())) {
            Banner(
                icon = Icons.Default.Storefront,
                text = stockError,
                container = badges.redContainer,
                content = badges.onRedContainer,
                action = "Retry",
                onAction = viewModel::retryStock
            )
        }
    }
}

@Composable
private fun Banner(icon: ImageVector, text: String, container: Color, content: Color, action: String, onAction: () -> Unit) {
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
            Text(text, style = MaterialTheme.typography.bodyMedium, color = content, modifier = Modifier.weight(1f))
            TextButton(onClick = onAction) { Text(action, color = content, fontWeight = FontWeight.Bold) }
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
