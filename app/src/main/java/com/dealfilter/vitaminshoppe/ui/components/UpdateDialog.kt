package com.dealfilter.vitaminshoppe.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dealfilter.vitaminshoppe.data.update.UpdateState

/** Release notes as plain lines: Markdown bullets and headings read fine without the markup. */
fun plainNotes(notes: String): String =
    notes.lines().joinToString("\n") { it.trim().removePrefix("#").removePrefix("#").trim().replace(Regex("^[-*] "), "• ") }
        .replace(Regex("\n{3,}"), "\n\n").trim()

@Composable
fun UpdateDialog(
    update: UpdateState,
    onUpdate: () -> Unit,
    onOpenSettings: () -> Unit,
    onLater: () -> Unit,
    onDismiss: () -> Unit
) {
    val release = update.available ?: return
    val downloading = update.progress != null
    val sizeMb = if (release.apkBytes > 0) " · %.0f MB".format(release.apkBytes / 1_048_576.0) else ""
    AlertDialog(
        onDismissRequest = { if (!downloading) onDismiss() },
        title = { Text("Update to ${release.versionName}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val notes = plainNotes(release.notes)
                if (notes.isNotBlank()) {
                    Text("What's new", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(
                        notes,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())
                    )
                }
                when {
                    downloading -> {
                        val pct = ((update.progress ?: 0f) * 100).toInt()
                        Text("Downloading… $pct%", style = MaterialTheme.typography.bodyMedium)
                        LinearProgressIndicator(
                            progress = { update.progress ?: 0f },
                            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Downloading update, $pct percent" }
                        )
                    }
                    update.needsInstallPermission -> Text(
                        "Android asks once before an app can install its own updates. Tap Open settings, turn on " +
                            "“Allow from this source”, then come back — the update continues by itself.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    update.error != null -> Text(update.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                    update.readyToInstall -> Text("Downloaded. Android will ask you to confirm the install.", style = MaterialTheme.typography.bodyMedium)
                    else -> Text("Downloads inside the app$sizeMb. Your filters, store and saved deals stay as they are.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {
            when {
                downloading -> Unit
                update.needsInstallPermission -> Button(onClick = onOpenSettings) { Text("Open settings") }
                else -> Button(onClick = onUpdate) {
                    Text(
                        when {
                            update.error != null -> "Try again"
                            update.readyToInstall -> "Install"
                            else -> "Update now"
                        }
                    )
                }
            }
        },
        dismissButton = {
            if (!downloading) TextButton(onClick = onLater) { Text("Later") }
        }
    )
}
