package com.dealfilter.vitaminshoppe.domain

import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import java.text.Normalizer
import java.util.Locale

data class FilterCriteria(
    val query: String = "",
    val category: String? = null,
    val minDiscount: Int = 0,
    val inStockOnly: Boolean = false,
    val mode: FulfillmentMode = FulfillmentMode.SHIP,
    val sort: SortOption = SortOption.BEST_DISCOUNT,
    /** When set, only these SKUs (used by the "New & price drops" chip). */
    val onlyIds: Set<String>? = null
)

/** What changed between two loads of the clearance list. */
data class ListChanges(val newIds: Set<String>, val priceDrops: Map<String, Double>) {
    val count: Int get() = (newIds + priceDrops.keys).size
    val isEmpty: Boolean get() = newIds.isEmpty() && priceDrops.isEmpty()
}

object DealFilters {

    fun apply(items: List<DealItem>, c: FilterCriteria): List<DealItem> {
        val matcher = SearchMatcher(c.query)
        val filtered = items.filter { item ->
            item.discountPercent >= c.minDiscount &&
                (c.category == null || item.category.equals(c.category, ignoreCase = true)) &&
                (c.onlyIds == null || item.id in c.onlyIds) &&
                passesAvailability(item, c) &&
                matcher.matches(item)
        }
        return sort(filtered, c.sort)
    }

    private fun passesAvailability(item: DealItem, c: FilterCriteria): Boolean = when (c.mode) {
        // Pickup means "on the shelf at my store right now".
        FulfillmentMode.PICKUP -> item.isPickupEligible && item.isInStockAtStore
        FulfillmentMode.SHIP -> !c.inStockOnly || !item.isOutOfStockOnline
    }

    fun sort(items: List<DealItem>, sort: SortOption): List<DealItem> {
        // Every ordering ends with a stable tiebreak so the list doesn't reshuffle on refresh.
        val tiebreak = compareBy<DealItem>({ it.brand.lowercase(Locale.US) }, { it.title.lowercase(Locale.US) }, { it.id })
        val comparator: Comparator<DealItem> = when (sort) {
            SortOption.BEST_DISCOUNT -> compareByDescending<DealItem> { it.discountPercent }.thenBy { it.bestPrice }
            SortOption.LOWEST_PRICE -> compareBy { it.bestPrice }
            SortOption.HIGHEST_PRICE -> compareByDescending { it.bestPrice }
            // Items without serving data go last rather than pretending to be cheapest.
            SortOption.LOWEST_PER_SERVING -> compareBy<DealItem> { it.pricePerServing == null }.thenBy { it.pricePerServing ?: 0.0 }
            SortOption.BIGGEST_SAVINGS -> compareByDescending { it.savings }
            SortOption.BRAND_AZ -> compareBy { 0 }
        }
        return items.sortedWith(comparator.then(tiebreak))
    }

    /**
     * Items that weren't in [previous] and items whose best price fell by at least a cent.
     * Value of [ListChanges.priceDrops] is the old price.
     */
    fun changes(previous: List<DealItem>, current: List<DealItem>): ListChanges {
        if (previous.isEmpty()) return ListChanges(emptySet(), emptyMap())
        val before = previous.associateBy { it.id }
        val newIds = current.filter { it.id !in before }.map { it.id }.toSet()
        // If most of the list is "new", the previous load was almost certainly incomplete
        // (a paging glitch), not a real restock; don't flood the screen with NEW tags.
        if (previous.size >= 20 && newIds.size > current.size / 2) return ListChanges(emptySet(), emptyMap())
        val drops = current.mapNotNull { now ->
            val old = before[now.id] ?: return@mapNotNull null
            if (cents(old.bestPrice) > cents(now.bestPrice)) now.id to old.bestPrice else null
        }.toMap()
        return ListChanges(newIds, drops)
    }

    /**
     * Markers carried over a refresh that changed nothing: drop SKUs that disappeared and any
     * "price drop" whose price has since gone back up (never show a false drop).
     */
    fun prune(changes: ListChanges, current: List<DealItem>): ListChanges {
        val now = current.associateBy { it.id }
        return ListChanges(
            newIds = changes.newIds.filterTo(HashSet()) { it in now },
            priceDrops = changes.priceDrops.filter { (id, old) ->
                val item = now[id] ?: return@filter false
                cents(old) > cents(item.bestPrice)
            }
        )
    }

    private fun cents(price: Double): Long = Math.round(price * 100)

    /** Most common categories in the current list, for the quick-filter chips. */
    fun topCategories(items: List<DealItem>, limit: Int = 10): List<String> =
        items.mapNotNull { it.category?.trim()?.takeIf(String::isNotEmpty) }
            .groupingBy { it }
            .eachCount()
            .entries
            .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .take(limit)
            .map { it.key }
}

/**
 * Forgiving product search: every word must appear somewhere in brand, title, category or form,
 * ignoring case, accents and punctuation, so "omega 3", "omega-3" and "Omega3" all match,
 * as do "fish oil" and "fishoil".
 */
class SearchMatcher(query: String) {
    private val tokens = normalize(query).split(' ').filter { it.isNotEmpty() }
    private val squashedQuery = tokens.joinToString("")

    fun matches(item: DealItem): Boolean {
        if (tokens.isEmpty()) return true
        val hay = normalize(listOfNotNull(item.brand, item.title, item.category, item.form).joinToString(" "))
        val squashedHay = hay.replace(" ", "")
        if (squashedQuery.isNotEmpty() && squashedHay.contains(squashedQuery)) return true
        return tokens.all { token -> hay.contains(token) || squashedHay.contains(token) }
    }

    companion object {
        fun normalize(text: String): String {
            val decomposed = Normalizer.normalize(text, Normalizer.Form.NFD)
            return decomposed
                .replace(Regex("\\p{M}+"), "")
                .lowercase(Locale.US)
                .replace(Regex("[^a-z0-9]+"), " ")
                .trim()
        }
    }
}
