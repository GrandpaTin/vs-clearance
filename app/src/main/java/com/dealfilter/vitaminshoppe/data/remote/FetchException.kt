package com.dealfilter.vitaminshoppe.data.remote

/** Every way a request to vitaminshoppe.com can fail, phrased for the person using the app. */
sealed class FetchException(message: String) : Exception(message) {
    class Offline : FetchException("Connect to the internet and try again.")
    class VerificationRequired : FetchException("Vitamin Shoppe wants to confirm you're not a bot.")
    class Timeout : FetchException("Vitamin Shoppe took too long to respond.")
    class Http(val code: Int) : FetchException(
        if (code >= 500) "Vitamin Shoppe's servers are having trouble (error $code)."
        else "Vitamin Shoppe refused the request (error $code)."
    )
    class Network(detail: String) : FetchException("Couldn't reach vitaminshoppe.com. $detail".trim())
    class BadData(detail: String) : FetchException(detail)
}

/** Fetches a URL and returns the response body. Implemented by [WebSession]; faked in tests. */
interface JsonFetcher {
    @Throws(FetchException::class)
    suspend fun getJson(url: String): String
}
