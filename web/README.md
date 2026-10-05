# VS Clearance — web, iPhone & PC

Vitamin Shoppe blocks servers and automated browsers from its data, so the non-Android versions run
**in the user's own browser while on vitaminshoppe.com**, as a userscript. Nothing needs to be
hosted for them to work; the server here just makes them easy to share.

| Platform | How |
|---|---|
| iPhone / iPad | Safari + the free **Userscripts** app → install `vs-clearance.user.js` → tap 🏷️ Deals on vitaminshoppe.com |
| Windows / Mac | **Tampermonkey** (Edge/Chrome/Firefox) → install `vs-clearance.user.js` |
| Android | The app (`VS-Clearance.apk`), or Firefox + Tampermonkey |
| Shared link | `/` shows the live list last published by **your** devices; visitors browse instantly, then tap **Get the app** (`/get/`) |

## Run it

Requires Node 18+ (no npm install needed).

```bash
npm test                      # logic + server tests
node scripts/package.mjs      # builds the userscript, APK copy and project zip into public/downloads
npm start                     # http://127.0.0.1:5050  (share page, /live/, /vs-clearance.user.js)
```

Windows + Tailscale (public link on its own port, leaves other Funnel mounts alone):

```powershell
.\scripts\serve.ps1            # public Funnel link  https://<pc>.<tailnet>.ts.net:10000/
.\scripts\serve.ps1 -Private   # tailnet-only
.\scripts\serve.ps1 -Register  # also start at logon
.\scripts\serve.ps1 -Stop
```

The userscript is a static file: you can also host `public/` on GitHub Pages, Netlify, etc.
(set `PUBLIC_URL` when running `scripts/build-userscript.mjs` so its auto-update URL points there).

## GitHub Pages (no PC needed)

The public site is **https://grandpatin.github.io/vs-clearance/**, built by
`.github/workflows/pages.yml` from `web/public`. The phone publishes the list straight to
the repo's `deals` branch (one force-updated commit holding `snapshot.json`); each push redeploys
the site in about a minute, so it stays up with the PC and the phone both off.

- **Phone:** Share to web → *Server or GitHub repo* = `github.com/GrandpaTin/vs-clearance`,
  *Publish token* = a fine-grained token with access to only that repo and **Contents: Read and write**.
  For the owner build, put `share.url=github.com/GrandpaTin/vs-clearance` and `share.token=...` in
  `local.properties`.
- **Code updates:** commit here, then `node web/scripts/publish-github.mjs "What changed"`. It mirrors
  the committed files into `../vs-clearance-public` (commits use GitHub's no-reply address) and pushes.
- **APK on the site:** attach the *everyone* build to a GitHub release as `VS-Clearance.apk`
  (`gh release create vX.Y.Z VS-Clearance.apk`); the workflow serves the latest one under `downloads/`.

## Sharing a live list

Your own devices publish; everyone else just opens the link (no Tailscale or install needed to view).
Open `http://127.0.0.1:5050/setup` on the PC for two private pairing links:

- **Android app:** the `vsdeals://publish?...` link turns on *Share to web*.
- **iPhone / PC browser with the userscript:** the `https://www.vitaminshoppe.com/...#vsdeals-share=...` link.
  After that, every time you open Deals there, the fresh list (and your store's shelf stock) is shared.

Keep those pairing links private: anyone with the token can replace your shared list.

## Files

- `public/core.js` — price/search/sort/AI-prompt logic + site API parsers (shared, tested)
- `userscript/overlay.js`, `overlay.css` — the in-page app; `scripts/build-userscript.mjs` bundles them
- `public/index.html` + `app.js` — the shared live view (what people see when you send the link)
- `public/get/` — install page (iPhone / PC / Android)
- `server.mjs` — static files + `/api/snapshot` (phone publishes with a token from `data/config.json`)
- `tests/` — `npm test`; `tests/userscript-harness.mjs` drives the userscript against captured
  responses with Playwright + Edge (no requests reach vitaminshoppe.com)
