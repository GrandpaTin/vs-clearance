package com.dealfilter.vitaminshoppe.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.FilledTonalButton
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.dealfilter.vitaminshoppe.data.model.DiscountFloor
import com.dealfilter.vitaminshoppe.data.model.FulfillmentMode
import com.dealfilter.vitaminshoppe.data.model.SortOption
import com.dealfilter.vitaminshoppe.data.model.StoreLocation

/** Ship / Pick up switch plus a full-width store row (wraps instead of truncating the store name). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModeAndStoreRow(
    mode: FulfillmentMode,
    store: StoreLocation?,
    onModeChange: (FulfillmentMode) -> Unit,
    onOpenStores: () -> Unit,
    modifier: Modifier = Modifier
) {
    val largeFont = LocalDensity.current.fontScale >= 1.3f
    Column(modifier = modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            FulfillmentMode.values().forEachIndexed { index, option ->
                SegmentedButton(
                    selected = mode == option,
                    onClick = { onModeChange(option) },
                    shape = SegmentedButtonDefaults.itemShape(index, FulfillmentMode.values().size),
                    icon = {
                        if (!largeFont) {
                            SegmentedButtonDefaults.Icon(active = mode == option) {
                                Icon(
                                    if (option == FulfillmentMode.SHIP) Icons.Default.LocalShipping else Icons.Default.Storefront,
                                    contentDescription = null,
                                    modifier = Modifier.size(SegmentedButtonDefaults.IconSize)
                                )
                            }
                        }
                    },
                    modifier = Modifier.semantics {
                        contentDescription = if (option == FulfillmentMode.SHIP) "Ship to me" else "Pick up in store"
                    }
                ) {
                    Text(option.label)
                }
            }
        }
        Surface(
            onClick = onOpenStores,
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .semantics {
                    role = Role.Button
                    contentDescription = store?.let { "Your store: ${it.name}. Change store" } ?: "Choose a store to see shelf stock"
                }
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                Icon(Icons.Default.Place, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    if (store != null) {
                        Text("Your store", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(store.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                    } else {
                        Text("Choose a store", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                        Text(
                            if (largeFont) "Switches to pickup" else "See its shelf stock · switches to pickup",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Spacer(Modifier.width(8.dp))
                Icon(Icons.Default.ExpandMore, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            }
        }
    }
}

/**
 * One scrollable chip row: an optional "Clear" chip, the in-stock toggle (ship mode) and the
 * discount floor. The selected discount chip is scrolled into view so a filter is never hidden.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DiscountChips(
    selected: DiscountFloor,
    onSelect: (DiscountFloor) -> Unit,
    showInStock: Boolean,
    inStockOnly: Boolean,
    onInStockOnly: (Boolean) -> Unit,
    showClear: Boolean,
    onClear: () -> Unit,
    modifier: Modifier = Modifier,
    clearDescription: String = "Clear filters"
) {
    val scroll = rememberScrollState()
    // Scroll just enough to show the active discount chip (only if it's off-screen).
    val selectedChip = remember { BringIntoViewRequester() }
    LaunchedEffect(selected) { selectedChip.bringIntoView() }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(scroll)
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showClear) {
            InputChip(
                selected = false,
                onClick = onClear,
                label = { Text("Clear") },
                trailingIcon = { Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(InputChipDefaults.IconSize)) },
                modifier = Modifier.semantics { contentDescription = clearDescription }
            )
        }
        if (showInStock) {
            FilterChip(
                selected = inStockOnly,
                onClick = { onInStockOnly(!inStockOnly) },
                label = { Text("In stock") },
                leadingIcon = if (inStockOnly) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) }
                } else null,
                modifier = Modifier.semantics { contentDescription = "Only items in stock online" }
            )
        }
        DiscountFloor.values().forEach { floor ->
            FilterChip(
                selected = selected == floor,
                onClick = { onSelect(floor) },
                label = { Text(if (floor == DiscountFloor.ANY) "Any discount" else "${floor.label} off") },
                leadingIcon = if (selected == floor) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) }
                } else null,
                modifier = Modifier
                    .then(if (selected == floor) Modifier.bringIntoViewRequester(selectedChip) else Modifier)
                    .semantics {
                        contentDescription = if (floor == DiscountFloor.ANY) "Any discount" else "At least ${floor.minPercent} percent off"
                    }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryChips(
    categories: List<String>,
    selected: String?,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
    changeCount: Int = 0,
    onlyChanges: Boolean = false,
    onOnlyChanges: (Boolean) -> Unit = {}
) {
    if (categories.isEmpty() && changeCount == 0) return
    // Keep a selected category visible even if it isn't in today's top list.
    val shown = if (selected != null && selected !in categories) listOf(selected) + categories else categories
    Row(
        modifier = modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (changeCount > 0) {
            FilterChip(
                selected = onlyChanges,
                onClick = { onOnlyChanges(!onlyChanges) },
                label = { Text("New & price drops ($changeCount)", maxLines = 1) },
                leadingIcon = {
                    Icon(
                        if (onlyChanges) Icons.Default.Check else Icons.Outlined.AutoAwesome,
                        contentDescription = null,
                        modifier = Modifier.size(FilterChipDefaults.IconSize)
                    )
                }
            )
        }
        shown.forEach { category ->
            FilterChip(
                selected = selected == category,
                onClick = { onToggle(category) },
                label = { Text(category, maxLines = 1) },
                leadingIcon = if (selected == category) {
                    { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) }
                } else null
            )
        }
    }
}

/**
 * Sticky row: "142 of 375 deals", the AI review button and the sort menu. Being sticky, the AI
 * action is always one tap away without a floating button covering card content.
 */
