# 别做洋葱头 (Don't Be the Onion Head)

**See the real cost before you buy.**

别做洋葱头 is a consumer price-transparency tool. Paste a TikTok video or
product link, upload a photo, or scan the page you are on. It estimates the
factory cost behind the product, shows a fair retail range, and reports how
many near-identical 1688 listings exist — then exports a share card.

The product is the extension. `dist/` is the loadable extension. `preview/` is
a dev-only HUD preview page generated outside `dist/`, and
`server/mock-xray.mjs` is a local mock API. Neither ships inside the extension
package.

This build still uses a clearly labeled demo dataset for factory verification.
Live adapters call TikHub, browser-side video frame extraction, Baidu product
recognition, and JustOneAPI, OneBound or the 1688 open platform when their
credentials are saved. The report never invents a factory price or a fair
range: a missing input is shown as missing.

## Positioning

别做洋葱头 reports what it measured, not what a seller intended.

- Neutral labels only: **markup**, **fair price range**, **near-identical
  listing**, **generic white-label match**. No “scam”, “fraud” or “rip-off”.
- Every number carries its source. 1688 listing prices are listing prices, not
  factory audits.
- The fair range is a stated model: landed cost plus fulfillment, platform,
  payment and returns fees, at a 15–25% net margin with no paid-ads load.
- Company names and 1688 factory flags come from the listing. They are not a
  registry, headcount or litigation check.

---

## What works today

- Agent web frontend at `web/`: paste a link or upload an image, watch the
  agent trace stream (read → identify → 1688 → verify → price), then read the
  verdict, breakdown, listings and share card. Calls the same
  `POST /api/v1/xray/stream` contract as the extension.
- Chrome MV3 extension, loadable as an unpacked extension.
- Page adapters for TikTok, Amazon, Shopify and generic product pages.
- Floating `Scan product` launcher on supported hosts.
- Start screen with four capture paths:
  - scan the current product or video page
  - paste a TikTok, Amazon or Shopify link
  - upload a JPG, PNG or WebP product image
  - capture the visible page, or the current video frame when available
- Staged scan state, then a tabbed report: **Verdict / Breakdown / Source listings**.
- Verdict card: retail price, estimated factory cost, fair price range, markup
  multiple and a 1688 near-identical-listing match signal.
- Share card export: a 1080×1350 PNG with the verdict, product image, evidence
  line and disclaimer, built to be posted in a comment thread.
- Shadow-DOM HUD: product context, price range, cost waterfall, Top 3 source
  listings, evidence rows and disclaimers.
- Editable cost assumptions: factory price, freight, duty, platform fee,
  affiliate commission, payment fee, fulfillment, returns and ads.
- MOQ-tier pricing on each source listing; clicking a tier updates the model.
- SSE client with correct chunk buffering, so progress events do not break when
  TCP splits a JSON line.
- Background worker that proxies API calls (avoids page CORS and keeps tokens
  out of the page).
- Local settings, scan history and lead storage in `chrome.storage.local`.
- Popup with **Scan this product** and **Capture screen** actions + full options page.
- Right-click **“Scan with 别做洋葱头”** on any page (uses `activeTab`, not a
  broad all-sites permission).
- Local mock API (`server/mock-xray.mjs`) for end-to-end testing.
- Optional live capture and sourcing adapters, used only when their keys are
  saved in Settings:
  - TikHub (`api.tikhub.io`) resolves a TikTok or Douyin link to title, author,
    cover and an anchored shop price when the payload states the currency
  - the content script samples up to three video frames locally
  - Baidu product recognition labels the frame, upload, cover or page image
  - JustOneAPI runs 1688 image search first when its token is saved:
    `convert-image` turns a URL or JPEG into a reference, then
    `search-item-by-image` returns listings with MOQ tiers, company name,
    shipping city and 1688 factory / verified flags
  - OneBound `item_search_img` searches 1688 image listings and can optionally
    fetch one listing's MOQ tiers with `item_get`
  - the official 1688 open platform adapter signs and calls the similar-offer
    image search endpoint when the third-party providers are not configured
  - a missing key, a failed call, or a score under 45% is shown as a note and
    does not replace a real page title or invent a factory quote
- Dev-only HUD preview page (`npm run preview`), kept outside the extension
  package.

## Interface principles

The HUD is a compact consumer scanner:

- a full-height right-side panel keeps the product page visible beside the data
- neutral gray surfaces, blue actions, compact metrics and restrained borders
- the first result view answers three questions: what you pay, what it costs to
  make, and what a fair range looks like
