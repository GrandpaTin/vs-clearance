package com.dealfilter.vitaminshoppe.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dealfilter.vitaminshoppe.data.remote.WebSession

/**
 * Full-screen dialog that shows the app's hidden vitaminshoppe.com tab when the site asks for a
 * human check. The user completes it themselves; the dialog closes on its own once the page
 * loads normally, or they can tap Continue.
 */
@Composable
fun VerificationDialog(
    session: WebSession,
    onContinue: () -> Unit,
    onReload: () -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    DisposableEffect(session) {
        onDispose { session.detachFromDisplay() }
    }
    // The check may have been loaded in the background with resources skipped; load it fresh now
    // that it's on screen, so the slider/puzzle renders at the visible size with everything allowed.
    LaunchedEffect(session) {
        delay(150)
        session.refreshForDisplay()
    }
    Dialog(
        onDismissRequest = onCancel,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)
    ) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            Column(modifier = Modifier.safeDrawingPadding()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(start = 16.dp, end = 4.dp, top = 8.dp)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Quick check from Vitamin Shoppe", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "The site wants to confirm a person is browsing. Complete the check below — we'll continue automatically.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
                AndroidView(
                    factory = { session.attachForDisplay(context) ?: android.view.View(context) },
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(top = 8.dp)
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    OutlinedButton(onClick = onReload, modifier = Modifier.weight(1f)) { Text("Reload page") }
                    Button(onClick = onContinue, modifier = Modifier.weight(1f)) { Text("Continue") }
                }
            }
        }
    }
}
