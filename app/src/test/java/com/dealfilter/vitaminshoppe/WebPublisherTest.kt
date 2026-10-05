package com.dealfilter.vitaminshoppe

import android.content.Context
import org.robolectric.RuntimeEnvironment
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WebPublisherTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val token = "0123456789abcdef0123"

    @Before
    fun clear() {
        context.getSharedPreferences("vs_web_share", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test
    fun builtInServerIsOnByDefault() {
        val s = WebPublisher(context, "dn.example.ts.net:10000/", token).state.value
        assertTrue(s.enabled)
        assertTrue(s.isConfigured)
        assertEquals("https://dn.example.ts.net:10000", s.serverUrl)
    }

    @Test
    fun noBuiltInServerStaysOff() {
        val s = WebPublisher(context, "", "").state.value
        assertFalse(s.enabled)
        assertFalse(s.isConfigured)
    }

    @Test
    fun userChoicesWinOverDefaults() {
        WebPublisher(context, "https://a.ts.net", token).setEnabled(false)
        assertFalse(WebPublisher(context, "https://a.ts.net", token).state.value.enabled)

        WebPublisher(context, "https://a.ts.net", token).configure("https://b.ts.net", "other-token-0123456", true)
        val s = WebPublisher(context, "https://a.ts.net", token).state.value
        assertEquals("https://b.ts.net", s.serverUrl)
        assertEquals("other-token-0123456", s.token)
    }

    @Test
    fun gitHubTargetsAreRecognised() {
        assertEquals("GrandpaTin" to "vs-clearance", WebPublisher.gitHubRepo("github.com/GrandpaTin/vs-clearance"))
        assertEquals("a" to "b.c", WebPublisher.gitHubRepo("https://github.com/a/b.c.git/"))
        assertEquals(null, WebPublisher.gitHubRepo("https://dn.example.ts.net:10000"))
        val s = WebPublisher(context, "github.com/GrandpaTin/vs-clearance", token).state.value
        assertTrue(s.isGitHub)
        assertEquals("https://grandpatin.github.io/vs-clearance/", s.viewUrl)
        assertEquals("https://dn.example.ts.net", WebPublisher(context, "", "").state.value.copy(serverUrl = "https://dn.example.ts.net").viewUrl)
    }
}
