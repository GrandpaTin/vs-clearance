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
        if (savedInstanceState == null) viewModel.handlePairingLink(intent?.data)
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
    }

    override fun onStart() {
        super.onStart()
        (application as VitaminShoppeApp).webSession.setForeground(true)
    }

    override fun onStop() {
        (application as VitaminShoppeApp).webSession.setForeground(false)
        super.onStop()
    }
}
