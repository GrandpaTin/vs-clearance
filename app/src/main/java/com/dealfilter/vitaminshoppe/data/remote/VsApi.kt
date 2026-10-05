package com.dealfilter.vitaminshoppe.data.remote

import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.net.URLEncoder

/**
 * Endpoints and parsers for the JSON APIs that vitaminshoppe.com's own pages call.
 *
 * The site serves product listings, store search and store inventory from
 * browse.vitaminshoppe.com. Those endpoints sit behind DataDome bot protection, so they are
 * requested from inside a real browser session ([WebSession]); this object stays pure Kotlin so
 * the parsing can be unit tested against captured responses.
 */
object VsApi {
    const val SITE = "https://www.vitaminshoppe.com"
    const val HOST_PAGE = "$SITE/cl/clearance/0"
    private const val BROWSE = "https://browse.vitaminshoppe.com"

    /** The search API rejects page sizes above 200 with HTTP 400. */
    const val PAGE_SIZE = 200
    /** Safety cap (5,000 items); clearance is normally a few hundred. */
    const val MAX_PAGES = 25

    /** pdpinventory accepts at least 100 SKUs per call. */
    const val INVENTORY_BATCH = 100

    fun clearanceUrl(page: Int): String =
        "$BROWSE/search/product/search?path=/cl/clearance/0&format=json&rpp=$PAGE_SIZE&pageno=$page&sessionId=&desktopView=false"

    fun storeSearchUrl(query: String): String =
        "$BROWSE/inventory/api/inventory/get-stores-with-inv?address=" + URLEncoder.encode(query.trim(), "UTF-8")

    fun inventoryUrl(storeId: String, jdaSkuIds: List<String>): String =
        "$BROWSE/inventory/api/inventory/pdpinventory?storeId=" + URLEncoder.encode(storeId, "UTF-8") +
            "&skuIds=" + jdaSkuIds.joinToString(",") + "&source=WEB"

    // ---------------------------------------------------------------------------------------
    // Clearance listing
    // ---------------------------------------------------------------------------------------

    data class ClearancePage(val items: List<DealItem>, val totalPages: Int, val totalProducts: Int)

    private val CART_DISCOUNT = Regex("""(\d{1,2})\s*%\s*off\b.*\bin\s+cart""", RegexOption.IGNORE_CASE)

    fun parseClearancePage(json: String): ClearancePage {
        val root = parseObject(json)
        val response = root.optJSONObject("response")
            ?: throw FetchException.BadData("Listing response was empty")
        val products = response.optJSONArray("products") ?: JSONArray()
        val items = ArrayList<DealItem>(products.length())
        for (i in 0 until products.length()) {
            val p = products.optJSONObject(i) ?: continue
            parseProduct(p)?.let(items::add)
        }
        val pagination = response.optJSONObject("pagination")
        val totalPages = pagination?.optInt("totalPages", 1)?.coerceAtLeast(1) ?: 1
        val total = response.optInt("numProducts", items.size)
        return ClearancePage(items, totalPages, total)
    }

    /** Returns null for promo tiles and rows without a usable price or link. */
    fun parseProduct(p: JSONObject): DealItem? {
        if (p.optString("type", "Product") != "Product") return null
        val id = p.str("skuId") ?: return null
        val price = p.optJSONObject("price") ?: return null
        val list = price.optDouble("listPrice", Double.NaN)
        val active = price.optDouble("activePrice", Double.NaN).takeUnless { it.isNaN() || it <= 0 }
            ?: price.optDouble("salePrice", Double.NaN)
        if (list.isNaN() || active.isNaN() || list <= 0 || active <= 0) return null
        val pdp = p.str("pdpUrl") ?: return null
        val deliveries = p.optJSONObject("deliveryMethods")

        return DealItem(
            id = id,
            jdaSkuId = p.str("jdaSkuId"),
            brand = decodeEntities(p.str("brand") ?: "").trim(),
            title = decodeEntities(p.str("displayName") ?: p.str("longDisplayName") ?: id).trim(),
            productUrl = absoluteUrl(pdp),
            imageUrl = p.str("imageUrl")?.let(::absoluteUrl),
            // A price below list is the real sale price even when the site flags it oddly.
            listPrice = maxOf(list, active),
            sitePrice = active,
            autoDeliveryPrice = price.optDouble("adpPrice", Double.NaN).takeUnless { it.isNaN() || it <= 0 },
            cartDiscountPercent = parseCartDiscount(p.str("descriptorMessage")),
            servings = p.optInt("numberOfServings", 0).takeIf { it > 0 },
            servingSize = p.str("servingSize"),
            form = p.str("form"),
            category = p.str("category"),
            variantMessage = p.str("variantCountMessage"),
            rating = p.optDouble("starRating", Double.NaN).takeUnless { it.isNaN() || it <= 0 },
            reviewCount = p.optInt("totalReviewCount", 0).coerceAtLeast(0),
            isOutOfStockOnline = p.optBoolean("temporaryOutOfStock", false) || !p.optBoolean("purchasable", true),
            isPickupEligible = deliveries?.optBoolean("bopusEligible", true) ?: true
        )
    }

    /** "75% Off - See Sale Price In Cart" -> 75. Anything else -> null. */
    fun parseCartDiscount(descriptor: String?): Int? {
        if (descriptor.isNullOrBlank()) return null
        return CART_DISCOUNT.find(descriptor)?.groupValues?.get(1)?.toIntOrNull()
    }

