package com.dealfilter.vitaminshoppe.data.model

import java.util.Locale
import kotlin.math.roundToInt

/**
 * One clearance product exactly as vitaminshoppe.com reports it.
 *
 * Prices come straight from the site's catalog API:
 *  - [listPrice]  the regular ("was") price
 *  - [sitePrice]  the price the product page shows today
 *  - [cartDiscountPercent] set when the site says "X% Off - See Sale Price In Cart"; the
 *    API then reports the list price as [sitePrice] and the real discount only appears in
 *    the cart, so [estimatedCartPrice] works it out and the UI labels it as an estimate.
 */
data class DealItem(
    val id: String,
    val jdaSkuId: String?,
    val brand: String,
    val title: String,
    val productUrl: String,
    val imageUrl: String?,
    val listPrice: Double,
    val sitePrice: Double,
    val autoDeliveryPrice: Double? = null,
    val cartDiscountPercent: Int? = null,
    val servings: Int? = null,
    val servingSize: String? = null,
    val form: String? = null,
    val category: String? = null,
    val variantMessage: String? = null,
    val rating: Double? = null,
    val reviewCount: Int = 0,
    val isOutOfStockOnline: Boolean = false,
    val isPickupEligible: Boolean = true,
    /** Units on the shelf at the selected store; null when no store is selected or unknown. */
    val storeQuantity: Int? = null
) {
    /** Cart price implied by "X% Off - See Sale Price In Cart", only when it beats the page price. */
    val estimatedCartPrice: Double?
        get() {
            val pct = cartDiscountPercent ?: return null
            if (pct !in 1..95) return null
            val estimate = roundCents(listPrice * (1 - pct / 100.0))
            return if (estimate < sitePrice - 0.005) estimate else null
        }

    val hasCartOnlyPrice: Boolean get() = estimatedCartPrice != null

    /** The lowest one-time price the shopper should expect to pay. */
    val bestPrice: Double get() = estimatedCartPrice ?: sitePrice

    val discountPercent: Int get() = percentOff(listPrice, bestPrice)

    val sitePercentOff: Int get() = percentOff(listPrice, sitePrice)

    val savings: Double get() = (listPrice - bestPrice).coerceAtLeast(0.0)

    val pricePerServing: Double?
        get() = servings?.takeIf { it > 0 }?.let { bestPrice / it }

    /** Auto Delivery price, shown only when it beats what you'd pay anyway (the cart price included). */
    val autoDeliveryDeal: Double?
        get() = autoDeliveryPrice?.takeIf { it > 0 && it < bestPrice - 0.005 }

    val isInStockAtStore: Boolean get() = (storeQuantity ?: 0) > 0

    /** Pack size from the trailing "(60 Vegetarian Capsules)" in the site's names, if present. */
    val sizeLabel: String?
        get() = SIZE_SUFFIX.find(title)?.groupValues?.get(1)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }

    val formattedBestPrice: String get() = money(bestPrice)
    val formattedSitePrice: String get() = money(sitePrice)
    val formattedListPrice: String get() = money(listPrice)
    val formattedSavings: String get() = money(savings)
    val formattedPricePerServing: String?
        get() = pricePerServing?.let {
            if (it < 1.0) String.format(Locale.US, "%.0f¢/serving", it * 100)
            else String.format(Locale.US, "%s/serving", money(it))
        }

    /** Plain-text line block for the AI review prompt. */
    fun toPromptLines(index: Int, storeName: String?): String {
        val price = if (hasCartOnlyPrice) {
            "≈${formattedBestPrice} in cart (page shows $formattedSitePrice; site says $cartDiscountPercent% off list in cart)"
        } else {
            formattedBestPrice
        }
        val details = listOfNotNull(
            form,
            servings?.let { "$it servings" },
            servingSize?.let { "serving = $it" },
            formattedPricePerServing
        ).joinToString(" · ").ifEmpty { "n/a" }
        val stock = buildList {
            add(if (isOutOfStockOnline) "out of stock online" else "available online")
            if (storeName != null && storeQuantity != null) {
                add(if (storeQuantity > 0) "$storeQuantity at $storeName" else "none at $storeName")
            }
        }.joinToString("; ")
        return buildString {
            append("$index. **$brand** — $title\n")
            append("   - Price: $price (was $formattedListPrice, ${discountPercent}% off)\n")
            autoDeliveryDeal?.let { append("   - Auto Delivery price: ${money(it)}\n") }
            append("   - Format: $details\n")
            append("   - Availability: $stock\n")
            append("   - Link: $productUrl")
        }
    }

    companion object {
        private val SIZE_SUFFIX = Regex("""\(([^()]*\d[^()]*)\)\s*$""")

        fun money(value: Double): String = String.format(Locale.US, "$%.2f", value)

        fun roundCents(value: Double): Double = (value * 100).roundToInt() / 100.0

        fun percentOff(list: Double, price: Double): Int =
            if (list <= 0 || price >= list) 0
            else (((list - price) / list) * 100).roundToInt().coerceIn(0, 99)
    }
}
