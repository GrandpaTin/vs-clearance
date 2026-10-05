package com.dealfilter.vitaminshoppe.data.local

import android.content.Context
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Saved filter choices, restored on the next launch. */
data class SavedPreferences(
    val store: StoreLocation?,
    val mode: FulfillmentMode,
    val discountFloor: DiscountFloor,
    val sort: SortOption,
    val inStockOnly: Boolean,
    val lastStoreQuery: String,
    val category: String? = null
)

/** Last successful download, so the app opens instantly and still works offline. */
data class CachedDeals(
    val items: List<DealItem>,
    val savedAtMillis: Long,
    val stockStoreId: String?,
    val stock: Map<String, Int>,
    val newIds: Set<String> = emptySet(),
    val priceDrops: Map<String, Double> = emptyMap()
)

/**
 * SharedPreferences for small settings plus one JSON file for the deal list.
 * Every read tolerates missing or corrupt data and falls back to defaults.
 */
class LocalStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("vs_deals", Context.MODE_PRIVATE)
    private val cacheFile = File(context.applicationContext.filesDir, "clearance_cache.json")

    fun loadPreferences(): SavedPreferences = SavedPreferences(
        store = prefs.getString(KEY_STORE, null)?.let { runCatching { storeFromJson(JSONObject(it)) }.getOrNull() },
        mode = enumOr(prefs.getString(KEY_MODE, null), FulfillmentMode.SHIP),
        discountFloor = enumOr(prefs.getString(KEY_FLOOR, null), DiscountFloor.ANY),
        sort = enumOr(prefs.getString(KEY_SORT, null), SortOption.BEST_DISCOUNT),
        inStockOnly = prefs.getBoolean(KEY_IN_STOCK, true),
        lastStoreQuery = prefs.getString(KEY_STORE_QUERY, "") ?: "",
        category = prefs.getString(KEY_CATEGORY, null)
    )

    fun savePreferences(p: SavedPreferences) {
        prefs.edit()
            .putString(KEY_STORE, p.store?.let { storeToJson(it).toString() })
            .putString(KEY_MODE, p.mode.name)
            .putString(KEY_FLOOR, p.discountFloor.name)
            .putString(KEY_SORT, p.sort.name)
            .putBoolean(KEY_IN_STOCK, p.inStockOnly)
            .putString(KEY_STORE_QUERY, p.lastStoreQuery)
            .putString(KEY_CATEGORY, p.category)
            .apply()
    }

    fun loadCache(): CachedDeals? = runCatching {
        if (!cacheFile.exists()) return null
        val root = JSONObject(cacheFile.readText())
        if (root.optInt("v") != CACHE_VERSION) return null
        val arr = root.getJSONArray("items")
        val items = (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let(::dealFromJson) }
        val stockObj = root.optJSONObject("stock")
        val stock = stockObj?.keys()?.asSequence()?.associateWith { stockObj.optInt(it) } ?: emptyMap()
        val newArr = root.optJSONArray("newIds")
        val newIds = if (newArr == null) emptySet() else (0 until newArr.length()).map { newArr.optString(it) }.toSet()
        val dropObj = root.optJSONObject("drops")
        val drops = dropObj?.keys()?.asSequence()?.associateWith { dropObj.optDouble(it) } ?: emptyMap()
        CachedDeals(items, root.optLong("savedAt"), root.optString("stockStore").ifBlank { null }, stock, newIds, drops)
    }.getOrNull()

    fun saveCache(cache: CachedDeals) {
        runCatching {
            val root = JSONObject()
                .put("v", CACHE_VERSION)
                .put("savedAt", cache.savedAtMillis)
                .put("stockStore", cache.stockStoreId ?: "")
                .put("items", JSONArray().apply { cache.items.forEach { put(dealToJson(it)) } })
                .put("stock", JSONObject().apply { cache.stock.forEach { (k, v) -> put(k, v) } })
                .put("newIds", JSONArray(cache.newIds.toList()))
                .put("drops", JSONObject().apply { cache.priceDrops.forEach { (k, v) -> put(k, v) } })
            // Write-then-rename so a crash mid-write never leaves a truncated cache behind.
            val tmp = File(cacheFile.parentFile, cacheFile.name + ".tmp")
            tmp.writeText(root.toString())
            if (!tmp.renameTo(cacheFile)) {
                cacheFile.delete()
                tmp.renameTo(cacheFile)
            }
        }
    }

    companion object {
        private const val CACHE_VERSION = 3
        private const val KEY_STORE = "store"
        private const val KEY_MODE = "mode"
        private const val KEY_FLOOR = "floor"
        private const val KEY_SORT = "sort"
        private const val KEY_IN_STOCK = "in_stock_only"
        private const val KEY_STORE_QUERY = "store_query"
        private const val KEY_CATEGORY = "category"

        private inline fun <reified T : Enum<T>> enumOr(name: String?, fallback: T): T =
            name?.let { n -> enumValues<T>().firstOrNull { it.name == n } } ?: fallback

        fun storeToJson(s: StoreLocation): JSONObject = JSONObject()
            .put("id", s.storeId).put("name", s.name).put("a1", s.address1).put("a2", s.address2)
            .put("city", s.city).put("state", s.state).put("zip", s.zipCode).put("phone", s.phone ?: "")
            .put("dist", s.distanceMiles ?: -1.0).put("hours", JSONArray(s.hours))
            .put("pickup", s.pickupEnabled).put("closed", s.temporarilyClosed)

        fun storeFromJson(o: JSONObject): StoreLocation {
            val hours = o.optJSONArray("hours")
            return StoreLocation(
                storeId = o.getString("id"),
                name = o.optString("name"),
                address1 = o.optString("a1"),
                address2 = o.optString("a2"),
                city = o.optString("city"),
                state = o.optString("state"),
                zipCode = o.optString("zip"),
                phone = o.optString("phone").ifBlank { null },
                distanceMiles = o.optDouble("dist", -1.0).takeIf { it >= 0 },
                hours = if (hours == null) emptyList() else (0 until hours.length()).map { hours.optString(it) },
                pickupEnabled = o.optBoolean("pickup", true),
                temporarilyClosed = o.optBoolean("closed", false)
            )
        }

        fun dealToJson(d: DealItem): JSONObject = JSONObject()
            .put("id", d.id).put("jda", d.jdaSkuId ?: "").put("brand", d.brand).put("title", d.title)
            .put("url", d.productUrl).put("img", d.imageUrl ?: "").put("list", d.listPrice).put("site", d.sitePrice)
            .put("adp", d.autoDeliveryPrice ?: -1.0).put("cart", d.cartDiscountPercent ?: -1)
            .put("servings", d.servings ?: -1).put("servingSize", d.servingSize ?: "").put("form", d.form ?: "")
            .put("category", d.category ?: "").put("variants", d.variantMessage ?: "")
            .put("rating", d.rating ?: -1.0).put("reviews", d.reviewCount)
            .put("oos", d.isOutOfStockOnline).put("pickup", d.isPickupEligible)

        fun dealFromJson(o: JSONObject): DealItem? {
            val id = o.optString("id").ifBlank { return null }
            val list = o.optDouble("list", -1.0)
            val site = o.optDouble("site", -1.0)
            val url = o.optString("url").ifBlank { return null }
            if (list <= 0 || site <= 0) return null
            return DealItem(
                id = id,
                jdaSkuId = o.optString("jda").ifBlank { null },
                brand = o.optString("brand"),
                title = o.optString("title"),
                productUrl = url,
                imageUrl = o.optString("img").ifBlank { null },
                listPrice = list,
                sitePrice = site,
                autoDeliveryPrice = o.optDouble("adp", -1.0).takeIf { it > 0 },
                cartDiscountPercent = o.optInt("cart", -1).takeIf { it > 0 },
                servings = o.optInt("servings", -1).takeIf { it > 0 },
                servingSize = o.optString("servingSize").ifBlank { null },
                form = o.optString("form").ifBlank { null },
                category = o.optString("category").ifBlank { null },
                variantMessage = o.optString("variants").ifBlank { null },
                rating = o.optDouble("rating", -1.0).takeIf { it > 0 },
                reviewCount = o.optInt("reviews", 0),
                isOutOfStockOnline = o.optBoolean("oos", false),
                isPickupEligible = o.optBoolean("pickup", true)
            )
        }
    }
}
