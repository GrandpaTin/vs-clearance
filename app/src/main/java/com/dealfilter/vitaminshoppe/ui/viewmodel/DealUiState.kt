package com.dealfilter.vitaminshoppe.ui.viewmodel

import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.domain.FilterCriteria

enum class LoadStatus { IDLE, LOADING, REFRESHING }

data class StoreSheetState(
    val query: String = "",
    val results: List<StoreLocation> = emptyList(),
    val isSearching: Boolean = false,
    val hasSearched: Boolean = false,
    val message: String? = null
)

data class DealUiState(
    val allDeals: List<DealItem> = emptyList(),
    val visibleDeals: List<DealItem> = emptyList(),
    val categories: List<String> = emptyList(),
    val query: String = "",
    val category: String? = null,
    val discountFloor: DiscountFloor = DiscountFloor.ANY,
    val sort: SortOption = SortOption.BEST_DISCOUNT,
    val inStockOnly: Boolean = true,
    val mode: FulfillmentMode = FulfillmentMode.SHIP,
    val selectedStore: StoreLocation? = null,
    // Starts as LOADING so nothing claims "no deals" before the saved state is restored.
    val status: LoadStatus = LoadStatus.LOADING,
    val loadError: String? = null,
    val loadErrorIsOffline: Boolean = false,
    val lastUpdatedMillis: Long? = null,
    val isShowingSavedData: Boolean = false,
    val isStockLoading: Boolean = false,
    val stockError: String? = null,
    val storeSheet: StoreSheetState? = null,
    /** What changed at the last refresh that actually changed something. */
    val changes: com.dealfilter.vitaminshoppe.domain.ListChanges = com.dealfilter.vitaminshoppe.domain.ListChanges(emptySet(), emptyMap()),
    val onlyChanges: Boolean = false,
    val promptText: String? = null,
    val isVerificationVisible: Boolean = false,
    val webShare: com.dealfilter.vitaminshoppe.data.remote.WebShareState = com.dealfilter.vitaminshoppe.data.remote.WebShareState(),
    val isWebShareOpen: Boolean = false,
    val message: String? = null
) {
    val criteria: FilterCriteria
        get() = FilterCriteria(
            query, category, discountFloor.minPercent, inStockOnly, mode, sort,
            onlyIds = if (onlyChanges) changes.newIds + changes.priceDrops.keys else null
        )

    val hasData: Boolean get() = allDeals.isNotEmpty()

    /** Pickup was chosen but there's nothing to check stock against yet. */
    val needsStoreForPickup: Boolean get() = mode == FulfillmentMode.PICKUP && selectedStore == null

    val hasActiveFilters: Boolean
        get() = query.isNotBlank() || category != null || discountFloor != DiscountFloor.ANY || onlyChanges

    val promptItemCount: Int get() = minOf(visibleDeals.size, com.dealfilter.vitaminshoppe.domain.AiPrompt.MAX_ITEMS)
}
