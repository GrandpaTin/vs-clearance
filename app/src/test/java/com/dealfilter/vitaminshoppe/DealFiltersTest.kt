package com.dealfilter.vitaminshoppe

import com.dealfilter.vitaminshoppe.data.local.LocalStore
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.data.remote.FetchException
import com.dealfilter.vitaminshoppe.data.remote.JsonFetcher
import com.dealfilter.vitaminshoppe.data.remote.VsApi
import com.dealfilter.vitaminshoppe.data.repository.DealRepository
import com.dealfilter.vitaminshoppe.domain.AiPrompt
import com.dealfilter.vitaminshoppe.domain.DealFilters
import com.dealfilter.vitaminshoppe.domain.FilterCriteria
import com.dealfilter.vitaminshoppe.domain.SearchMatcher
import com.dealfilter.vitaminshoppe.ui.components.todaysHours
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealViewModel
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

class DealFiltersTest {

    private fun deal(
        id: String,
        brand: String = "Brand",
        title: String = "Product $id",
        list: Double = 20.0,
        site: Double = 10.0,
        cart: Int? = null,
        servings: Int? = null,
        category: String? = null,
        oos: Boolean = false,
        pickup: Boolean = true,
        qty: Int? = null
    ) = DealItem(
        id = id, jdaSkuId = "j$id", brand = brand, title = title, productUrl = "https://www.vitaminshoppe.com/p/$id",
        imageUrl = null, listPrice = list, sitePrice = site, cartDiscountPercent = cart, servings = servings,
        category = category, isOutOfStockOnline = oos, isPickupEligible = pickup, storeQuantity = qty
    )

    private val items = listOf(
        deal("a", brand = "Nordic Naturals", title = "Ultimate Omega-3 Fish Oil", site = 5.0, servings = 60, category = "Fish Oil"),
        deal("b", brand = "KAL", title = "Magnesium Glycinate", site = 15.0, servings = 30, category = "Magnesium"),
        deal("c", brand = "Gaia Herbs", title = "Liver Cleanse", site = 20.0, cart = 75, category = "Liver Cleanse", oos = true),
        deal("d", brand = "Café Natural", title = "Crème Protein", list = 40.0, site = 30.0, category = "Protein", pickup = false)
    )

    @Test
    fun `discount floor uses the best price including cart estimates`() {
        val result = DealFilters.apply(items, FilterCriteria(minDiscount = 75))
        assertEquals(setOf("a", "c"), result.map { it.id }.toSet())
    }

    @Test
    fun `sorts are correct and stable`() {
        fun ids(sort: SortOption) = DealFilters.apply(items, FilterCriteria(sort = sort)).map { it.id }
        // Ties (a and c are both 75% off at $5) fall back to brand order.
        assertEquals(listOf("c", "a", "b", "d"), ids(SortOption.BEST_DISCOUNT))
        assertEquals(listOf("c", "a", "b", "d"), ids(SortOption.LOWEST_PRICE))
        assertEquals(listOf("d", "b", "c", "a"), ids(SortOption.HIGHEST_PRICE))
        // Items without servings go last for cost-per-serving.
        assertEquals(listOf("a", "b", "d", "c"), ids(SortOption.LOWEST_PER_SERVING))
        assertEquals(listOf("c", "a", "d", "b"), ids(SortOption.BIGGEST_SAVINGS))
        assertEquals(listOf("d", "c", "b", "a"), ids(SortOption.BRAND_AZ))
    }

    @Test
    fun `search ignores case, punctuation and accents`() {
        fun ids(q: String) = DealFilters.apply(items, FilterCriteria(query = q)).map { it.id }.toSet()
        assertEquals(setOf("a"), ids("omega 3"))
        assertEquals(setOf("a"), ids("OMEGA-3"))
        assertEquals(setOf("a"), ids("omega3"))
        assertEquals(setOf("a"), ids("fishoil"))
        assertEquals(setOf("d"), ids("creme"))
        assertEquals(setOf("d"), ids("cafe"))
        assertEquals(setOf("b"), ids("kal magnesium"))
        assertEquals(emptySet<String>(), ids("zinc"))
        assertEquals(items.map { it.id }.toSet(), ids("   "))
        assertEquals("cafe creme", SearchMatcher.normalize("Café — Crème!"))
    }

    @Test
    fun `ship mode in-stock toggle hides only online out-of-stock items`() {
        assertEquals(3, DealFilters.apply(items, FilterCriteria(inStockOnly = true)).size)
        assertEquals(4, DealFilters.apply(items, FilterCriteria(inStockOnly = false)).size)
    }

    @Test
    fun `pickup mode shows only items on the shelf at the store`() {
        val stocked = listOf(
            deal("x", qty = 3), deal("y", qty = 0), deal("z", qty = null), deal("w", qty = 5, pickup = false)
        )
        val result = DealFilters.apply(stocked, FilterCriteria(mode = FulfillmentMode.PICKUP))
        assertEquals(listOf("x"), result.map { it.id })
    }

