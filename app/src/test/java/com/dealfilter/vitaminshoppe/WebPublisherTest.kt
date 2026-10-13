package com.dealfilter.vitaminshoppe

import android.content.Context
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.remote.WebShareState
import com.dealfilter.vitaminshoppe.ui.components.shareStatusText
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class WebPublisherTest {
    private val context: Context = RuntimeEnvironment.getApplication()
    private val token = "0123456789abcdef0123"
    private val prefs get() = context.getSharedPreferences("vs_web_share", Context.MODE_PRIVATE)

    private fun publisher(server: String = "", serverToken: String = "", repo: String = "", repoToken: String = "") =
        WebPublisher(context, server, serverToken, repo, repoToken)

    @Before
    fun clear() {
        prefs.edit().clear().commit()
    }

    @Test
    fun `a built-in server is on by default and saved for later builds`() {
        val s = publisher(server = "dn.example.ts.net:10000/", serverToken = token).state.value
        assertTrue(s.enabled)
        assertTrue(s.isConfigured)
        assertFalse(s.isGitHub)
        assertEquals("https://dn.example.ts.net:10000", s.serverUrl)
        // A later build without defaults (the public APK) keeps them.
        val after = publisher().state.value
        assertEquals("https://dn.example.ts.net:10000", after.serverUrl)
        assertTrue(after.enabled)
    }

    @Test
    fun `nothing built in means sharing is off and the app says it's optional`() {
        val s = publisher().state.value
        assertFalse(s.enabled)
        assertFalse(s.isConfigured)
        assertEquals(WebShareState.Status.NOT_SET_UP, s.status)
        assertTrue(shareStatusText(s, 0).startsWith("Not set up"))
    }

    @Test
    fun `GitHub Pages is preferred when both are set up`() {
        val s = publisher(server = "https://a.ts.net", serverToken = token, repo = "github.com/GrandpaTin/vs-clearance", repoToken = token).state.value
        assertTrue(s.isGitHub)
        assertEquals("https://grandpatin.github.io/vs-clearance/", s.viewUrl)
    }

    @Test
    fun `a repo without a token isn't GitHub yet, and the server is used`() {
        val s = publisher(server = "https://a.ts.net", serverToken = token, repo = "github.com/GrandpaTin/vs-clearance").state.value
        assertFalse(s.isGitHub)
        assertTrue(s.isConfigured)
        assertEquals("https://a.ts.net", s.viewUrl)
    }

    @Test
    fun `user choices win over defaults`() {
        publisher(server = "https://a.ts.net", serverToken = token).setEnabled(false)
        assertFalse(publisher(server = "https://a.ts.net", serverToken = token).state.value.enabled)

        publisher().configure("github.com/me/deals", "gh-token-0123456789", "https://b.ts.net", "other-token-0123456", true)
        val s = publisher(server = "https://a.ts.net", serverToken = token).state.value
        assertEquals("https://github.com/me/deals", s.gitHubRepo)
        assertEquals("https://b.ts.net", s.serverUrl)
        assertEquals("other-token-0123456", s.serverToken)
    }

    @Test
    fun `the old single-target settings move into the right slot`() {
        prefs.edit().putString("url", "https://github.com/me/deals").putString("token", token).commit()
        val s = publisher().state.value
        assertEquals("https://github.com/me/deals", s.gitHubRepo)
        assertEquals(token, s.gitHubToken)
        assertFalse(prefs.contains("url"))
    }

    @Test
    fun `an unreachable server is kept for later, not shown as an error`() = runBlocking {
        // Port 9 on localhost refuses connections immediately.
        val p = publisher(server = "https://127.0.0.1:9", serverToken = token)
        p.publish(emptyList(), 0L, null, null, emptyMap())
        val s = p.state.value
        assertTrue(s.pending)
        assertNull(s.lastError)
        // The reason names what's missing: here the owner's server, not the internet.
        assertEquals("Will sync when 127.0.0.1 is reachable", shareStatusText(s, 0))
        assertTrue(prefs.getBoolean("pending", false))
    }

    @Test
    fun `GitHub targets are recognised`() {
        assertEquals("GrandpaTin" to "vs-clearance", WebPublisher.gitHubRepo("github.com/GrandpaTin/vs-clearance"))
        assertEquals("a" to "b.c", WebPublisher.gitHubRepo("https://github.com/a/b.c.git/"))
        assertEquals(null, WebPublisher.gitHubRepo("https://dn.example.ts.net:10000"))
    }
}
