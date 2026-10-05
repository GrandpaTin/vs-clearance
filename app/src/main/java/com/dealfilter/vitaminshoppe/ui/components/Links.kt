package com.dealfilter.vitaminshoppe.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.ui.theme.NavyPrimary
import androidx.compose.ui.graphics.toArgb

/**
 * Opens a product page. Custom Tabs keep the shopper's own browser session (cart, sign-in);
 * plain ACTION_VIEW is the fallback for devices without a Custom Tabs browser.
 * Returns false when nothing on the device can open a web page.
 */
fun openProductPage(context: Context, url: String): Boolean {
    val uri = Uri.parse(url)
    return try {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder().setToolbarColor(NavyPrimary.toArgb()).build()
            )
            .build()
            .launchUrl(context, uri)
        true
    } catch (e: ActivityNotFoundException) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e2: ActivityNotFoundException) {
            false
        }
    }
}

fun shareDeal(context: Context, deal: DealItem): Boolean {
    val price = if (deal.hasCartOnlyPrice) "≈${deal.formattedBestPrice} in cart" else deal.formattedBestPrice
    val text = "${deal.brand} — ${deal.title}\n$price (was ${deal.formattedListPrice}, ${deal.discountPercent}% off) at The Vitamin Shoppe\n${deal.productUrl}"
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
        putExtra(Intent.EXTRA_SUBJECT, deal.title)
    }
    return try {
        context.startActivity(Intent.createChooser(send, "Share deal"))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}

fun dialStore(context: Context, phone: String): Boolean {
    val digits = phone.filter { it.isDigit() || it == '+' }
    if (digits.isEmpty()) return false
    return try {
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$digits")))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }
}
