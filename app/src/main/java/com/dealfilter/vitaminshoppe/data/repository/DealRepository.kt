package com.dealfilter.vitaminshoppe.data.repository

import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.remote.FetchException
import com.dealfilter.vitaminshoppe.data.remote.JsonFetcher
import com.dealfilter.vitaminshoppe.data.remote.VsApi

/**
 * Loads live clearance data from vitaminshoppe.com. Nothing here is invented: if the site
 * can't be reached, callers get an exception and decide whether to show cached data.
 */
class DealRepository(private val fetcher: JsonFetcher) {

    /** Every clearance product, across all listing pages. */
    /** How many products the site said the last clearance listing had (0 before the first fetch). */
    @Volatile var lastReportedTotal = 0
        private set

    suspend fun fetchClearance(): List<DealItem> {
        val first = VsApi.parseClearancePage(fetcher.getJson(VsApi.clearanceUrl(1)))
        lastReportedTotal = first.totalProducts
        val pages = first.totalPages.coerceIn(1, VsApi.MAX_PAGES)
        val all = ArrayList<DealItem>(first.totalProducts.coerceAtLeast(first.items.size))
        all += first.items
        for (page in 2..pages) {
            all += VsApi.parseClearancePage(fetcher.getJson(VsApi.clearanceUrl(page))).items
        }
        return VsApi.dedupe(all)
    }

    /** Units on hand at [storeId], keyed by jdaSkuId. */
    suspend fun fetchStoreStock(storeId: String, items: List<DealItem>): Map<String, Int> {
        val skus = items.mapNotNull { it.jdaSkuId }.distinct()
        val stock = HashMap<String, Int>(skus.size)
        for (batch in skus.chunked(VsApi.INVENTORY_BATCH)) {
            val got = VsApi.parseInventory(fetcher.getJson(VsApi.inventoryUrl(storeId, batch)))
            // Fewer than half the SKUs answered: the store's stock service is having trouble, and
            // treating the rest as "none on the shelf" would be a confident wrong answer.
            if (got.size * 2 < batch.size) throw FetchException.BadData("Shelf stock came back incomplete.")
            stock += got
        }
        return stock
    }

    suspend fun searchStores(query: String): VsApi.StoreSearchResult =
        VsApi.parseStores(fetcher.getJson(VsApi.storeSearchUrl(query)))
}
