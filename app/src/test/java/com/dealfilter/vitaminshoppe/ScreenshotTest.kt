package com.dealfilter.vitaminshoppe

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.unit.dp
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.data.remote.VsApi
import com.dealfilter.vitaminshoppe.domain.AiPrompt
import com.dealfilter.vitaminshoppe.domain.DealFilters
import com.dealfilter.vitaminshoppe.ui.screens.DealScreenContent
import com.dealfilter.vitaminshoppe.ui.theme.VitaminShoppeDealsTheme
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealActions
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealUiState
import com.dealfilter.vitaminshoppe.ui.viewmodel.LoadStatus
import com.dealfilter.vitaminshoppe.ui.viewmodel.StoreSheetState
import com.github.takahirom.roborazzi.ExperimentalRoborazziApi
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders the real screens with real (captured) clearance data as PNGs in app/build/screenshots.
 * Run: gradlew testOwnerDebugUnitTest --tests "*ScreenshotTest*"
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
@OptIn(ExperimentalRoborazziApi::class)
class ScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    private val out = "build/screenshots"

    @Before
    fun synchronousImages() {
        // Decode images inline so they are on screen when the frame is captured.
        val context = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        coil.Coil.setImageLoader(
            coil.ImageLoader.Builder(context)
                .dispatcher(kotlinx.coroutines.Dispatchers.Unconfined)
                .crossfade(false)
                .build()
        )
    }

    private object NoActions : DealActions {
        override fun refresh() = Unit
        override fun onQueryChange(query: String) = Unit
        override fun onCategoryToggle(category: String) = Unit
        override fun onDiscountFloor(floor: DiscountFloor) = Unit
        override fun onSort(sort: SortOption) = Unit
        override fun onInStockOnly(enabled: Boolean) = Unit
        override fun clearFilters() = Unit
        override fun clearSearch() = Unit
        override fun clearCategory() = Unit
        override fun onOnlyChanges(enabled: Boolean) = Unit
        override fun onModeChange(mode: FulfillmentMode) = Unit
        override fun openStoreSheet() = Unit
        override fun closeStoreSheet() = Unit
        override fun onStoreQueryChange(query: String) = Unit
        override fun searchStores() = Unit
        override fun selectStore(store: StoreLocation) = Unit
        override fun clearStore() = Unit
        override fun retryStock() = Unit
        override fun openWebShare() = Unit
        override fun openPrompt() = Unit
        override fun closePrompt() = Unit
        override fun copyPrompt(context: Context) = Unit
        override fun sharePrompt(context: Context) = Unit
        override fun showMessage(text: String) = Unit
        override fun clearMessage() = Unit
    }

    private fun fixture(name: String) = requireNotNull(javaClass.classLoader?.getResource(name)).readText()

    private val deals: List<DealItem> by lazy {
        VsApi.dedupe(VsApi.parseClearancePage(fixture("clearance_page.json")).items)
            .filter { !it.id.startsWith("ABS") }
            // Real product photos captured from the site's image CDN, served from test resources.
            .map { d -> d.copy(imageUrl = d.jdaSkuId?.let { javaClass.classLoader?.getResource("images/img_$it.png")?.toURI()?.toString() }) }
    }
    private val stores by lazy { VsApi.parseStores(fixture("stores_33701.json")).stores }

    private fun state(
        items: List<DealItem> = deals,
        floor: DiscountFloor = DiscountFloor.ANY,
        mode: FulfillmentMode = FulfillmentMode.SHIP,
        store: StoreLocation? = null,
        query: String = ""
    ): DealUiState {
        val base = DealUiState(
            allDeals = items, discountFloor = floor, mode = mode, selectedStore = store, query = query,
            inStockOnly = true, status = LoadStatus.IDLE, lastUpdatedMillis = System.currentTimeMillis() - 4 * 60_000
        )
        return base.copy(visibleDeals = DealFilters.apply(items, base.criteria), categories = DealFilters.topCategories(items))
    }

    private fun shot(name: String, dark: Boolean = false, s: DealUiState) {
        compose.setContent {
            VitaminShoppeDealsTheme(darkTheme = dark) { DealScreenContent(s, NoActions) }
        }
        compose.onRoot().captureRoboImage("$out/$name.png")
    }

    private fun screenShot(name: String, dark: Boolean = false, s: DealUiState) {
        compose.setContent {
            VitaminShoppeDealsTheme(darkTheme = dark) { DealScreenContent(s, NoActions) }
        }
        compose.waitForIdle()
        captureScreenRoboImage("$out/$name.png")
    }

    @Test fun list_light() = shot("01_list_light", s = state())

    @Test fun list_dark() = shot("02_list_dark", dark = true, s = state())

    @Test fun pickup_with_stock() {
        val qty = listOf(4, 6, 0, 2, 0, 1)
        val stocked = deals.mapIndexed { i, d -> d.copy(storeQuantity = qty[i % qty.size]) }
        shot("03_pickup_stock", s = state(stocked, mode = FulfillmentMode.PICKUP, store = stores[0]))
    }

    @Test fun loading() = shot("04_loading", s = DealUiState(status = LoadStatus.LOADING))

    @Test fun offline_no_cache() =
        shot("05_offline", s = DealUiState(status = LoadStatus.IDLE, loadError = "Connect to the internet and try again.", loadErrorIsOffline = true))

    @Test fun empty_search() = shot("06_empty_search", s = state(query = "zinc"))

    @Test fun pickup_needs_store() = shot("07_needs_store", s = state(mode = FulfillmentMode.PICKUP))

    @Test fun store_sheet() = screenShot(
        "08_store_sheet",
        s = state(store = stores[0]).copy(storeSheet = StoreSheetState(query = "33701", results = stores, hasSearched = true))
    )

    @Test fun prompt_sheet() {
        val s = state()
        screenShot("09_prompt_sheet", s = s.copy(promptText = AiPrompt.build(s.visibleDeals, s.visibleDeals.size, null, FulfillmentMode.SHIP)))
    }

    @Test fun stale_banner_dark() = shot(
        "10_refresh_failed_dark", dark = true,
        s = state().copy(loadError = "Couldn't reach vitaminshoppe.com.", isShowingSavedData = true)
    )

    @Test
    @Config(qualifiers = "w360dp-h780dp-xxhdpi", fontScale = 1.5f)
    fun large_font_small_phone() = shot("11_font150_360dp", s = state(floor = DiscountFloor.P50).copy(category = "Powder"))

    @Test
    @Config(qualifiers = "w360dp-h780dp-xxhdpi", fontScale = 1.5f)
    fun large_font_pickup() {
        val stocked = deals.mapIndexed { i, d -> d.copy(storeQuantity = if (i % 2 == 0) 3 else 0) }
        shot("12_font150_pickup", s = state(stocked, mode = FulfillmentMode.PICKUP, store = stores[0]))
    }

    @Test fun pickup_stock_failed() = shot(
        "13_pickup_stock_failed",
        s = state(mode = FulfillmentMode.PICKUP, store = stores[0]).copy(stockError = "Couldn't check stock at St. Petersburg, FL.")
    )

    @Test fun new_and_price_drops() {
        val s = state()
        shot(
            "14_new_and_drops",
            s = s.copy(changes = com.dealfilter.vitaminshoppe.domain.ListChanges(setOf(s.visibleDeals[1].id), mapOf(s.visibleDeals[0].id to 5.99)))
        )
    }

    @Test
    @Config(qualifiers = "w360dp-h780dp-xxhdpi")
    fun narrow_phone_filtered() = shot("15_360dp_filtered", s = state(floor = DiscountFloor.P50).copy(query = "s"))

    @Test fun scrolled_best_value() {
        val s = state().let { it.copy(sort = SortOption.LOWEST_PER_SERVING, visibleDeals = DealFilters.apply(it.allDeals, it.criteria.copy(sort = SortOption.LOWEST_PER_SERVING))) }
        compose.setContent { VitaminShoppeDealsTheme { DealScreenContent(s, NoActions) } }
        compose.onNode(androidx.compose.ui.test.hasScrollToIndexAction()).performScrollToIndex(4)
        compose.onRoot().captureRoboImage("$out/16_scrolled_best_value.png")
    }

    @Test fun launcher_icon() {
        compose.setContent {
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                modifier = Modifier
                    .background(Color(0xFFE8EAED))
                    .padding(24.dp)
            ) {
                Icon(Modifier.clip(CircleShape))
                Icon(Modifier.clip(RoundedCornerShape(28.dp)))
                Icon(Modifier.clip(RoundedCornerShape(12.dp)), size = 48)
            }
        }
        compose.onRoot().captureRoboImage("$out/00_launcher_icon.png")
    }

    @Composable
    private fun Icon(shape: Modifier, size: Int = 144) {
        // Adaptive icons show the middle 72/108 of each layer.
        Box(Modifier.requiredSize(size.dp).then(shape), contentAlignment = Alignment.Center) {
            listOf(R.drawable.ic_launcher_background, R.drawable.ic_launcher_foreground).forEach { res ->
                Image(
                    painterResource(res), contentDescription = null,
                    modifier = Modifier.requiredSize((size * 108 / 72).dp)
                )
            }
        }
    }
}
