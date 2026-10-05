# VS Clearance — Vitamin Shoppe clearance deals (Android)

**Free and open source (MIT, see [`LICENSE`](LICENSE)).** This folder is the complete app: the
Android app (`app/`), the iPhone/PC userscript (`web/userscript/`), and the shareable web page with
its tiny server (`web/`). Friends can download it all from the share page's *Free & open source*
section, or run `node web/scripts/package.mjs` to rebuild the zip. Public home:
https://github.com/GrandpaTin/vs-clearance (site: https://grandpatin.github.io/vs-clearance/, see `web/README.md`).

> **iPhone, iPad, PC and web:** see [`web/README.md`](web/README.md). The same app runs as a userscript
> in Safari (Userscripts app) or Edge/Chrome (Tampermonkey) on vitaminshoppe.com — no Android device
> needed. `web/scripts/serve.ps1` hosts a share page with install links via Tailscale Funnel.

Browse every live clearance item on vitaminshoppe.com, see what's actually on the shelf at
your store, and hand a shortlist to an AI for an evidence-based "is this worth buying?" review.

## Features

- **Live data only.** Products, prices, store list and shelf stock come straight from the
  site's own JSON APIs. Nothing is invented; if the site can't be reached you see your last
  saved results (clearly marked) or an error with Retry.
- **Correct prices.** Shows the page price, list ("was") price, % off, Auto Delivery price and
  cost per serving. Items marked *"X% Off – See Sale Price In Cart"* report full price in the
  catalog; the app shows the estimated cart price as **≈ $x.xx in cart** and says so.
- **Store pickup.** Search stores by ZIP or "City, ST" (real distance, today's hours, closed /
  no-pickup stores flagged, tap to call). With a store chosen, every card shows units on the
  shelf there, and **Pick up in store** lists only items in stock at that store.
- **Filters.** Search (forgiving: "omega 3" = "Omega-3"), discount floor, category chips built
  from today's clearance, in-stock toggle, six sorts including cost per serving.
- **Direct product links.** Tapping a card opens the exact product page in a Custom Tab.
- **AI review prompt.** Copy or share a ready-made prompt (top 35 deals in your sort order)
  for ChatGPT / Claude / Gemini: evidence score, bioavailability, value per dose, BUY/CONSIDER/PASS.
- Remembers your store and filters; opens instantly from cache; light & dark themes.

## How data is fetched (and why there's a hidden WebView)

vitaminshoppe.com protects its APIs with DataDome, which answers any plain HTTP client
(OkHttp, curl) with HTTP 403 and a CAPTCHA. The app therefore keeps one invisible WebView on
`https://www.vitaminshoppe.com/cl/clearance/0` and calls the same endpoints the site's pages
call, from inside that page (`data/remote/WebSession.kt`). Trackers/ads/images are skipped in
that hidden tab. If the site asks for a human check, the tab is shown full screen so you can
complete it; loading resumes automatically.

Endpoints (`data/remote/VsApi.kt`):

| Data | Endpoint |
|---|---|
| Clearance listing | `browse.vitaminshoppe.com/search/product/search?path=/cl/clearance/0&format=json&rpp=200&pageno=N` (max rpp 200) |
| Store search | `browse.vitaminshoppe.com/inventory/api/inventory/get-stores-with-inv?address=…` |
| Shelf stock | `browse.vitaminshoppe.com/inventory/api/inventory/pdpinventory?storeId=…&skuIds=a,b,…&source=WEB` (≤100 SKUs) |

## Project layout

```
com.dealfilter.vitaminshoppe/
├── data/model        DealItem (price math), StoreLocation, filter enums
├── data/remote       VsApi (URLs + parsers), WebSession (WebView fetcher), FetchException
├── data/local        LocalStore (prefs + offline cache)
├── data/repository   DealRepository (paging, inventory batching)
├── domain            DealFilters (filter/sort/search), AiPrompt
└── ui                DealScreen (stateless DealScreenContent), components, theme, viewmodel
```

## Build & test

Requires JDK 17 and the Android SDK (platform 34).

```bash
./gradlew testOwnerDebugUnitTest   # parser/filter/repository tests + screenshot renders
./gradlew assembleOwnerDebug       # your phone: Share to web points at your server out of the box
./gradlew assembleEveryoneDebug    # what you hand out: no server or token inside
```

The **owner** build reads `share.url` (e.g. `share.url=https\://my-pc.tailnet.ts.net\:10000`) and
optionally `share.token` from `local.properties`; the token otherwise comes from `web/data/config.json`.
Neither file is committed or zipped. `web/scripts/package.mjs` only ever ships the **everyone** APK.

Unit tests run against responses captured from the live site (`app/src/test/resources`).
`ScreenshotTest` renders the real screens (Robolectric + Roborazzi) to `app/build/screenshots/`.
