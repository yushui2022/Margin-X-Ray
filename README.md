# Margin X-Ray

**Factory cost lens for TikTok Shop, Shopify and Amazon product pages.**

This repository contains the first working slice of Margin X-Ray: a Chrome
Manifest V3 extension with a multi-source capture screen, a staged scan, and a
tabbed report for price, profit and suppliers. It also collects sourcing leads.

**The product is the extension.** `dist/` is the loadable extension. `preview/`
is a dev-only HUD preview page that is generated outside `dist/`, and
`server/mock-xray.mjs` is a local mock API for testing. Neither is a web app and
neither ships inside the extension package.

The current build is an **MVP shell with a clearly labeled demo dataset**. It
does not call 1688, TikTok Shop, Qichacha or any live supplier API yet. The
point of this slice is to make the interaction, data contract and integrity
rules real before wiring the supply-chain engine.

---

## What works today

- Chrome MV3 extension, loadable as an unpacked extension.
- Page adapters for TikTok, Amazon, Shopify and generic product pages.
- Floating `Open X-Ray` launcher on supported hosts.
- Start screen with four separate capture paths:
  - analyze the current product or video page
  - paste a TikTok, Amazon or Shopify link
  - upload a JPG, PNG or WebP product image
  - capture the visible page, or the current video frame when available
- Staged scan state, then a tabbed report: **Overview / Profit / Suppliers**.
- Shadow-DOM HUD: product context, price range, cost waterfall, Top 3 factory
  cards, funnel reasons, quote form and disclaimers.
- Editable cost assumptions: ex-works price, freight, duty, platform fee,
  affiliate commission, payment fee, fulfillment, returns and ads.
- MOQ-tier pricing on each factory card; clicking a tier updates the waterfall.
- SSE client with correct chunk buffering, so progress events do not break when
  TCP splits a JSON line.
- Background worker that proxies API calls (avoids page CORS and keeps tokens
  out of the page).
- Local settings, scan history and lead storage in `chrome.storage.local`.
- Popup with **Open X-Ray** and **Capture screen** actions + full options page.
- Right-click **“Scan with Margin X-Ray”** on any page (uses `activeTab`, not a
  broad all-sites permission).
- Local mock API (`server/mock-xray.mjs`) for end-to-end testing.
- Dev-only HUD preview page (`npm run preview`), kept outside the extension
  package.

## Interface principles

The HUD is a compact browser research tool:

- a full-height right-side panel keeps the product page visible beside the data
- neutral gray surfaces, blue actions, compact metrics and restrained borders
- the first result view answers three questions: retail price, landed cost and net margin
- one primary action moves the user from product judgment to supplier matching
- Top 3 suppliers appear in a comparison table; due-diligence signals open per row
- detailed profit line items and assumptions stay behind expandable controls
- `tabular-nums` for prices and margins, visible focus rings and reduced-motion fallbacks
- inline stroke icons instead of emoji in the HUD and popup

Tokens live in `src/styles/tokens.css` and are injected into the HUD shadow root
so page CSS cannot leak in.

## What is still demo / mocked

- The factory list, registry signals, funnel counts and prices in demo mode are
  **sample data**. They are labeled `DEMO DATA` in the HUD.
- The local mock server returns `MOCK API` data. It is a test harness, not the
  real pipeline.
- No live TikTok Shop, 1688 image search, Qichacha/DueSight, payment or auth
  integration yet.
- The screenshot path first tries a canvas frame from the current video, then
  `chrome.tabs.captureVisibleTab` through the background worker. Chrome grants
  `captureVisibleTab` when the scan starts from the popup's **Capture screen**
  button. A screenshot started from the in-page HUD may be blocked by Chrome;
  in that case the page's product image is used and the report says so.

## Quick start

```bash
npm install
npm run build
```

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
  content/
    index.ts                  page controller, launcher lifecycle, messaging
    adapters/                 TikTok, Amazon, Shopify, video, generic
    ui/
      hud.ts                  shadow-DOM HUD
      hud.css                 HUD styles
      icons.ts                inline stroke icon set
  styles/
    tokens.css                shared design tokens (WenCode-inspired light theme)
  shared/
    types.ts                  data contract
    capture.ts                link/image capture context helpers
    pricing.ts                landed-cost waterfall + MOQ helper
    format.ts                 price parsing and safe formatting
    sse.ts                    chunk-safe SSE parser
    demo.ts                   sample dataset
    settings.ts               chrome.storage helpers
    steps.ts                  scan step definitions
  popup/                      extension popup: quick scan + demo toggle
  options/                    extension options: API settings, permissions, data
  demo/                       source for the dev-only HUD preview
server/
  mock-xray.mjs               zero-dependency local mock API
tests/                        node:test unit tests
scripts/
  build.mjs                   esbuild build: dist/ + preview/
  serve-demo.mjs              static preview server
dist/                         generated extension output (gitignored)
preview/                      generated dev-only HUD preview (gitignored)
```

## Integrity rules

These are product requirements, not marketing copy:

1. **No fallback factory price.** If a scan cannot verify a range, the UI shows
   “insufficient data” instead of inventing a number.
2. **No fake precision.** Each factory card carries its signals, sources and
   dates. Demo data is labeled as demo.
3. **No subtraction theater.** The funnel reports each exclusion reason
   separately; it never labels every non-top-3 listing as a “middleman”.
4. **No hidden margin math.** The waterfall shows landed cost, platform and
   affiliate fees, fulfillment, returns and ads. Assumptions are editable.
5. **No silent PII collection.** Leads are stored locally in demo mode. In live
   mode they are only posted to the configured API after consent.

## Tests

```bash
npm run typecheck
npm test
```

Current tests cover price parsing, formatting, the landed-cost model and
chunk-safe SSE parsing.

## Known limitations

- TikTok/Amazon/Shopify DOM selectors are best-effort and will need maintenance.
- Instagram and YouTube are limited to page metadata and poster images.
- Shopify pages are scanned via the popup or right-click menu; auto-injection on
  every site would require a broad host permission and is intentionally avoided.
- The service worker may be terminated during very long scans; the UI has a
  timeout path, but production should use a durable job queue.
- No authentication, billing, rate limiting, observability or legal review yet.

## Next steps

1. Build a ground-truth set of 50 products with real quotes at 100 / 500 / 2,000
   pcs before optimizing the engine.
2. Add a user-gesture `captureVisibleTab` / `tabCapture` frame path and crop to
   the video element.
3. Replace the mock API with the real pipeline: image search, listing filters,
   registry verification and provenance.
4. Add confidence calibration and “insufficient data” states end to end.
5. Add Chrome Web Store permission copy, privacy policy, terms and a takedown /
   correction workflow.

---

Internal MVP. Add a license and a public privacy policy before distributing.
