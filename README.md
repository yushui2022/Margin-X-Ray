# Onion Head (Don't Be the Onion Head)

**Check the price behind the post.**

Open [Onion Head on GitHub Pages](https://yushui2022.github.io/Margin-X-Ray/) to search TikTok creators by name, @username or profile link. Select an account to see its saved price report or follow a live TikHub check. The public edition also supports saved US TikTok Shop video and product receipts. Screenshot recognition and voting run on the Node deployment.

Start at `#shop` and paste a TikTok profile, @handle, video or TikTok Shop
listing. The server uses `TIKHUB_TOKEN` to read the original post attachment,
seller and SKU price, search other sellers in US TikTok Shop, and read their
listing details. A profile check samples up to five recent public posts and
three linked products. For each selected SKU the server starts with one search
window of up to 20 results and two detail slots. When an edition has a reviewed
peer for the same market, source seller, listing and SKU, one of those slots
reads that address alongside search. Its current seller, selected option, stock,
currency and price must qualify again. If fewer than two comparable shops qualify
or the first comparable prices differ by over 20%, a follow-up may use a second
search window and more candidate shops, up to five detail reads total. A verified
matching offer ends the follow-up. The report preserves the source post and listing for
each product. If the sample contains no Shop attachment, it asks for a more
specific TikTok link. A screenshot can supply a handle or TikTok link through
local OCR. A single unambiguous TikTok source can start a check.

The live result gives a purchase decision, a **Rotten Onion Score**, its confidence
and the observed price premium. In `shop-onion-v3`, the premium measures the
original item price relative to a verified same-SKU offer or the median of qualifying
similar listings (one offer per peer shop). The decision checks scope, stock, options,
pack and one-off offers. Explicit differences in comparable warranty terms or primary
materials can make price grading inappropriate.

The rubric starts with an editorial price allowance of 5% for an exact variant,
10% for comparable standardized goods with a matching measurement, 25% for
comparable items with specific material/craft or collectible-edition evidence,
and 15% for other qualifying similar items. With at least two independent peer
shops, the observed upper price may expand that allowance by up to 10 percentage
points. These are MVP editorial thresholds. Each receipt shows which evidence and
allowance applied. With allowance A in percentage points, the anchors below use
the original item's percentage difference from the peer price.

| Price gap | −50% or less | −30% | −15% | −5% to +5% | +(5+A)% | +(5+2A)% | +100% | +200% or more |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Score | 0 | 15 | 35 | 50 | 65 | 75 | 90 | 100 |

The scale interpolates and rounds between anchors, reserving 0, 50 and 100
for their stated ranges on individual items. Higher scores indicate higher
item prices relative to the benchmark. Insufficient comparable evidence
produces an unscored decision. A single similar seller warrants a tentative
buying action even when the observed gap is large.

The server saves the four decision steps and their inputs. Profiles aggregate
the median of scored products and state coverage. Raw price premiums remain
visible. The score concerns sampled item prices; a seller's profit, intent or
product quality cannot be inferred from these observations. Existing snapshots
keep their original rubric. V1 added a point per percentage point of premium.
V2 scored only the excess above the category price band.
The previous report can be reviewed under the current rules with
`POST /api/shopping-jobs/:id/reassess`. This creates a separate, shareable
assessment from its saved listing evidence, preserves the original observation
dates, and makes no upstream requests.

**Share report** freezes the completed price report and its score. A recipient
can open `/r/<id>` after the transient job cache expires. The same URL includes
a title, description and a 1200 × 630 PNG preview at `/r/<id>/card.png`.
Reading the shared report only reads saved evidence. For a hosted installation,
set `PUBLIC_BASE_URL` to its public origin for social preview URLs. Local development
uses the loopback origin. Published snapshots live in the shopping SQLite database.

For each product the server checks the explicitly linked SKU, the listing's
default, or its only variant. Ambiguous or missing options require a selection.
A numeric difference requires distinct seller IDs, compatible specifications,
a verified barcode or brand/manufacturer-model match, same-currency item prices,
and confirmed stock on both sides. The signed difference is the original price
minus the lowest qualifying offer **among the listings checked**. Delivery,
tax and checkout discounts are excluded. Similar offers retain their prices
and source links as candidates. This number measures a shopper's item-price
difference. It does not establish creator costs, earnings or product quality.

Run `npm run build` and, with the token in the server environment, start
`HOST=127.0.0.1 npm run serve:demo`. The home form submits
`POST /api/shopping-jobs`. The response includes a job ID, and
`GET /api/shopping-jobs/:id` reads its current stage or saved report.
Refreshing the result URL resumes the same job. SQLite stores jobs outside the
web root at `data/shopping-jobs.sqlite`; override with `SHOPPING_JOBS_DB`.
The server keeps up to 500 finished jobs for up to 24 hours, coalesces identical
active checks, reuses recent results, and limits simultaneous workers.
`POST /api/shopping-check` runs the same comparison synchronously. Requests
accept `url`, optional `market` (US by default) and optional selection
`{productId, skuId}`. UK listing identity is preserved when a UK price is
unavailable. Live comparisons use TikHub exclusively. Amazon, 1688 and general
web search are outside this workflow.

`POST /api/shopping-screenshot` reads a PNG or JPEG of up to 5 MiB in memory.
On macOS it uses Swift and Vision. On Linux install Tesseract with the English
language data and set `SHOPPING_OCR_LANGUAGES` for additional installed
languages. The upload is discarded after OCR.

Creator profiles lead with their products and **Price premium index**. The
`retail-premium-v1` index needs complete consumer comparisons for at least three
distinct creator-linked product families. Its coverage and sample selection
are visible. Products with a manufacturer reference and an unknown creator
offer can have useful consumer comparisons while remaining ineligible for the
creator index. The quality review, evidence coverage and shared coverage votes
retain their existing versioned rules.

The [Rotten Onion Index](http://127.0.0.1:4196/#shop/rankings) opens a
preloaded edition of US TikTok Shop price checks. Each creator’s score is the
rounded median of eligible product scores under `shop-onion-v3`. The newest
observation of each listing counts once per creator. Ties share a rank. The
index shows how many products qualified and includes dated receipts with
links to the posts, original variants and competing sellers. Opening a ranking
or receipt uses the bundled public observations and makes no TikHub request.
The launch receipts live in `research/shop-price-ranking-seed.json`. Further
original posts from those creators are recorded in
`research/shop-price-batches/2026-11-19-additional-posts.json`.

The ranking uses `shop-ranking-benchmark-v1` to give the same US store, listing,
SKU and currency one reference set per UTC observation day. A dedicated edition
check freezes the store quotes for that variant. Other variants use the latest
recorded observation per competing SKU in that day's receipts. Each store
contributes one eligible price. The benchmark uses the lowest verified exact
match or the median of the similar-item store prices. One-store references
are labelled. The original per-post receipts keep their original comparisons.
Named cushion shades need matching brand, shade and stated fill to qualify as
similar items. Conflicting size information stays visible on the candidate link.

Build the dated reference file from completed public US SKU listing checks with
`node scripts/seed-shop-ranking-benchmarks.mjs`. Its optional `--candidates`
argument accepts a file of separately documented, excluded listings. These links
never contribute a price to the score. The current evidence file is
`research/shop-price-benchmark-checks.json`.

To reproduce a local batch, set `TIKHUB_TOKEN` in the backend environment.
The discovery command emits posts whose TikTok Shop attachment matches the
specified product ID. The batch command runs the same shopping check as the
paste-a-link flow and writes a public receipt per video. Rerunning the batch
resumes missing or incomplete receipts.

```sh
node scripts/find-shop-posts.mjs --pages 2 --product-id 1731176397038522481 'Spidey tool bench' > /tmp/onion-posts.ndjson
node scripts/run-shop-ranking-batch.mjs /tmp/onion-posts.ndjson /tmp/onion-receipts
```

The November 19 launch edition records its sampling method, creator coverage,
and distinct scored listings in `research/shop-price-batches/2026-11-19-launch.json`.
The subsequent calibrated edition is summarized in
`research/shop-price-batches/2026-11-19-benchmarks.json`, including the
per-SKU reference prices and the number of creators with multiple scored items.
The same evidence scored under v3 is recorded in
`research/shop-price-batches/2026-11-19-price-index-v3.json`. The 89 ranked
creators share four similar-item references. Each reference has one eligible
peer shop. Their scores span 53–63, with 72 further creators awaiting a match.

The separate archive and manual comparison tools let shoppers inspect storefront variants, search
for a barcode in the US or UK and compare two checkout totals for their address.
Optional live eBay Browse candidates require server-side `EBAY_CLIENT_ID` and
`EBAY_CLIENT_SECRET`. Without credentials the barcode can be opened directly
in the marketplace. Shopper-entered comparisons stay in the current view.

Frontend changes follow the project-specific self-review prompt in
[`docs/frontend-self-review.md`](docs/frontend-self-review.md), referenced by
`AGENTS.md`. It uses a fixed rubric and a 9/10 target, with screenshots and real
interaction checks. The [shopping workflow review](docs/shopping-check-review.md)
records the iterations, measured improvements and testing limits. Mobile lookup
and research filters use disclosures to bring searchable creator rows forward.

The launch directory includes **500 public TikTok creator profiles**, all with
locally stored portraits and searchable names/handles. It retains Glamzilla,
Mikayla Nogueira, Mrwhosetheboss and NikkieTutorials and adds 496 profiles from
Famadex's public TikTok people ranking. All 500 reports retain a **preliminary Evidence
Score**, measuring report coverage rather than creator trustworthiness. The directory
opens with the most documented products first. The separate **Onion Score**
for documented product problems is under the quality review. No completed
product-problem sample has been admitted to date.
Browse 20 records per page, search the full collection,
sort by name, filter by collected category, or show the twelve profiles with
priced product evidence using the directory toolbar. The main search accepts a
name, handle or TikTok profile URL. Press Enter on a matching handle to open its
report. The featured receipt opens a dated price record. The [price archive](http://localhost:4173/#prices)
supports product, variant, creator and currency filters across 21 collected records.
Its cards open shareable product pages with expanded source documents. Priced creator results
open the product cards directly. Each card has a source disclosure next to the
observed price. Share a section with `#creator/%40nikkietutorials/products` or
`#creator/%40nikkietutorials/sources`. Research filters also select sampled accounts, sourced
follow-up leads or unavailable samples. Summary counts separate these from ratings.

Follower counts are rounded secondary-source observations collected 2026-11-17,
not live platform counts. Broad source labels do not establish product niches;
new profiles currently show Uncategorized. Every profile has a TikTok link,
source/date information and an explicit product-research state. Portraits from
Famadex, Linktree, Linkme and Nutcake are not claimed to be current TikTok avatars.
Provenance is in `assets/creators/sources.json` and
`research/creator-seed-evidence.json`; collection rules are in
`research/creator-seed-notes.md`.
The separate Fictional examples view contains six ranked sample identities,
post counts and scores. Public TikTok handles outside the directory open a
research workspace. **Run research** starts a server-side job that collects
account-matched public captions, traces commercial and product leads, checks
applicable recall sources and applies the published rubrics. Seeded profiles
offer the same workspace. Public reports include dated sources, collection
limits and the evidence needed for an eligible Onion Score. See the
[agent workflow, scoring example and server settings](docs/creator-agent-design.md).
The real-profile Evidence Score uses the `evidence-v3` rubric: public sample (20),
commercial trail (25), product and price documentation (35), and financial evidence
(20 reserved). Ten checks cover account matching, caption depth, selected leads,
product-to-post links, named products, variants, reference prices, market/condition
notes, compensation records and cost/profit records. Financial checks remain zero.
Low scores mean incomplete research, not negative findings about a creator. Each
check shows its calculation, sources and next research step. Documentation of an
unknown purchase condition does not verify that condition. Volume checks now use
proportional collection targets, rounded to one decimal before summing. V3 replaces
v2; changed scores can reflect the rubric alone. See `research/creator-score-notes.md`.

Directory rows and reports offer **↑ Seems fair / ↓ Needs review** feedback with shared counts,
agreement percentage, switching and withdrawal. The web server requires **Node 22.13+
or Node 24+** for built-in SQLite. `npm run serve:demo` serves the same-origin
`/api/creator-feedback` endpoint and stores votes in `data/creator-feedback.sqlite`
(ignored by Git). Set `CREATOR_FEEDBACK_DB` to choose a persistent storage location.
Back up this database with its SQLite WAL state; do not put it in the static web root.
Votes are scoped to creator and rubric version, with one choice per anonymous
browser cookie, not one authenticated person. They never change evidence scores.
Static-only hosting needs this API routed to the Node server; without it the UI
shows unavailable feedback with Retry rather than inventing counts.
Directory controls sit beside each score on desktop and below the row on narrow
screens. Voting does not open the report. The directory and report read the same
saved choice; initial parallel row loads share one anonymous browser session.

The **Onion Score** now uses `product-issues-v1`. It is neither evidence confidence
nor its inverse. Frequency contributes `70 × affected products / reviewed products`;
severity contributes `30 × sum of per-product maximum severity / reviewed products`.
Severity factors are 0.25 (minor), 0.5 (moderate), 0.75 (serious), and 1 (critical).
Each component is rounded to one decimal before summing. Weights, evidence rules,
sample window and minimum review size are explicit editorial choices in
`research/creator-issue-rubric.json`, not a statistically calibrated failure rate.

Eligibility requires a completed sample of at least three distinct creator-linked
products in the published window, a consistent selection method, dated primary
evidence, explicit reviewed outcomes and source-backed severity assessments.
Missing, disputed, alleged, out-of-window or unresolved records remain pending.
Repeated reports do not multiply one product's contribution. A reviewed zero means
no documented problems in that sample; it is different from unreviewed research.

`research/creator-issue-reviews.json` is currently empty. Existing price listings,
caption samples, unresolved price conflicts, research confidence and votes have
not been converted into product-problem allegations. The previous 12 confidence
ratings are historical research assessments and no longer drive any public score.
The directory explains the absence of eligible rankings and remains searchable.

Highest problem scores rank first. Equal scores share global competition rank;
names and handles stabilize ties, and filters do not change global ranks. Pending
profiles sort after rated profiles, including reviewed zero, in both directions.
The five onion states are Fresh [0,20), Spotted [20,40), Bruised [40,60), Spoiled
[60,80), Rotten [80,100]. Gray means pending. Each row/report has one headline
score; sources and calculations can be expanded. Votes retain their original
`evidence-v3` coverage-feedback scope and cannot change the problem score or rank.

The legacy transparency score, used only in explicitly labeled fictional examples, weights price transparency (40%), commercial disclosure
(35%) and linked-seller returns information (25%). The formula is visible in the
interface and is not a validated measure of personal integrity. Fictional product
cards do not support real creator scores. Live scoring
requires source observations, dates, coverage thresholds and review rules.

All **500 accounts have an initial public-sampling outcome**: 499 successful
TikTok embed samples with 5,212 captions, and one HTTP 400 failure (`yahia_x`,
also retried). Reports show returned identities, bios, original post links,
captions and access limits. There are 173 selected follow-up leads across 153
creators (157 caption reviews and 16 external findings). This is a limited
collection pass, not 500 completed product investigations or a full video review.
See `research/creator-screening-notes.md` for scope and reproduction.

Real creator profiles now include **21 public product records across 12 creators**
observed on 2026-11-17: 4 third-party promotions/mentions, 16 founder-associated
brand products (POV, Nimya, Feastables, Rare Beauty, rhode, Kylie Cosmetics,
r.e.m. beauty, PAPATUI, Painted and Haus Labs), and 1 Nudestix collaboration. Founder association
includes acquired brands; rhode's e.l.f. acquisition and Coty's historical Kylie
partnership are documented without assigning product profit to the creator.
Three unresolved leads (MISSHA, a rhode set and a PAPATUI tattoo stick) are kept
without prices or calculators. 488 directory profiles have no accepted priced
product record yet. `research/creator-products.json` stores
source URLs, extracts, access methods, historical post dates, variants, currencies,
purchase conditions and relationship confidence. Search-index observations are
explicitly distinguished from directly retrieved pages. These are reference
prices and selected evidence, not a complete catalog or verified TikTok Shop sales.

**Actual earnings and margins remain unknown for every record.** No commission
contracts, sponsorship fees, settlements, product cost accounts or creator
distributions were obtained. Each product provides optional assumption-only
calculators for affiliate commission and/or merchant/brand gross and contribution
margins. Inputs start blank, currencies stay separate, and net revenue must exclude
sales tax/VAT and account for discounts/refunds. Zero revenue produces undefined
margin percentages; losses remain visible. Assumptions are local to the current
view, clear on navigation/reload, and never update evidence or creator scores.
See `research/creator-products-notes.md` for the evidence gaps and collection rules.

`web/` is the standalone frontend (`npm run serve:demo`, port 4173; default route
`#shop`). `dist/` is the loadable Chrome extension. `preview/` is a dev-only
HUD harness. `server/mock-xray.mjs` supplies fictional product scan responses;
it does not search or score TikTok creators.

This build still uses a clearly labeled demo dataset for factory verification.
Live adapters call TikHub, browser-side video frame extraction, Baidu product
recognition, and JustOneAPI, OneBound or the 1688 open platform when their
credentials are saved. The report never invents a factory price or a fair
range: a missing input is shown as missing.

## Positioning

Onion Head reports what it measured, not what a seller intended.

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
- Pro workspace tab: opportunity radar, live net-profit calculator, masked
  supplier shortlist and a factory evidence request form. All workspace data is
  labeled sample data; the calculator is a real editable model.
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
- Right-click **“Scan with Onion Head”** on any page (uses `activeTab`, not a
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

## Research

Week 1 is a data problem, not a UI problem. The team collects 50 real viral
products with live 1688 quotes and registry checks before more automation:

- `research/GROUND-TRUTH-SOP.md` — selection rules, image search, supplier
  calling script, registry checks, P25/P50/P75, QA and compliance
- `research/ground-truth-50.csv` — 50 candidate categories, ready to fill
- `research/supplier-quotes.csv` — supplier quotes and verification fields
- `research/REPORT-TEMPLATE.md` — the first-20 report format

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
