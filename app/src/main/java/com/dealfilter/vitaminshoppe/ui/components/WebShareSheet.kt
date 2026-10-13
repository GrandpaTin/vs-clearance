package com.dealfilter.vitaminshoppe.ui.components

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudQueue
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebShareState
import com.dealfilter.vitaminshoppe.ui.viewmodel.ago

/** What the sheet says about sharing right now, in plain words. */
fun shareStatusText(share: WebShareState, now: Long): String = when (share.status) {
    WebShareState.Status.NOT_SET_UP -> "Not set up — the app works fine without it."
    WebShareState.Status.OFF -> "Sharing is off."
    WebShareState.Status.SYNCING -> "Syncing…"
    WebShareState.Status.WAITING -> share.pendingReason ?: "Will sync when online"
    WebShareState.Status.ERROR -> share.lastError ?: "Couldn't sync."
    WebShareState.Status.LIVE -> {
        val at = share.lastPublishedAt ?: now
        if (share.isGitHub && now - at < 2 * 60_000L) "Live on the site in about a minute"
        else "Live on the site · synced ${ago(at, now)}"
    }
    WebShareState.Status.READY -> "Ready — tap Publish now."
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WebShareSheet(
    share: WebShareState,
    onSave: (gitHubRepo: String, gitHubToken: String, serverUrl: String, serverToken: String, enabled: Boolean) -> Unit,
    onToggle: (Boolean) -> Unit,
    onPublishNow: () -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var repo by rememberSaveable { mutableStateOf(share.gitHubRepo.removePrefix("https://")) }
    var repoToken by rememberSaveable { mutableStateOf(share.gitHubToken) }
    var server by rememberSaveable { mutableStateOf(share.serverUrl) }
    var serverToken by rememberSaveable { mutableStateOf(share.serverToken) }
    var showServer by rememberSaveable { mutableStateOf(share.serverUrl.isNotBlank() && !share.hasGitHub) }
    val dirty = WebPublisher.normalizeUrl(repo) != share.gitHubRepo || repoToken.trim() != share.gitHubToken ||
        WebPublisher.normalizeUrl(server) != share.serverUrl || serverToken.trim() != share.serverToken
    val canPublish = (repo.isNotBlank() && repoToken.isNotBlank()) || (server.isNotBlank() && serverToken.isNotBlank())
    val now = System.currentTimeMillis()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(bottom = 16.dp)
        ) {
            Text("Share to web", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Optional. Publishes each refresh so friends can open these deals from a link — on a PC or iPhone, " +
                    "even when this phone is off. The app itself never needs it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            StatusRow(share, now)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .toggleable(value = share.enabled, enabled = share.isConfigured, role = Role.Switch, onValueChange = onToggle)
            ) {
                Text("Publish after every refresh", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Switch(checked = share.enabled, onCheckedChange = null, enabled = share.isConfigured)
            }

            Text("GitHub Pages (recommended)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = repo,
                onValueChange = { repo = it },
                label = { Text("GitHub repo") },
                placeholder = { Text("github.com/you/vs-clearance") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = repoToken,
                onValueChange = { repoToken = it },
                label = { Text("GitHub token") },
                supportingText = { Text("Fine-grained token for that repo only, with Contents: Read and write.") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth()
            )

            TextButton(onClick = { showServer = !showServer }, modifier = Modifier.heightIn(min = 48.dp)) {
                Icon(if (showServer) Icons.Default.ExpandLess else Icons.Default.ExpandMore, contentDescription = null)
                Spacer(Modifier.size(6.dp))
                Text(if (share.hasGitHub) "Your own server (used only without GitHub)" else "Your own server (optional)")
            }
            if (showServer) {
                OutlinedTextField(
                    value = server,
                    onValueChange = { server = it },
                    label = { Text("Server address") },
                    placeholder = { Text("https://your-pc.tailnet.ts.net:10000") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = serverToken,
                    onValueChange = { serverToken = it },
                    label = { Text("Server token") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = { onSave(repo, repoToken, server, serverToken, share.enabled || !share.isConfigured) },
                    enabled = dirty,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp)
                ) { Text("Save") }
                Button(
                    onClick = {
                        if (dirty) onSave(repo, repoToken, server, serverToken, share.enabled || !share.isConfigured)
                        onPublishNow()
                    },
                    enabled = canPublish && !share.isPublishing,
                    modifier = Modifier.weight(1f).heightIn(min = 48.dp)
                ) { Text("Publish now") }
            }
            if (share.isConfigured && share.viewUrl.isNotBlank()) {
                OutlinedButton(
                    onClick = { openProductPage(context, share.viewUrl) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                ) { Text("Open the web app") }
            }
        }
    }
}

@Composable
private fun StatusRow(share: WebShareState, now: Long) {
    val error = share.status == WebShareState.Status.ERROR
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (share.isPublishing) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
        } else {
            Icon(
                when (share.status) {
                    WebShareState.Status.LIVE -> Icons.Default.CloudDone
                    WebShareState.Status.WAITING -> Icons.Default.CloudQueue
                    WebShareState.Status.ERROR -> Icons.Default.ErrorOutline
                    else -> Icons.Default.CloudOff
                },
                contentDescription = null,
                tint = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
        }
        Spacer(Modifier.size(10.dp))
        Text(
            shareStatusText(share, now),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
        )
    }
}
