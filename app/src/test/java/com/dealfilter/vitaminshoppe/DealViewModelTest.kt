package com.dealfilter.vitaminshoppe

import android.os.Looper
import com.dealfilter.vitaminshoppe.data.local.CachedDeals
import com.dealfilter.vitaminshoppe.data.local.LocalStore
import com.dealfilter.vitaminshoppe.data.remote.FetchException
import com.dealfilter.vitaminshoppe.data.remote.JsonFetcher
import com.dealfilter.vitaminshoppe.data.remote.VsApi
import com.dealfilter.vitaminshoppe.data.remote.WebPublisher
import com.dealfilter.vitaminshoppe.data.update.AppUpdater
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealUiState
import com.dealfilter.vitaminshoppe.ui.viewmodel.DealViewModel
import com.dealfilter.vitaminshoppe.ui.viewmodel.LoadStatus
import com.dealfilter.vitaminshoppe.ui.viewmodel.RefreshNotice
import com.dealfilter.vitaminshoppe.ui.viewmodel.refreshNotice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.atomic.AtomicInteger

fun fakeSite(block: suspend (String) -> String): JsonFetcher = object : JsonFetcher {
    override suspend fun getJson(url: String): String = block(url)
}

/** The app swaps in a fake site and a publisher that never touches the network. */
class TestApp : VitaminShoppeApp() {
    var fake: JsonFetcher = fakeSite { error("no fetcher set") }
    // Forwards at call time, so a test can change what the site answers mid-way.
    override val fetcher: JsonFetcher = fakeSite { url -> fake.getJson(url) }
    override val webPublisher: WebPublisher by lazy { WebPublisher(this, "", "", "", "") }
    override val updater: AppUpdater by lazy { AppUpdater(this, latestUrl = "https://127.0.0.1:9/") }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = TestApp::class)
class DealViewModelTest {
    private val app = RuntimeEnvironment.getApplication() as TestApp
    private val listing = fixture("clearance_page.json")
    private val calls = AtomicInteger()

    private fun fixture(name: String): String =
        requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

    @Before
    fun reset() {
        app.getSharedPreferences("vs_deals", 0).edit().clear().commit()
        app.filesDir.listFiles()?.forEach { it.delete() }
        calls.set(0)
        app.fake = fakeSite { calls.incrementAndGet(); listing }
    }

    private fun saveList(ageMillis: Long) {
        val items = VsApi.dedupe(VsApi.parseClearancePage(listing).items)
        LocalStore(app).saveCache(CachedDeals(items, System.currentTimeMillis() - ageMillis, null, emptyMap()))
    }

    /** Runs the main looper (and lets the IO restore finish) until [done] or 5 s pass. */
    private fun DealViewModel.awaitState(done: (DealUiState) -> Boolean): DealUiState {
        val end = System.currentTimeMillis() + 5_000
        while (System.currentTimeMillis() < end) {
            shadowOf(Looper.getMainLooper()).idle()
            if (done(uiState.value)) return uiState.value
            Thread.sleep(10)
        }
        return uiState.value
    }

    @Test
    fun `a week-old list refreshes as soon as the app is opened`() {
        saveList(ageMillis = 7 * 24 * 3600_000L)
        val vm = DealViewModel(app)
        vm.onAppForeground()
        val s = vm.awaitState { it.status == LoadStatus.IDLE && !it.isShowingSavedData }
        assertTrue("fetched", calls.get() >= 1)
        assertFalse(s.isShowingSavedData)
        assertTrue(System.currentTimeMillis() - (s.lastUpdatedMillis ?: 0) < 60_000)
        assertNull(refreshNotice(s, System.currentTimeMillis()))
    }

    @Test
    fun `a list saved a few minutes ago is shown without asking the site again`() {
        saveList(ageMillis = 5 * 60_000L)
        val vm = DealViewModel(app)
        vm.onAppForeground()
        val s = vm.awaitState { it.hasData && it.status == LoadStatus.IDLE }
        Thread.sleep(200)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(0, calls.get())
        assertTrue(s.isShowingSavedData)
        assertNull("fresh enough: nothing to flag", refreshNotice(s, System.currentTimeMillis()))
    }

    @Test
    fun `a failed refresh says why and offers Retry`() {
        saveList(ageMillis = 7 * 24 * 3600_000L)
        app.fake = fakeSite { calls.incrementAndGet(); throw FetchException.Http(503) }
        val vm = DealViewModel(app)
        vm.onAppForeground()
        val s = vm.awaitState { it.loadError != null }
        assertEquals(LoadStatus.IDLE, s.status)
        val notice = refreshNotice(s, System.currentTimeMillis())
        assertNotNull(notice)
        assertEquals(RefreshNotice.Kind.FAILED, notice!!.kind)
        assertEquals("Retry", notice.action)
        assertTrue(notice.detail, notice.detail.contains("503") && notice.detail.contains("7 days ago"))
    }

    @Test
    fun `a pending human check is flagged with Verify, not left silent`() {
        saveList(ageMillis = 7 * 24 * 3600_000L)
        app.fake = fakeSite { calls.incrementAndGet(); throw FetchException.VerificationRequired() }
        val vm = DealViewModel(app)
        vm.onAppForeground()
        val s = vm.awaitState { it.loadError != null }
        assertTrue(s.needsVerification)
        assertEquals(RefreshNotice.Kind.VERIFY, refreshNotice(s, System.currentTimeMillis())!!.kind)
    }

    @Test
    fun `offline is explained and waits for the network`() {
        saveList(ageMillis = 7 * 24 * 3600_000L)
        app.fake = fakeSite { calls.incrementAndGet(); throw FetchException.Offline() }
        val vm = DealViewModel(app)
        vm.onAppForeground()
        val s = vm.awaitState { it.loadError != null }
        assertTrue(s.loadErrorIsOffline)
        assertEquals(RefreshNotice.Kind.OFFLINE, refreshNotice(s, System.currentTimeMillis())!!.kind)
    }

    @Test
    fun `coming back after an offline failure retries even a recent list`() {
        saveList(ageMillis = 5 * 60_000L)
        app.fake = fakeSite { calls.incrementAndGet(); throw FetchException.Offline() }
        val vm = DealViewModel(app)
        vm.refresh()
        vm.awaitState { it.loadErrorIsOffline }
        vm.onAppBackground()
        app.fake = fakeSite { calls.incrementAndGet(); listing }
        vm.onAppForeground()
        val s = vm.awaitState { it.loadError == null && it.status == LoadStatus.IDLE && !it.isShowingSavedData }
        assertNull(s.loadError)
        assertFalse(s.isShowingSavedData)
    }

    @Test
    fun `leaving and coming straight back after a site error waits out the backoff`() {
        saveList(ageMillis = 7 * 24 * 3600_000L)
        app.fake = fakeSite { calls.incrementAndGet(); throw FetchException.Http(503) }
        val vm = DealViewModel(app)
        vm.onAppForeground()
        vm.awaitState { it.loadError != null }
        val afterFirst = calls.get()
        vm.onAppBackground()
        vm.onAppForeground()
        Thread.sleep(300)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals("no immediate retry", afterFirst, calls.get())
    }

    @Test
    fun `an old list with no error yet is still flagged`() {
        val s = DealUiState(
            allDeals = VsApi.parseClearancePage(listing).items, status = LoadStatus.IDLE,
            lastUpdatedMillis = System.currentTimeMillis() - 3 * 3600_000L
        )
        assertEquals(RefreshNotice.Kind.STALE, refreshNotice(s, System.currentTimeMillis())!!.kind)
    }
}