    /** Pages can overlap if the catalog changes mid-load; keep the first copy of each SKU. */
    fun dedupe(items: List<DealItem>): List<DealItem> = items.distinctBy { it.id }

    // ---------------------------------------------------------------------------------------
    // Store search
    // ---------------------------------------------------------------------------------------

    enum class StoreSearchStatus { FOUND, NONE_NEARBY, UNRECOGNIZED_LOCATION }

    data class StoreSearchResult(val stores: List<StoreLocation>, val status: StoreSearchStatus)

    fun parseStores(json: String): StoreSearchResult {
        val root = parseObject(json)
        val arr = root.optJSONArray("stores") ?: JSONArray()
        val stores = ArrayList<StoreLocation>(arr.length())
        for (i in 0 until arr.length()) {
            val s = arr.optJSONObject(i) ?: continue
            parseStore(s)?.let(stores::add)
        }
        val code = root.optString("RESPONSE_CODE", "")
        val status = when {
            stores.isNotEmpty() -> StoreSearchStatus.FOUND
            code == "SERVICE_NOT_AVAILABLE" -> StoreSearchStatus.UNRECOGNIZED_LOCATION
            else -> StoreSearchStatus.NONE_NEARBY
        }
        return StoreSearchResult(stores.sortedBy { it.distanceMiles ?: Double.MAX_VALUE }, status)
    }

    private fun parseStore(s: JSONObject): StoreLocation? {
        val id = s.opt("storeId")?.toString()?.takeIf { it.isNotBlank() && it != "null" } ?: return null
        val address = s.optJSONObject("address")
        val city = address?.str("city") ?: ""
        val state = address?.str("state") ?: ""
        val hoursArr = s.optJSONArray("store_hours_fmtd_12")
        val hours = buildList {
            if (hoursArr != null) {
                for (i in 0 until hoursArr.length()) {
                    val h = hoursArr.optJSONObject(i) ?: continue
                    val day = h.str("day") ?: continue
                    val open = h.str("start_time")?.let(::tidyTime) ?: continue
                    val close = h.str("end_time")?.let(::tidyTime) ?: continue
                    add("$day: $open – $close")
                }
            }
        }
        return StoreLocation(
            storeId = id,
            name = s.str("name") ?: listOf(city, state).filter { it.isNotBlank() }.joinToString(", "),
            address1 = address?.str("address1") ?: "",
            address2 = address?.str("address2") ?: "",
            city = city,
            state = state,
            zipCode = s.str("postal_code") ?: "",
            phone = s.str("phone_number"),
            distanceMiles = s.optDouble("dist_from_cur_loc", Double.NaN).takeUnless { it.isNaN() || it < 0 },
            hours = hours,
            pickupEnabled = s.optBoolean("bopus", true),
            temporarilyClosed = s.optBoolean("temporarilyClosed", false),
            statusMessage = s.optJSONObject("statusMsg")?.str("message")
        )
    }

    /** "09 AM" -> "9 AM", "08:30 PM" -> "8:30 PM". */
    fun tidyTime(raw: String): String = raw.trim().replace(Regex("""^0(\d)"""), "$1")

    // ---------------------------------------------------------------------------------------
    // Store inventory
    // ---------------------------------------------------------------------------------------

    /** jdaSkuId -> units on hand. "na" (not carried) and anything unparseable count as 0. */
    fun parseInventory(json: String): Map<String, Int> {
        val root = parseObject(json)
        val arr = root.optJSONArray("skuInventory") ?: return emptyMap()
        val out = HashMap<String, Int>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val sku = o.opt("skuId")?.toString() ?: continue
            val available = o.optString("service", "available").equals("available", ignoreCase = true)
            val qty = o.opt("quantity")?.toString()?.trim()?.toIntOrNull() ?: 0
            out[sku] = if (available) qty.coerceAtLeast(0) else 0
        }
        return out
    }

    // ---------------------------------------------------------------------------------------
    // Bot-protection responses
    // ---------------------------------------------------------------------------------------

    /** DataDome answers a blocked API call with HTTP 403 and {"url":"https://geo.captcha-delivery.com/..."}. */
    fun isVerificationResponse(status: Int, body: String): Boolean =
        status == 403 && body.contains("captcha-delivery.com")

    // ---------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------

    private fun parseObject(json: String): JSONObject = try {
        JSONObject(json)
    } catch (e: JSONException) {
        throw FetchException.BadData("Unexpected response from vitaminshoppe.com")
    }

    fun absoluteUrl(path: String): String = when {
        path.startsWith("https://") -> path
        path.startsWith("http://") -> "https://" + path.removePrefix("http://")
        path.startsWith("//") -> "https:$path"
        else -> "$SITE/" + path.trimStart('/')
    }

    private fun JSONObject.str(key: String): String? {
        if (!has(key) || isNull(key)) return null
        return optString(key).trim().takeIf { it.isNotEmpty() && it != "null" }
    }

    private val ENTITIES = mapOf(
        "&amp;" to "&", "&quot;" to "\"", "&#39;" to "'", "&apos;" to "'",
        "&lt;" to "<", "&gt;" to ">", "&nbsp;" to " ", "&reg;" to "®", "&trade;" to "™"
    )

    fun decodeEntities(text: String): String {
        if (!text.contains('&')) return text
        var out = text
        ENTITIES.forEach { (k, v) -> out = out.replace(k, v) }
        return out
    }
}
