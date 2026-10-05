package com.dealfilter.vitaminshoppe

import com.dealfilter.vitaminshoppe.data.remote.FetchException
import com.dealfilter.vitaminshoppe.data.remote.VsApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Parsers exercised against responses captured from vitaminshoppe.com (October 2026). */
class VsApiTest {

    private fun fixture(name: String): String =
        requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

    private val page by lazy { VsApi.parseClearancePage(fixture("clearance_page.json")) }
    private fun item(id: String) = page.items.first { it.id == id }

    @Test
    fun `listing keeps real products and drops promo tiles, duplicates and priceless rows`() {
        val ids = page.items.map { it.id }
        assertEquals(listOf("VS-5249", "VS-8540", "TM-16942", "GH-1003", "KA-15248", "NW-2414", "VS-5249", "ABS-1"), ids)
        assertEquals(7, VsApi.dedupe(page.items).size)
        assertEquals(2, page.totalPages)
        assertEquals(375, page.totalProducts)
    }

    @Test
    fun `regular clearance item maps price, link and details exactly`() {
        val d = item("VS-5249")
        assertEquals("plnt", d.brand)
        assertEquals(24.97, d.listPrice, 0.001)
        assertEquals(6.24, d.sitePrice, 0.001)
        assertEquals(6.24, d.bestPrice, 0.001)
        assertEquals(75, d.discountPercent)
        assertFalse(d.hasCartOnlyPrice)
        assertEquals("https://www.vitaminshoppe.com/p/plnt-fadogia-agrestis-60-vegetarian-capsules/vs-5249", d.productUrl)
        assertEquals("2307262", d.jdaSkuId)
        assertEquals(60, d.servings)
        assertEquals("Vegetarian Capsules", d.form)
        assertEquals(5.30, d.autoDeliveryDeal!!, 0.001)
        assertEquals("10¢/serving", d.formattedPricePerServing)
    }

    @Test
    fun `see sale price in cart items are estimated from list price, not shown at full price`() {
        // Page shows the full $34.97; the site says 75% off is applied in the cart.
        val d = item("GH-1003")
        assertEquals(34.97, d.sitePrice, 0.001)
        assertEquals(75, d.cartDiscountPercent)
        assertTrue(d.hasCartOnlyPrice)
        assertEquals(8.74, d.bestPrice, 0.001)
        assertEquals(75, d.discountPercent)
        assertEquals(0, d.sitePercentOff)
    }

    @Test
    fun `cart estimate is only used when it beats the page price`() {
        val partial = item("TM-16942") // already 20% off on the page, "50% off in cart"
        assertEquals(26.39, partial.sitePrice, 0.001)
        assertEquals(16.49, partial.bestPrice, 0.001)
        assertEquals(50, partial.discountPercent)

        val noCart = item("VS-8540")
        assertNull(noCart.cartDiscountPercent)
        assertEquals(37.47, noCart.bestPrice, 0.001)
        assertEquals(25, noCart.discountPercent)
    }

    @Test
    fun `availability flags come from the listing`() {
        assertFalse(item("NW-2414").isPickupEligible)
        assertTrue(item("VS-5249").isPickupEligible)
        val abs = item("ABS-1")
        assertTrue(abs.isOutOfStockOnline)
        assertEquals("https://www.vitaminshoppe.com/p/absolute-url/abs-1", abs.productUrl)
        assertNull(abs.imageUrl)
    }

    @Test
    fun `cart discount descriptor parsing`() {
        assertEquals(75, VsApi.parseCartDiscount("75% Off - See Sale Price In Cart"))
        assertEquals(25, VsApi.parseCartDiscount("25% off - see sale price in cart"))
        assertNull(VsApi.parseCartDiscount("Clearance!"))
        assertNull(VsApi.parseCartDiscount("Auto Delivery Save 15%"))
        assertNull(VsApi.parseCartDiscount(null))
    }

    @Test
    fun `store search parses distance, address, hours and pickup state`() {
        val result = VsApi.parseStores(fixture("stores_33701.json"))
        assertEquals(VsApi.StoreSearchStatus.FOUND, result.status)
        assertEquals(listOf("743", "144", "727"), result.stores.map { it.storeId })
        val first = result.stores[0]
        assertEquals("St. Petersburg, FL", first.name)
        assertEquals("2700 4th Street North", first.streetLine)
        assertEquals("St. Petersburg, FL 33704", first.cityLine)
        assertEquals("1.9 mi", first.formattedDistance)
        assertEquals("Sunday: 9 AM – 7 PM", first.hours[0])
        assertEquals("Monday - Friday: 9:30 AM – 8:30 PM", first.hours[1])
        assertTrue(first.isSelectable)
        assertEquals("2301 Tyrone Blvd, Suite 4", result.stores[1].streetLine)
        val closed = result.stores[2]
        assertTrue(closed.temporarilyClosed)
        assertFalse(closed.isSelectable)
    }

    @Test
    fun `store search distinguishes no stores from an unrecognised location`() {
        assertEquals(VsApi.StoreSearchStatus.NONE_NEARBY, VsApi.parseStores(fixture("stores_empty.json")).status)
        assertEquals(VsApi.StoreSearchStatus.UNRECOGNIZED_LOCATION, VsApi.parseStores(fixture("stores_bad_input.json")).status)
    }

    @Test
    fun `inventory maps numeric quantities and treats na as zero`() {
        val stock = VsApi.parseInventory(fixture("inventory_702.json"))
        assertEquals(4, stock["2307262"])
        assertEquals(6, stock["2711133"])
        assertEquals(0, stock["1954221"])
        assertEquals(0, stock["2688018"])
    }

    @Test
    fun `datadome block is recognised`() {
        assertTrue(VsApi.isVerificationResponse(403, fixture("captcha_403.json")))
        assertFalse(VsApi.isVerificationResponse(200, fixture("captcha_403.json")))
        assertFalse(VsApi.isVerificationResponse(403, "{\"error\":\"forbidden\"}"))
    }

    @Test(expected = FetchException.BadData::class)
    fun `html instead of json is reported as bad data`() {
        VsApi.parseClearancePage("<html><body>Please enable JS</body></html>")
    }

    @Test
    fun `urls are built the way the site builds them`() {
        assertEquals(
            "https://browse.vitaminshoppe.com/search/product/search?path=/cl/clearance/0&format=json&rpp=200&pageno=2&sessionId=&desktopView=false",
            VsApi.clearanceUrl(2)
        )
        assertEquals(
            "https://browse.vitaminshoppe.com/inventory/api/inventory/get-stores-with-inv?address=Tampa%2C+FL",
            VsApi.storeSearchUrl(" Tampa, FL ")
        )
        assertTrue(VsApi.inventoryUrl("702", listOf("1", "2")).endsWith("storeId=702&skuIds=1,2&source=WEB"))
        assertEquals("https://www.vitaminshoppe.com/p/x", VsApi.absoluteUrl("/p/x"))
        assertEquals("https://cdn.example.com/a.jpg", VsApi.absoluteUrl("//cdn.example.com/a.jpg"))
    }

    @Test
    fun `html entities in names are decoded`() {
        assertEquals("Doctor's Best & Co", VsApi.decodeEntities("Doctor&#39;s Best &amp; Co"))
        assertNotNull(VsApi.tidyTime("09 AM"))
        assertEquals("9 AM", VsApi.tidyTime("09 AM"))
        assertEquals("8:30 PM", VsApi.tidyTime("08:30 PM"))
        assertEquals("10 AM", VsApi.tidyTime("10 AM"))
    }
}
