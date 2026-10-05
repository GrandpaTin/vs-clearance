package com.dealfilter.vitaminshoppe.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.dealfilter.vitaminshoppe.data.model.DealItem
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.ui.theme.DealTheme
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DealCard(
    deal: DealItem,
    store: StoreLocation?,
    isStockLoading: Boolean,
    onOpen: (DealItem) -> Unit,
    isNew: Boolean = false,
    previousPrice: Double? = null,
    onShare: (DealItem) -> Unit,
    modifier: Modifier = Modifier
) {
    val badges = DealTheme.badges
    val largeFont = LocalDensity.current.fontScale >= 1.3f
    val priceSummary = buildString {
        append(if (deal.hasCartOnlyPrice) "About ${deal.formattedBestPrice} in cart" else deal.formattedBestPrice)
        if (deal.discountPercent > 0) append(", was ${deal.formattedListPrice}, ${deal.discountPercent} percent off")
    }

    Card(
        onClick = { onOpen(deal) },
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .semantics { onClick(label = "Open on vitaminshoppe.com") { onOpen(deal); true } },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        // Flat + hairline: tonal elevation tints the card grey and hides the fact tags.
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(modifier = Modifier.padding(start = 12.dp, top = 12.dp, end = 4.dp, bottom = 0.dp)) {
            ProductImage(deal, if (largeFont) 64 else 88)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 8.dp)) {
                    Text(
                        text = deal.brand.ifBlank { "Vitamin Shoppe" }.uppercase(Locale.US),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.ExtraBold,
                        letterSpacing = 0.8.sp,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isNew) {
                        Spacer(Modifier.width(6.dp))
                        Tag("NEW", badges.skyBlueContainer, badges.onSkyBlueContainer, bold = true)
                    }
                    if (previousPrice != null) {
                        Spacer(Modifier.width(6.dp))
                        Tag("PRICE DROP", badges.emeraldContainer, badges.onEmeraldContainer, bold = true)
                    }
                }
                Text(
                    text = deal.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = if (largeFont) 5 else 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(end = 8.dp)
                )

                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = priceSummary }
                ) {
                    Text(
                        text = (if (deal.hasCartOnlyPrice) "≈" else "") + deal.formattedBestPrice,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        color = badges.price,
                        modifier = Modifier.align(Alignment.CenterVertically)
                    )
                    if (deal.discountPercent > 0) {
                        Text(
                            text = deal.formattedListPrice,
                            style = MaterialTheme.typography.bodyMedium,
                            textDecoration = TextDecoration.LineThrough,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.align(Alignment.CenterVertically)
                        )
                        Tag(
                            "−${deal.discountPercent}%",
                            badges.emeraldContainer,
                            badges.onEmeraldContainer,
                            bold = true,
                            modifier = Modifier.align(Alignment.CenterVertically)
                        )
                    }
                }
                if (deal.hasCartOnlyPrice) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.ShoppingCart, contentDescription = null, tint = badges.price, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "Extra ${deal.cartDiscountPercent}% off in cart (lists ${deal.formattedSitePrice})",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                previousPrice?.let { old ->
                    Text(
                        text = buildAnnotatedString {
                            append("Down from ")
                            withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) { append(DealItem.money(old)) }
                            append(" since your last check")
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "Price dropped from ${DealItem.money(old)} since your last check" }
                    )
                }
                // Secondary detail; at large font it costs a whole line per card.
                if (!largeFont) deal.autoDeliveryDeal?.let {
                    Text(
                        text = "${DealItem.money(it)} with Auto Delivery",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                // Pack size first so it survives even when a long title is truncated.
                val size = deal.sizeLabel
                val facts = listOfNotNull(
                    size?.let(::shortSize) ?: deal.form,
                    deal.servings?.let { "$it servings" }?.takeUnless {
                        // "(60 Servings)", or "(90 Capsules)" with 90 servings, already says it.
                        size != null && (size.contains("serving", ignoreCase = true) ||
                            size.takeWhile(Char::isDigit).toIntOrNull() == deal.servings)
                    },
                    deal.formattedPricePerServing,
                    deal.variantMessage
                )
                // A star rating from one or two reviews says more about the reviewer than the product.
                val rating = deal.rating?.takeIf { deal.reviewCount >= 3 }
                if (facts.isNotEmpty() || rating != null) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.padding(top = 2.dp, end = 8.dp)
                    ) {
                        facts.forEach { Tag(it, MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant) }
                        rating?.let { rating ->
                            val count = " (${deal.reviewCount})"
                            Text(
                                text = String.format(Locale.US, "★ %.1f", rating) + count,
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .align(Alignment.CenterVertically)
                                    .semantics {
                                        contentDescription = String.format(Locale.US, "Rated %.1f out of 5", rating) +
                                            when (deal.reviewCount) { 0 -> ""; 1 -> ", 1 review"; else -> ", ${deal.reviewCount} reviews" }
                                    }
                            )
                        }
                    }
                }

                // At large font the stock line needs the full width, so actions drop to the next row.
                if (largeFont) Box(Modifier.padding(end = 8.dp)) { AvailabilityLine(deal, store, isStockLoading) }
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.height(40.dp)) {
                    Column(Modifier.weight(1f)) {
                        if (!largeFont) AvailabilityLine(deal, store, isStockLoading)
                    }
                    IconButton(onClick = { onShare(deal) }) {
                        Icon(Icons.Default.Share, contentDescription = "Share ${deal.title}", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onOpen(deal) }) {
                        Icon(
                            Icons.AutoMirrored.Filled.OpenInNew,
                            contentDescription = "Open ${deal.title} on vitaminshoppe.com",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductImage(deal: DealItem, sizeDp: Int) {
    Box(
        modifier = Modifier
            .size(sizeDp.dp)
            .clip(RoundedCornerShape(12.dp))
            // Product shots are on white; a white tile keeps them clean in dark mode too.
            .background(if (deal.imageUrl != null) Color.White else MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        val fallback = @Composable {
            Icon(Icons.Default.Inventory2, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(32.dp))
        }
        if (deal.imageUrl == null) {
            fallback()
        } else {
            SubcomposeAsyncImage(
                model = deal.imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                // Even inset so tall bottles and wide boxes carry similar visual weight.
                modifier = Modifier
                    .size((sizeDp - 2).dp)
                    .padding(6.dp),
                error = {
                    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) { fallback() }
                }
            )
        }
    }
}

@Composable
private fun AvailabilityLine(deal: DealItem, store: StoreLocation?, isStockLoading: Boolean) {
    val badges = DealTheme.badges
    val (text, dot) = when {
        store != null && deal.storeQuantity == null && isStockLoading ->
            "Checking shelf…" to MaterialTheme.colorScheme.outline
        // The store is named in the selector above, so lines stay short enough for one row.
        store != null && deal.storeQuantity == null && deal.jdaSkuId != null ->
            "Shelf stock unknown" to MaterialTheme.colorScheme.outline
        store != null && deal.storeQuantity != null && deal.storeQuantity > 0 ->
            "${deal.storeQuantity} on the shelf" to badges.onEmeraldContainer
        store != null && deal.storeQuantity != null ->
            (if (deal.isOutOfStockOnline) "Not in store · sold out online" else "Not in store · ships") to MaterialTheme.colorScheme.outline
        deal.isOutOfStockOnline -> "Out of stock online" to badges.onRedContainer
        else -> "In stock online" to badges.onEmeraldContainer
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(8.dp)
                .background(dot, CircleShape)
        )
        Spacer(Modifier.width(6.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.semantics {
                contentDescription = if (store != null) "$text at ${store.name}" else text
            }
        )
    }
}

@Composable
fun Tag(
    text: String,
    container: Color,
    content: Color,
    modifier: Modifier = Modifier,
    bold: Boolean = false
) {
    Surface(color = container, shape = RoundedCornerShape(6.dp), modifier = modifier) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (bold) FontWeight.ExtraBold else FontWeight.Medium,
            color = content
        )
    }
}

/** "60 Vegetarian Capsules" -> "60 veg caps": a scannable pill instead of repeating the title. */
internal fun shortSize(size: String): String {
    val replacements = listOf(
        "Vegetarian Capsules" to "veg caps", "Veggie Capsules" to "veg caps", "Veggie Caps" to "veg caps",
        "Vegan Capsules" to "vegan caps", "Liquid Capsules" to "liquid caps", "Capsules" to "caps",
        "Tablets" to "tabs", "Tablet(s)" to "tabs", "Softgels" to "softgels", "Servings" to "servings",
        "Gummies" to "gummies", "Lozenges" to "lozenges", "Packets" to "packets", "Bars" to "bars"
    )
    var out = size
    for ((long, short) in replacements) out = out.replace(long, short, ignoreCase = true)
    return out
}
