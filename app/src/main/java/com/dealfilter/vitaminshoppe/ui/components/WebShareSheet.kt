package com.dealfilter.vitaminshoppe.ui.components

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.dealfilter.vitaminshoppe.data.remote.WebShareState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WebShareSheet(
    share: WebShareState,
    onSave: (url: String, token: String, enabled: Boolean) -> Unit,
    onToggle: (Boolean) -> Unit,
    onPublishNow: () -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var url by rememberSaveable { mutableStateOf(share.serverUrl) }
    var token by rememberSaveable { mutableStateOf(share.token) }
    val dirty = url.trim() != share.serverUrl || token.trim() != share.token

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            Text("Share to web", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                if (share.isConfigured && share.isGitHub) "Each refresh is published to your GitHub Pages site, so the shared link " +
                    "always shows these deals (about a minute after syncing). Tapping the cloud button syncs right away."
                else if (share.isConfigured) "Each refresh is sent to your web server, so the shared link always shows these deals. " +
                    "Tapping the cloud button syncs right away."
                else "Sends each refresh to your own VS Clearance web server so you can browse these deals on a PC or iPhone. " +
                    "Easiest setup: open the pairing link from the server's /setup page on this phone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .toggleable(value = share.enabled, enabled = share.isConfigured, role = Role.Switch, onValueChange = onToggle)
            ) {
                Text(
                    if (share.isConfigured) "Publish after every refresh" else "Publish after every refresh (add server first)",
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.weight(1f)
                )
                Switch(checked = share.enabled, onCheckedChange = null, enabled = share.isConfigured)
            }
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("Server or GitHub repo") },
                placeholder = { Text("github.com/you/vs-clearance") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = token,
                onValueChange = { token = it },
                label = { Text("Publish token") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )
            val status = when {
                share.isPublishing -> "Publishing…"
                share.lastError != null -> share.lastError
                share.lastPublishedAt != null && System.currentTimeMillis() - share.lastPublishedAt < DateUtils.MINUTE_IN_MILLIS ->
                    "Synced just now"
                share.lastPublishedAt != null -> "Last synced " + DateUtils.getRelativeTimeSpanString(
                    share.lastPublishedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS
                )
                else -> "Not published yet."
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (share.isPublishing) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.size(8.dp))
                }
                Text(
                    status,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (share.lastError != null && !share.isPublishing) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = { onSave(url, token, true) },
                    enabled = dirty && url.isNotBlank() && token.isNotBlank(),
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp)
                ) { Text("Save") }
                Button(
                    onClick = {
                        if (dirty) onSave(url, token, true)
                        onPublishNow()
                    },
                    enabled = url.isNotBlank() && token.isNotBlank() && !share.isPublishing,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp)
                ) { Text("Publish now") }
            }
            if (share.serverUrl.isNotBlank()) {
                OutlinedButton(
                    onClick = { openProductPage(context, share.viewUrl) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) { Text("Open the web app") }
            }
        }
    }
}
