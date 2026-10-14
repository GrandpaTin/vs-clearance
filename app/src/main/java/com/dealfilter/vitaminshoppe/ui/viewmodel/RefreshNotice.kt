package com.dealfilter.vitaminshoppe.ui.viewmodel

import android.text.format.DateUtils

/** A list older than this is refreshed when the app comes back, and flagged on screen until it is. */
const val STALE_AFTER_MS = 30 * 60_000L

/** Why the deals on screen aren't fresh, and the one tap that fixes it. */
data class RefreshNotice(val kind: Kind, val title: String, val detail: String, val action: String) {
    enum class Kind { VERIFY, OFFLINE, FAILED, STALE }
}

/** Null when the list is fresh or a refresh is already under way (the header says so then). */
fun refreshNotice(s: DealUiState, now: Long): RefreshNotice? {
    if (s.status != LoadStatus.IDLE || !s.hasData) return null
    val updated = s.lastUpdatedMillis
    val saved = if (updated == null || now - updated < -60_000) "Showing saved deals" else "Showing deals saved ${ago(updated, now)}"
    // The header already says how recent the list is; the banner only repeats it once it matters.
    // A time in the future (clock was ahead when saved) is an unknown age: treat it as old.
    val future = updated != null && now - updated < -60_000
    val recent = updated != null && !future && now - updated < STALE_AFTER_MS
    return when {
        s.needsVerification -> RefreshNotice(
            RefreshNotice.Kind.VERIFY, "Vitamin Shoppe wants a quick check before it shows new prices", saved, "Check now"
        )
        s.loadError != null && s.loadErrorIsOffline -> RefreshNotice(
            RefreshNotice.Kind.OFFLINE, "You're offline", if (recent) "Deals refresh when you reconnect" else "$saved · they'll refresh when you reconnect", "Retry"
        )
        s.loadError != null -> RefreshNotice(
            RefreshNotice.Kind.FAILED, "Couldn't refresh", if (recent) "${s.loadError.trimEnd('.')}." else "${s.loadError.trimEnd('.')}. $saved.", "Retry"
        )
        updated != null && (future || now - updated >= STALE_AFTER_MS) -> RefreshNotice(
            RefreshNotice.Kind.STALE, "These prices may be out of date", saved, "Refresh"
        )
        else -> null
    }
}

/**
 * "5 minutes ago", "3 hours ago", "9 days ago", then a date. Android's own formatter switches to a
 * bare date after a week ("saved Oct 6"), which hides how old a list really is.
 */
fun ago(then: Long, now: Long): String {
    val d = (now - then).coerceAtLeast(0)
    fun plural(n: Long, unit: String) = if (n == 1L) "1 $unit ago" else "$n ${unit}s ago"
    return when {
        d < DateUtils.MINUTE_IN_MILLIS -> "just now"
        d < DateUtils.HOUR_IN_MILLIS -> plural(d / DateUtils.MINUTE_IN_MILLIS, "minute")
        d < DateUtils.DAY_IN_MILLIS -> plural(d / DateUtils.HOUR_IN_MILLIS, "hour")
        d < 31 * DateUtils.DAY_IN_MILLIS -> plural(d / DateUtils.DAY_IN_MILLIS, "day")
        else -> "on " + java.text.SimpleDateFormat("MMM d", java.util.Locale.getDefault()).format(java.util.Date(then))
    }
}
