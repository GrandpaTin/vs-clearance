package com.dealfilter.vitaminshoppe

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.junit4.createComposeRule
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.ui.screens.DealScreenContent
import com.dealfilter.vitaminshoppe.ui.theme.VitaminShoppeDealsTheme
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealActions
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealUiState
import com.dealfilter.vitaminshoppe.ui.viewmodel.LoadStatus
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PullProbeTest {
    @get:Rule
    val compose = createComposeRule()

    var refreshes = 0

    private val actions = object : DealActions {
        override fun refresh() { refreshes++ }
        override fun retryStock() = Unit
        override fun onQueryChange(query: String) = Unit
        override fun onCategoryToggle(category: String) = Unit
        override fun onDiscountFloor(floor: DiscountFloor) = Unit
        override fun onSort(sort: SortOption) = Unit
        override fun onInStockOnly(enabled: Boolean) = Unit
        override fun clearFilters() = Unit
        override fun onOnlyChanges(enabled: Boolean) = Unit
        override fun clearSearch() = Unit
        override fun clearCategory() = Unit
        override fun onModeChange(mode: FulfillmentMode) = Unit
        override fun openStoreSheet() = Unit
        override fun closeStoreSheet() = Unit
        override fun onStoreQueryChange(query: String) = Unit
        override fun searchStores() = Unit
        override fun selectStore(store: StoreLocation) = Unit
        override fun clearStore() = Unit
        override fun openPrompt() = Unit
        override fun closePrompt() = Unit
        override fun copyPrompt(context: Context) = Unit
        override fun sharePrompt(context: Context) = Unit
        override fun openWebShare() = Unit
        override fun checkForUpdates() = Unit
        override fun openUpdate() = Unit
        override fun showMessage(text: String) = Unit
        override fun clearMessage() = Unit
    }

    @Test
    fun autoRefreshEndingDoesNotCallUserRefresh() {
        val item = DealItem(id = "1", jdaSkuId = "j1", brand = "B", title = "T", productUrl = "https://x", imageUrl = null,
            listPrice = 10.0, sitePrice = 5.0)
        val base = DealUiState(allDeals = listOf(item), visibleDeals = listOf(item), status = LoadStatus.IDLE, lastUpdatedMillis = System.currentTimeMillis())
        val s = mutableStateOf(base)
        compose.setContent { VitaminShoppeDealsTheme { DealScreenContent(s.value, actions) } }
        compose.waitForIdle()
        s.value = base.copy(status = LoadStatus.REFRESHING)
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(1000)
        s.value = base.copy(status = LoadStatus.IDLE, loadError = "Vitamin Shoppe took too long", needsVerification = false)
        compose.waitForIdle()
        compose.mainClock.advanceTimeBy(1000)
        compose.waitForIdle()
        assertEquals("refresh() calls from an automatic refresh ending", 0, refreshes)
    }
}