    @Test
    fun `category filter and top categories`() {
        assertEquals(listOf("b"), DealFilters.apply(items, FilterCriteria(category = "magnesium")).map { it.id })
        val many = items + deal("e", category = "Magnesium")
        assertEquals("Magnesium", DealFilters.topCategories(many).first())
    }

    @Test
    fun `price math edge cases`() {
        assertEquals(0, DealItem.percentOff(0.0, 5.0))
        assertEquals(0, DealItem.percentOff(10.0, 12.0))
        assertEquals(50, DealItem.percentOff(10.0, 5.0))
        // A cart percentage that wouldn't lower the price is ignored.
        assertNull(deal("q", list = 20.0, site = 4.0, cart = 50).estimatedCartPrice)
        // Out-of-range percentages are ignored.
        assertNull(deal("r", cart = 100).estimatedCartPrice)
        assertEquals("$1.25/serving", deal("s", site = 12.5, servings = 10).formattedPricePerServing)
        assertNull(deal("t", servings = 0).pricePerServing)
    }

    @Test
    fun `ai prompt lists real prices, links and a truncation note`() {
        val many = (1..50).map { deal("p$it", site = 5.0, servings = 10) }
        val store = StoreLocation("702", "Tampa, FL", "102 N Dale Mabry Hwy", "", "Tampa", "FL", "33609")
        val text = AiPrompt.build(many, many.size, store, FulfillmentMode.PICKUP)
        assertTrue(text.contains("top 35 of 50"))
        assertTrue(text.contains("for in-store pickup at The Vitamin Shoppe, Tampa, FL"))
        assertTrue(text.contains("https://www.vitaminshoppe.com/p/p1"))
        assertFalse(text.contains("p36"))
        val cartText = AiPrompt.build(listOf(items[2]), 1, null, FulfillmentMode.SHIP)
        assertTrue(cartText.contains("≈\$5.00 in cart"))
        assertTrue(cartText.contains("estimates"))
    }

    @Test
    fun `changes since the last load find new items and real price drops only`() {
        val before = listOf(deal("a", site = 10.0), deal("b", site = 8.0), deal("c", site = 5.0))
        val after = listOf(deal("a", site = 9.0), deal("b", site = 8.004), deal("c", site = 6.0), deal("d"))
        val changes = DealFilters.changes(before, after)
        assertEquals(setOf("d"), changes.newIds)
        assertEquals(mapOf("a" to 10.0), changes.priceDrops)
        assertEquals(2, changes.count)
        // First ever load: nothing is "new".
        assertTrue(DealFilters.changes(emptyList(), after).isEmpty)
        // A one-cent drop is a drop despite floating-point (10.00 - 9.99 = 0.00999...).
        assertEquals(setOf("a"), DealFilters.changes(listOf(deal("a", site = 10.0)), listOf(deal("a", site = 9.99))).priceDrops.keys)
        // A glitchy short previous load must not flag most of the list as new.
        val prev20 = (1..20).map { deal("p$it") }
        assertTrue(DealFilters.changes(prev20, prev20 + (1..30).map { deal("n$it") }).isEmpty)
        // ...but small lists can genuinely gain mostly-new items.
        assertEquals(3, DealFilters.changes(listOf(deal("a")), listOf(deal("a"), deal("b"), deal("c"), deal("d"))).newIds.size)
        // Carried markers: a drop whose price went back up is removed; vanished items too.
        val pruned = DealFilters.prune(changes, listOf(deal("a", site = 12.0), deal("b"), deal("c")))
        assertTrue(pruned.priceDrops.isEmpty())
        assertTrue(pruned.newIds.isEmpty())
        // The chip restricts the list to exactly those SKUs.
        val only = DealFilters.apply(after, FilterCriteria(onlyIds = changes.newIds + changes.priceDrops.keys))
        assertEquals(setOf("a", "d"), only.map { it.id }.toSet())
    }

    @Test
    fun `pack size comes from the trailing parenthesis of the site name`() {
        assertEquals("60 Vegetarian Capsules", deal("x", title = "Fadogia – Men’s Health Support (60 Vegetarian Capsules)").sizeLabel)
        assertEquals("1.07 Lbs./30 Servings", deal("y", title = "Ultimate Creatine 3X - Fruit Punch (1.07 Lbs./30 Servings)").sizeLabel)
        assertNull(deal("z", title = "Liver Cleanse (Vegan)").sizeLabel)
        assertNull(deal("w", title = "No size here").sizeLabel)
    }

