package com.dealfilter.vitaminshoppe

import android.app.Application
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebSession

class VitaminShoppeApp : Application() {
    /** One browser session for the whole process so the site's cookies and checks carry over. */
    val webSession: WebSession by lazy { WebSession(this) }
    val webPublisher: WebPublisher by lazy { WebPublisher(this) }
}