- the markup multiple is the single punchline; supporting evidence stays below it
- the fair range states its own assumptions instead of implying a market survey
- Top 3 near-identical listings appear in a comparison table; evidence opens per row
- detailed cost line items and assumptions stay behind expandable controls
- `tabular-nums` for prices and multiples, visible focus rings and reduced-motion fallbacks
- inline stroke icons instead of emoji in the HUD and popup

### Visual system

Clean modern Americana, not a costume:

- warm paper surfaces (`#FAF6EE`, `#FFFDF8`) with espresso ink (`#1E1A17`)
- rust-red actions (`#C0492F`), teal (`#2F6F68`) and a single ochre accent
- Fraunces for display, system sans for UI text — bundled locally in
  `assets/fonts`, never fetched from a CDN at runtime
- one-pixel borders, 10–12px radii and soft shadows instead of hard letterpress
  edges
- the onion-headed kid mascot (an onion for a head, a varsity jacket for a
  body) carries the brand instead of decorative borders

Tokens live in `src/styles/tokens.css`; the HUD injects them into its shadow
root so page CSS cannot leak in. Extension pages link
`src/styles/fonts.css`, and the HUD injects the same Fraunces `@font-face` rule
with an extension URL. If a site blocks extension fonts, the HUD falls back to
the system serif without breaking layout.

## What is still demo / mocked

- The mobile web / PWA scanner is **not built yet**. The current product is the
  Chrome extension; a phone-first page and link-paste flow still need a hosted
  backend.
- One-click retail alternatives and affiliate links are **not connected**. The
  Source listings tab links only to 1688 listings and says so; it does not show
  a retail buy button with a price that cannot be backed up.
- The share card is drawn locally on a canvas. A cross-origin product image can
  block the export; the UI reports that instead of downloading a broken card.
- The sample report in demo mode is **sample data**, labeled `DEMO DATA` in the
  HUD. The local mock server returns `MOCK API` data; it is a test harness.
- 1688 image search runs when JustOneAPI, OneBound or open-platform keys are
  saved, in that order. Returned listing prices stay in CNY unless a
  CNY-per-USD rate is saved, so the fair range stays empty until a rate exists.
  These are listing prices, not factory verification, freight, duty or a
  supplier quote. Company names and 1688 flags come from the listing and are
  not a registry, headcount or litigation check.
- Qichacha / Tianyancha / Qixinbao / DueSight data is **not connected**. The
  "manufacturing scope, insured headcount >= 15, paid-in capital, contract
  disputes" sourcing filter still needs a real registry endpoint and field
  contract.
- TikTok Shop live price and sales lookup is not connected. TikTok metadata
  comes from TikHub or the page DOM.
- The screenshot path first tries a canvas frame from the current video, then
  `chrome.tabs.captureVisibleTab` through the background worker. Chrome grants
  `captureVisibleTab` when the scan starts from the popup's **Capture screen**
  button. A screenshot started from the in-page HUD may be blocked by Chrome;
  in that case the page's product image is used and the report says so.

## Quick start

```bash
npm install
npm run build
npm run mock        # local agent backend on :8787
npm run serve:demo  # web frontend on :4173
```

Open <http://localhost:4173/> and paste a product link. The header shows whether
the agent backend is reachable; use **Backend** to point it at a real API.

Load the extension:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Open a product page and click the floating **Open X-Ray** button. Choose
   **Analyze this page**, paste a link, upload an image, or capture the screen.
   You can also open the extension popup and use **Open X-Ray** or
   **Capture screen**.

The extension starts in **demo mode**, so no server is required.

### Package the extension

```bash
npm run package
```

This zips only `dist/` into `margin-xray-extension.zip`. The preview and mock
server are not included.

### Preview the HUD without installing the extension (dev only)

```bash
npm run preview
```

Open <http://localhost:4173/>. This is a static product page that mounts the
same HUD component with the same sample dataset.

The preview is built to `preview/`, not `dist/`. It is a development harness for
reviewing the HUD; the extension does not load it and `npm run package` does not
include it.

### Run the local mock API

```bash
npm run mock
```

Then open the extension **Settings**, turn off demo mode, and set the API base
URL to `http://localhost:8787`. The mock server exposes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Connection test |
| `POST` | `/api/v1/xray/stream` | SSE progress + complete result |
| `POST` | `/api/v1/leads` | Lead capture test endpoint |

The stream emits:

```text
event: progress
data: {"scanId":"...","stepId":"supply","percent":72,"message":"..."}

event: complete
data: { ...ScanResult }
```

See `src/shared/types.ts` for the full `ScanResult` contract.