    @Test
    fun `pack size pills are abbreviated`() {
        assertEquals("60 veg caps", com.dealfilter.vitaminshoppe.ui.components.shortSize("60 Vegetarian Capsules"))
        assertEquals("90 caps", com.dealfilter.vitaminshoppe.ui.components.shortSize("90 Capsules"))
        assertEquals("1.07 Lbs./30 servings", com.dealfilter.vitaminshoppe.ui.components.shortSize("1.07 Lbs./30 Servings"))
    }

    @Test
    fun `store query validation`() {
        assertEquals("Enter a ZIP code or city to find stores.", DealViewModel.validateStoreQuery(""))
        assertEquals("ZIP codes have 5 digits.", DealViewModel.validateStoreQuery("3370"))
        assertNull(DealViewModel.validateStoreQuery("33701"))
        assertNull(DealViewModel.validateStoreQuery("Tampa, FL"))
        assertEquals("Enter at least 3 characters.", DealViewModel.validateStoreQuery("NY"))
    }

    @Test
    fun `todays hours picks the matching range`() {
        val hours = listOf("Sunday: 9 AM – 7 PM", "Monday - Friday: 9:30 AM – 8:30 PM", "Saturday: 9 AM – 8 PM")
        fun on(day: Int) = todaysHours(hours, Calendar.getInstance().apply { set(Calendar.DAY_OF_WEEK, day) })
        assertEquals("Today: 9 AM – 7 PM", on(Calendar.SUNDAY))
        assertEquals("Today: 9:30 AM – 8:30 PM", on(Calendar.WEDNESDAY))
        assertEquals("Today: 9 AM – 8 PM", on(Calendar.SATURDAY))
        assertNull(todaysHours(emptyList()))
    }

    @Test
    fun `cache round trip preserves every field`() {
        val d = items[2].copy(autoDeliveryPrice = 18.0, servings = 60, servingSize = "1 Capsule", form = "Capsules", variantMessage = "2 Sizes", rating = 4.5, reviewCount = 12)
        assertEquals(d, LocalStore.dealFromJson(LocalStore.dealToJson(d)))
        val s = StoreLocation("743", "St. Petersburg, FL", "2700 4th St N", "", "St. Petersburg", "FL", "33704", "(727) 822-8102", 1.9, listOf("Sunday: 9 AM – 7 PM"))
        assertEquals(s, LocalStore.storeFromJson(LocalStore.storeToJson(s)))
    }

    // --- Repository paging & batching against a fake fetcher -----------------------------------

    private class FakeFetcher(private val responses: (String) -> String) : JsonFetcher {
        val calls = mutableListOf<String>()
        override suspend fun getJson(url: String): String {
            calls += url
            return responses(url)
        }
    }

    private fun pageJson(ids: List<String>, totalPages: Int) = """
        {"response":{"numProducts":${ids.size * totalPages},"pagination":{"totalPages":$totalPages},
        "products":[${ids.joinToString(",") { """{"type":"Product","skuId":"$it","jdaSkuId":"${it}j","brand":"B","displayName":"$it","pdpUrl":"/p/$it","price":{"listPrice":10,"activePrice":5}}""" }}]}}
    """.trimIndent()

    @Test
    fun `repository loads every page and de-duplicates overlap`() = runTest {
        val fetcher = FakeFetcher { url ->
            when {
                url.contains("pageno=1") -> pageJson(listOf("A", "B"), 3)
                url.contains("pageno=2") -> pageJson(listOf("B", "C"), 3)
                else -> pageJson(listOf("D"), 3)
            }
        }
        val result = DealRepository(fetcher).fetchClearance()
        assertEquals(listOf("A", "B", "C", "D"), result.map { it.id })
        assertEquals(3, fetcher.calls.size)
    }

    @Test
    fun `repository batches inventory by 100 skus`() = runTest {
        val many = (1..250).map { deal("i$it") }
        val fetcher = FakeFetcher { url ->
            val skus = url.substringAfter("skuIds=").substringBefore("&").split(",")
            """{"skuInventory":[${skus.joinToString(",") { """{"skuId":"$it","quantity":"2","service":"available"}""" }}]}"""
        }
        val stock = DealRepository(fetcher).fetchStoreStock("702", many)
        assertEquals(3, fetcher.calls.size)
        assertEquals(250, stock.size)
        assertEquals(2, stock["ji1"])
    }

    @Test(expected = FetchException.Offline::class)
    fun `repository propagates fetch failures instead of inventing data`() = runTest {
        DealRepository(object : JsonFetcher {
            override suspend fun getJson(url: String): String = throw FetchException.Offline()
        }).fetchClearance()
    }

    @Test
    fun `page count is capped`() = runTest {
        val fetcher = FakeFetcher { pageJson(listOf("X${it.hashCode()}"), 999) }
        DealRepository(fetcher).fetchClearance()
        assertEquals(VsApi.MAX_PAGES, fetcher.calls.size)
    }
}