@Composable
fun SummaryRow(
    shown: Int,
    total: Int,
    sort: SortOption,
    onSort: (SortOption) -> Unit,
    aiCount: Int,
    onAskAi: () -> Unit,
    largeFont: Boolean,
    modifier: Modifier = Modifier
) {
    val askAi = @Composable { mod: Modifier ->
        FilledTonalButton(
            onClick = onAskAi,
            contentPadding = PaddingValues(horizontal = 12.dp),
            modifier = mod
                .heightIn(min = 36.dp)
                .semantics { contentDescription = "Ask an AI to review $aiCount deals" }
        ) {
            Icon(Icons.Default.Psychology, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(if (largeFont) "Ask an AI about $aiCount deals" else "Ask AI ($aiCount)", maxLines = 1)
        }
    }
    Column(modifier = modifier.padding(start = 16.dp, end = 4.dp, bottom = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                // Keep the noun when it fits; "142 of 375" alone stays on one line on narrow phones.
                text = when {
                    shown == total -> "$total deals"
                    "$shown$total".length <= 4 -> "$shown of $total deals"
                    else -> "$shown of $total"
                },
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Showing $shown of $total deals" }
            )
            if (aiCount > 0 && !largeFont) askAi(Modifier)
            SortMenu(sort, onSort)
        }
    }
}

/** Large-font version of the AI action: full width, scrolls with the list so the sticky row stays short. */
@Composable
fun AskAiWideButton(aiCount: Int, onAskAi: () -> Unit, modifier: Modifier = Modifier) {
    FilledTonalButton(
        onClick = onAskAi,
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 4.dp)
            .semantics { contentDescription = "Ask an AI to review $aiCount deals" }
    ) {
        Icon(Icons.Default.Psychology, contentDescription = null, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(8.dp))
        Text("Ask an AI about $aiCount deals")
    }
}

@Composable
private fun SortMenu(sort: SortOption, onSort: (SortOption) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        TextButton(
            onClick = { expanded = true },
            modifier = Modifier.semantics { contentDescription = "Sorted by ${sort.label}. Change sort order" }
        ) {
            Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text("Sort: ${sort.shortLabel}", maxLines = 1)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            SortOption.values().forEach { option ->
                DropdownMenuItem(
                    text = { Text(option.label, fontWeight = if (option == sort) FontWeight.Bold else FontWeight.Normal) },
                    leadingIcon = {
                        if (option == sort) Icon(Icons.Default.Check, contentDescription = "Selected")
                        else Spacer(Modifier.size(24.dp))
                    },
                    onClick = {
                        onSort(option)
                        expanded = false
                    }
                )
            }
        }
    }
}