## Project structure

```text
manifest.json                 MV3 manifest
src/
  background/
    index.ts                  service worker, context menu, scan orchestration
    api.ts                    SSE client, result normalization, API tests
    demo-runner.ts            staged demo scan
    enrich.ts                 TikHub + frame sample + Baidu recognition
    tikhub.ts                 TikHub video client
    recognize.ts              Baidu product recognition client
    supply-search.ts          JustOneAPI / OneBound / 1688 orchestration
    justoneapi.ts             JustOneAPI image conversion + image search
    onebound.ts               OneBound listing adapter
    alibaba.ts                1688 open-platform adapter
  content/
    index.ts                  page controller, launcher lifecycle, messaging
    frames.ts                 local video frame sampler
    adapters/                 TikTok, Amazon, Shopify, video, generic
    ui/
      hud.ts                  shadow-DOM HUD
      hud.css                 HUD styles
      icons.ts                inline stroke icon set
      poster.ts               share-card canvas renderer
  styles/
    tokens.css                shared design tokens (WenCode-inspired light theme)
  shared/
    types.ts                  data contract
    capture.ts                link/image capture context helpers
    identity.ts               TikHub / Baidu parsers and title rules
    justoneapi.ts             tolerant JustOneAPI response parser
    consumer.ts               verdict, fair range and markup model
    supply.ts                 supply reports and 1688 offer mapping
    pricing.ts                landed-cost waterfall + MOQ helper
    format.ts                 price parsing and safe formatting
    sse.ts                    chunk-safe SSE parser
    demo.ts                   sample dataset
    settings.ts               chrome.storage helpers
    steps.ts                  scan step definitions
  popup/                      extension popup: quick scan + demo toggle
  options/                    extension options: API settings, permissions, data
  web/                        agent scan frontend (HTML, CSS, app.ts)
  demo/                       dev-only HUD harness source
server/
  mock-xray.mjs               zero-dependency local mock API
tests/                        node:test unit tests
scripts/
  build.mjs                   esbuild build: dist/ + preview/
  serve-demo.mjs              static server for the agent web app
dist/                         generated extension output (gitignored)
preview/                      generated dev-only HUD preview (gitignored)
```

## Integrity rules

These are product requirements, not marketing copy:

1. **No fallback factory price.** If a scan cannot verify a range, the UI shows
   “insufficient data” instead of inventing a number.
2. **No fake precision.** Each source listing carries its signals, sources and
   dates. Demo data is labeled as demo.
3. **No accusation by implication.** The report shows a markup multiple and a
   near-identical-listing count. It does not call a seller a scammer or claim a
   legal finding of white-labeling.
4. **A fair range states its assumptions.** Landed cost, fees and the 15–25%
   margin band are visible and editable; there is no hidden multiplier.
5. **No fake buy button.** A retail alternative is shown only when a real
   affiliate or supplier feed backs its price.
6. **No silent PII collection.** Leads are stored locally in demo mode. In live
   mode they are only posted to the configured API after consent.

## Tests

```bash
npm run typecheck
npm test
```

Current tests cover price parsing, formatting, the landed-cost model, the
consumer verdict thresholds, TikHub / Baidu / JustOneAPI parsing and chunk-safe
SSE parsing.

## Known limitations

- Mobile web / PWA is not built. C-end acquisition will need a phone-first page
  and a hosted backend, not only a desktop extension.
- Affiliate / CPS links and one-click retail alternatives are not connected, so
  there is no consumer checkout path yet.
- TikTok/Amazon/Shopify DOM selectors are best-effort and will need maintenance.
- Instagram and YouTube are limited to page metadata and poster images.
- The fair-range model assumes a 15–25% net margin and no paid-ads load; it is
  an estimate, not a market survey.
- DueSight / registry verification is not connected, so no supplier is labeled a
  verified factory.
- The service worker may be terminated during very long scans; the UI has a
  timeout path, but production should use a durable job queue.
- No authentication, billing, rate limiting, observability or legal review yet.

## Next steps

1. Ship the phone-first scan page: paste a TikTok link, get the same Verdict and
   share card on mobile.
2. Calibrate the fair-range model against real retail prices for one category
   before publishing it as a headline number.
3. Add affiliate / CPS mappings for AliExpress, Temu and DHgate, with a hard
   rule: no link without a live price.
4. Connect the DueSight / registry layer and only then promote “verified
   factory” language.
5. Add Chrome Web Store permission copy, privacy policy, terms and a takedown /
   correction workflow.

---

Internal MVP. Add a license and a public privacy policy before distributing.
