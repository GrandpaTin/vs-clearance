package com.dealfilter.vitaminshoppe.data.model

import java.util.Locale

/**
 * A Vitamin Shoppe store as returned by the site's store-locator API.
 */
data class StoreLocation(
    val storeId: String,
    val name: String,
    val address1: String,
    val address2: String = "",
    val city: String,
    val state: String,
    val zipCode: String,
    val phone: String? = null,
    val distanceMiles: Double? = null,
    val hours: List<String> = emptyList(),
    val pickupEnabled: Boolean = true,
    val temporarilyClosed: Boolean = false,
    val statusMessage: String? = null
) {
    val streetLine: String
        get() = listOf(address1, address2).filter { it.isNotBlank() }.joinToString(", ")

    val cityLine: String
        get() = "$city, $state $zipCode".trim()

    val fullAddress: String
        get() = listOf(streetLine, cityLine).filter { it.isNotBlank() }.joinToString(", ")

    val formattedDistance: String
        get() = distanceMiles?.let {
            if (it < 10) String.format(Locale.US, "%.1f mi", it) else String.format(Locale.US, "%.0f mi", it)
        } ?: ""

    /** True when the store can actually be used for in-store pickup right now. */
    val isSelectable: Boolean get() = pickupEnabled && !temporarilyClosed
}
