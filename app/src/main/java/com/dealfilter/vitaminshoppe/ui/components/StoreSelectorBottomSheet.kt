package com.dealfilter.vitaminshoppe.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.dealfilter.vitaminshoppe.data.model.StoreLocation
import com.dealfilter.vitaminshoppe.ui.theme.DealTheme
import com.dealfilter.vitaminshoppe.ui.viewmodel.StoreSheetState
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoreSelectorBottomSheet(
    sheet: StoreSheetState,
    selectedStore: StoreLocation?,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelect: (StoreLocation) -> Unit,
    onClearStore: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val keyboard = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }
    // Nothing to show until a ZIP or city is entered, so open ready to type.
    LaunchedEffect(Unit) {
        if (sheet.query.isBlank()) {
            delay(250)
            runCatching { focusRequester.requestFocus() }
            keyboard?.show()
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            Text("Choose your store", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "We'll check which clearance items are on the shelf there.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.size(12.dp))

            OutlinedTextField(
                value = sheet.query,
                onValueChange = onQueryChange,
                label = { Text("ZIP code or city, state") },
                placeholder = { Text("e.g. 33701 or Tampa, FL") },
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    when {
                        sheet.isSearching -> CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        sheet.query.isNotEmpty() -> IconButton(onClick = { onQueryChange("") }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear")
                        }
                    }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, capitalization = KeyboardCapitalization.Words),
                keyboardActions = KeyboardActions(onSearch = {
                    keyboard?.hide()
                    onSearch()
                }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focusRequester)
            )

            sheet.message?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            Spacer(Modifier.size(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp, max = 420.dp)
            ) {
                when {
                    sheet.results.isNotEmpty() -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(sheet.results, key = { it.storeId }) { store ->
                            StoreRow(store, isSelected = store.storeId == selectedStore?.storeId, onSelect = onSelect)
                        }
                    }
                    sheet.isSearching -> Unit
                    !sheet.hasSearched -> Text(
                        "Search to see nearby stores, their hours and distance.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(16.dp)
                    )
                }
            }

            if (selectedStore != null) {
                Spacer(Modifier.size(12.dp))
                OutlinedButton(onClick = onClearStore, modifier = Modifier.fillMaxWidth()) {
                    Text("Clear store · ship to home only")
                }
            }
        }
    }
}

@Composable
private fun StoreRow(store: StoreLocation, isSelected: Boolean, onSelect: (StoreLocation) -> Unit) {
    val badges = DealTheme.badges
    val context = LocalContext.current
    val enabled = store.isSelectable
    val unavailableReason = when {
        store.temporarilyClosed -> "Temporarily closed"
        !store.pickupEnabled -> "No in-store pickup"
        else -> null
    }
    Surface(
        onClick = { onSelect(store) },
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) badges.skyBlueContainer else MaterialTheme.colorScheme.surfaceVariant,
        border = if (isSelected) BorderStroke(2.dp, badges.onSkyBlueContainer) else null,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                stateDescription = when {
                    isSelected -> "Selected"
                    unavailableReason != null -> unavailableReason
                    else -> "Not selected"
                }
            }
    ) {
        Row(modifier = Modifier.padding(start = 12.dp, top = 12.dp, bottom = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        store.name,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (isSelected) {
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = badges.onSkyBlueContainer, modifier = Modifier.size(18.dp))
                    }
                }
                Text(store.streetLine, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(store.cityLine, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                val today = todaysHours(store.hours)
                val status = unavailableReason ?: store.statusMessage?.takeIf { it.isNotBlank() } ?: today
                status?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.labelMedium,
                        color = if (unavailableReason != null) badges.onRedContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                if (store.formattedDistance.isNotEmpty()) {
                    Text(store.formattedDistance, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                }
                store.phone?.let { phone ->
                    IconButton(onClick = { dialStore(context, phone) }) {
                        Icon(Icons.Default.Phone, contentDescription = "Call ${store.name} at $phone", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

/** Picks today's line from "Sunday: 9 AM – 7 PM", "Monday - Friday: …", "Saturday: …". */
internal fun todaysHours(lines: List<String>, calendar: Calendar = Calendar.getInstance()): String? {
    if (lines.isEmpty()) return null
    val days = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
    val todayIndex = calendar.get(Calendar.DAY_OF_WEEK) - 1
    for (line in lines) {
        val label = line.substringBefore(':').trim()
        val hours = line.substringAfter(':', "").trim()
        val parts = label.split(Regex("\\s*[-–]\\s*")).map { p -> days.indexOfFirst { it.equals(p.trim(), ignoreCase = true) } }
        val matches = when (parts.size) {
            1 -> parts[0] == todayIndex
            2 -> parts[0] >= 0 && parts[1] >= 0 && todayIndex in parts[0]..parts[1]
            else -> false
        }
        if (matches && hours.isNotEmpty()) return "Today: $hours"
    }
    return null
}
