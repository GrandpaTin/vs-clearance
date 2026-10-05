package com.dealfilter.vitaminshoppe.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

@Immutable
data class SemanticBadgeColors(
    val emeraldContainer: Color,
    val onEmeraldContainer: Color,
    val skyBlueContainer: Color,
    val onSkyBlueContainer: Color,
    val redContainer: Color,
    val onRedContainer: Color,
    val amberContainer: Color,
    val onAmberContainer: Color,
    /** Sale-price text; darker than the brand emerald so it passes WCAG AA on cards. */
    val price: Color,
    val isDark: Boolean = false,
)

val LocalBadgeColors = staticCompositionLocalOf {
    SemanticBadgeColors(
        emeraldContainer = EmeraldContainerLight,
        onEmeraldContainer = OnEmeraldContainerLight,
        skyBlueContainer = SkyBlueContainerLight,
        onSkyBlueContainer = OnSkyBlueContainerLight,
        redContainer = RedContainerLight,
        onRedContainer = OnRedContainerLight,
        amberContainer = AmberContainerLight,
        onAmberContainer = OnAmberContainerLight,
        price = PriceLight,
    )
}

object DealTheme {
    val badges: SemanticBadgeColors
        @Composable
        get() = LocalBadgeColors.current
}

private val DarkBadgeColors = SemanticBadgeColors(
    emeraldContainer = EmeraldContainerDark,
    onEmeraldContainer = OnEmeraldContainerDark,
    skyBlueContainer = SkyBlueContainerDark,
    onSkyBlueContainer = OnSkyBlueContainerDark,
    redContainer = RedContainerDark,
    onRedContainer = OnRedContainerDark,
    amberContainer = AmberContainerDark,
    onAmberContainer = OnAmberContainerDark,
    price = PriceDark,
    isDark = true,
)

private val LightBadgeColors = SemanticBadgeColors(
    emeraldContainer = EmeraldContainerLight,
    onEmeraldContainer = OnEmeraldContainerLight,
    skyBlueContainer = SkyBlueContainerLight,
    onSkyBlueContainer = OnSkyBlueContainerLight,
    redContainer = RedContainerLight,
    onRedContainer = OnRedContainerLight,
    amberContainer = AmberContainerLight,
    onAmberContainer = OnAmberContainerLight,
    price = PriceLight,
)

private val DarkColorScheme = darkColorScheme(
    primary = SkyBlueSecondary,
    onPrimary = NavyDark,
    primaryContainer = NavyLight,
    onPrimaryContainer = SkyBlueLight,
    secondary = SkyBlueSecondary,
    onSecondary = NavyDark,
    secondaryContainer = SkyBlueContainerDark,
    onSecondaryContainer = OnSkyBlueContainerDark,
    tertiary = EmeraldDeal,
    onTertiary = NavyDark,
    tertiaryContainer = EmeraldContainerDark,
    onTertiaryContainer = OnEmeraldContainerDark,
    error = RedOutOfStock,
    onError = Color.White,
    errorContainer = RedContainerDark,
    onErrorContainer = OnRedContainerDark,
    background = BackgroundDark,
    onBackground = TextPrimaryDark,
    surface = SurfaceDark,
    onSurface = TextPrimaryDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = TextSecondaryDark,
    outline = DividerDark,
    outlineVariant = Color(0xFF1F2A3C)
)

private val LightColorScheme = lightColorScheme(
    primary = NavyPrimary,
    onPrimary = SurfaceLight,
    primaryContainer = SkyBlueLight,
    onPrimaryContainer = NavyPrimary,
    secondary = SkyBlueSecondary,
    onSecondary = SurfaceLight,
    secondaryContainer = SkyBlueContainerLight,
    onSecondaryContainer = OnSkyBlueContainerLight,
    tertiary = EmeraldDeal,
    onTertiary = SurfaceLight,
    tertiaryContainer = EmeraldContainerLight,
    onTertiaryContainer = OnEmeraldContainerLight,
    error = RedOutOfStock,
    onError = Color.White,
    errorContainer = RedContainerLight,
    onErrorContainer = OnRedContainerLight,
    background = BackgroundLight,
    onBackground = TextPrimaryLight,
    surface = SurfaceLight,
    onSurface = TextPrimaryLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = TextSecondaryLight,
    // Chip and field outlines need ~1.5:1 against the page to be visible.
    outline = Color(0xFFCBD5E1),
    outlineVariant = DividerLight
)

@Composable
fun VitaminShoppeDealsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val badgeColors = if (darkTheme) DarkBadgeColors else LightBadgeColors
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = if (darkTheme) NavyDark.toArgb() else NavyPrimary.toArgb()
            window.navigationBarColor = colorScheme.surface.toArgb()
            val insets = WindowCompat.getInsetsController(window, view)
            // The status bar is navy (light theme) or near-black (dark theme): always use light icons.
            insets.isAppearanceLightStatusBars = false
            insets.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    CompositionLocalProvider(LocalBadgeColors provides badgeColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
