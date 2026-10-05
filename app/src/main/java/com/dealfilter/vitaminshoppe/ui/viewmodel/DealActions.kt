package com.dealfilter.vitaminshoppe.ui.viewmodel

import android.content.Context
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation

/** Everything the deal screen can ask for. Implemented by [DealViewModel]; faked in previews and screenshot tests. */
interface DealActions {
    fun refresh()
    fun onQueryChange(query: String)
    fun onCategoryToggle(category: String)
    fun onDiscountFloor(floor: DiscountFloor)
    fun onSort(sort: SortOption)
    fun onInStockOnly(enabled: Boolean)
    fun clearFilters()
    fun clearSearch()
    fun clearCategory()
    fun onOnlyChanges(enabled: Boolean)
    fun onModeChange(mode: FulfillmentMode)
    fun openStoreSheet()
    fun closeStoreSheet()
    fun onStoreQueryChange(query: String)
    fun searchStores()
    fun selectStore(store: StoreLocation)
    fun clearStore()
    fun retryStock()
    fun openWebShare()
    fun openPrompt()
    fun closePrompt()
    fun copyPrompt(context: Context)
    fun sharePrompt(context: Context)
    fun showMessage(text: String)
    fun clearMessage()
}
