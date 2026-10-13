package com.dealfilter.vitaminshoppe

import com.dealfilter.vitaminshoppe.data.update.AppUpdater
import com.dealfilter.vitaminshoppe.ui.components.plainNotes
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** GitHub's "latest release" JSON, the way scripts/release.mjs publishes it. */
class AppUpdaterTest {

    private fun release(body: String, assets: List<Pair<String, String>> = listOf("VS-Clearance.apk" to "https://github.com/x/releases/download/v3.1.0/VS-Clearance.apk"),
                        draft: Boolean = false) = JSONObject()
        .put("tag_name", "v3.1.0")
        .put("html_url", "https://github.com/GrandpaTin/vs-clearance/releases/tag/v3.1.0")
        .put("draft", draft)
        .put("prerelease", false)
        .put("body", body)
        .put("assets", JSONArray().apply { assets.forEach { (n, u) -> put(JSONObject().put("name", n).put("browser_download_url", u).put("size", 17_000_000)) } })
        .toString()

    @Test
    fun `reads version, notes without the hidden build number, and the APK`() {
        val r = AppUpdater.parseRelease(release("## What's new\n- Lists refresh again\n\n<!-- versionCode: 26101318 -->"))!!
        assertEquals(26101318, r.versionCode)
        assertEquals("3.1.0", r.versionName)
        assertEquals("## What's new\n- Lists refresh again", r.notes)
        assertEquals("https://github.com/x/releases/download/v3.1.0/VS-Clearance.apk", r.apkUrl)
        assertEquals(17_000_000L, r.apkBytes)
    }

    @Test
    fun `releases it can't use are ignored`() {
        assertNull("no build number", AppUpdater.parseRelease(release("notes")))
        assertNull("no APK", AppUpdater.parseRelease(release("<!-- versionCode: 5 -->", assets = listOf("source.zip" to "https://x/s.zip"))))
        assertNull("draft", AppUpdater.parseRelease(release("<!-- versionCode: 5 -->", draft = true)))
        assertNull("not https", AppUpdater.parseRelease(release("<!-- versionCode: 5 -->", assets = listOf("VS-Clearance.apk" to "http://x/a.apk"))))
    }

    @Test
    fun `notes read cleanly without Markdown`() {
        assertEquals("What's new\n• Lists refresh again\n• Updates install in-app", plainNotes("## What's new\n- Lists refresh again\n* Updates install in-app\n\n\n"))
    }
}
