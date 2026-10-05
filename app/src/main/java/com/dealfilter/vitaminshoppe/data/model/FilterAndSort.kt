package com.dealfilter.vitaminshoppe.data.model

enum class SortOption(val label: String, val shortLabel: String) {
    BEST_DISCOUNT("Biggest discount", "Discount"),
    LOWEST_PRICE("Lowest price", "Lowest price"),
    HIGHEST_PRICE("Highest price", "Highest price"),
    LOWEST_PER_SERVING("Best value (lowest cost per serving)", "Best value"),
    BIGGEST_SAVINGS("Most dollars saved", "$ saved"),
    BRAND_AZ("Brand A–Z", "Brand")
}

enum class FulfillmentMode(val label: String) {
    SHIP("Ship"),
    PICKUP("Pick up")
}

/** Discount floors that match how the site groups its clearance (25 / 50 / 65 / 75 % off). */
enum class DiscountFloor(val minPercent: Int, val label: String) {
    ANY(0, "Any"),
    P25(25, "25%+"),
    P50(50, "50%+"),
    P65(65, "65%+"),
    P75(75, "75%+");

    companion object {
        fun fromPercent(percent: Int): DiscountFloor = values().firstOrNull { it.minPercent == percent } ?: P50
    }
}
