package com.dealfilter.vitaminshoppe

import android.app.Application
import com.dealfilter.vitaminshoppe.data.remote.JsonFetcher
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebSession
import com.dealfilter.vitaminshoppe.data.update.AppUpdater

open class VitaminShoppeApp : Application() {
    /** One browser session for the whole process so the site's cookies and checks carry over. */
    val webSession: WebSession by lazy { WebSession(this) }
    open val webPublisher: WebPublisher by lazy { WebPublisher(this) }
    open val updater: AppUpdater by lazy { AppUpdater(this) }

    /** Where deal data comes from; tests swap in a fake. */
    open val fetcher: JsonFetcher get() = webSession
}
