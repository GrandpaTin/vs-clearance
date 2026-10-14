package com.dealfilter.vitaminshoppe

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.dealfilter.vitaminshoppe.ui.screens.DealScreen
import com.dealfilter.vitaminshoppe.ui.theme.VitaminShoppeDealsTheme
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: DealViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Recents re-delivers the original link intent: only a fresh launch from the link counts.
        val fromHistory = (intent?.flags ?: 0) and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
        if (savedInstanceState == null && !fromHistory) viewModel.handlePairingLink(intent?.data)
        consumeLink()
        val debuggable = (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        if (debuggable && intent?.getBooleanExtra("debug_challenge_layout", false) == true) {
            (application as VitaminShoppeApp).webSession.debugShowChallengeLayout()
        }
        setContent {
            VitaminShoppeDealsTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    DealScreen(viewModel = viewModel)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        viewModel.handlePairingLink(intent.data)
        setIntent(intent)
        consumeLink()
    }

    /** The link has been offered; drop it so a later recreate can't offer it again. */
    private fun consumeLink() {
        intent?.let { if (it.data != null) setIntent(Intent(it).setData(null)) }
    }

    override fun onStart() {
        super.onStart()
        (application as VitaminShoppeApp).webSession.setForeground(true)
        viewModel.onAppForeground()
    }

    override fun onStop() {
        // A rotation or theme change stops and restarts the activity; that isn't leaving the app.
        if (!isChangingConfigurations) viewModel.onAppBackground() else viewModel.onConfigurationChanging()
        (application as VitaminShoppeApp).webSession.setForeground(false)
        super.onStop()
    }
}
