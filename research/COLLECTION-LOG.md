# Collection Log — 2026-11-16

## What was attempted

| Source | Method | Result |
|---|---|---|
| 1688 search | Desktop browser → `s.1688.com/selloffer/offer_search.htm` | Redirected to Taobao login. No listings or prices without a logged-in account. |
| 1688 API | JustOneAPI `search-factory/v1` probe | `code 100 — TOKEN INVALID/UNACTIVATE`. Token unusable. |
| 1688 official | Alibaba open platform | No credentials configured. |
| OneBound | API key | Not configured. |
| TikTok search | Desktop browser → `tiktok.com/search` | "Sorry, server issue, retry" — no results or video links. |
| TikTok page fetch | webfetch | Empty response. |
| Alibaba.com search | webfetch | Empty response. |
| Public 2026 viral-product lists | webfetch + websearch | Accessible. Used as retail reference. |

## What was collected

- `research/retail-signals.csv`: **36 real products** with retail price, market,
  currency, source URL, source date and a white-label-candidate flag.
- Sources: Trendsicle (2026-07-31), WorthIt Finds (2026-03-30), BuzzFeed
  (2026-11-06 and 2026-11-15), Groupon UK.
- Four direct category matches were written back into `ground-truth-50.csv`
  (`GT-015`, `GT-016`, `GT-018`, `GT-024`) with `retail_signal_id`.

## What was NOT collected

- 1688 listing prices, MOQ tiers, supplier legal names.
- Factory registry signals (insured employees, paid-in capital, disputes).
- TikTok video URLs, creator handles, live retail prices from the video page.
- Any verified quote.

These fields are intentionally blank. No price was estimated or copied from a
"from $X" marketing line.

## Why

1688 requires a logged-in session or a working API token. This machine has
neither. TikTok search is currently erroring and the page fetch is blocked.
Supplier quotes require phone/WeChat contact, which cannot be automated here.

## Next actions (pick one)

1. **Provide a working JustOneAPI token** (or OneBound key): then 1688 image
   search can be run for the 36 retail signals, and P25/P50/P75 can be filled.
2. **Use a logged-in 1688 browser profile**: export the listing data manually
   for the top 20 products; still requires buyer calls for MOQ tiers.
3. **Buyer calls**: use `GROUND-TRUTH-SOP.md` section 6 to collect 3 quotes per
   product. This is the only path to "verified" data today.

## Data quality rules applied

- Retail price is copied exactly from the cited article, with its date.
- `white_label_candidate` is a hypothesis, not a verified fact.
- Branded products are marked `no` (COSRX, Laneige, Ninja, Bissell, LEGO,
  Rhode, Sol de Janeiro, Revlon, Caraway).
- A price of `0` means the article did not state one (e.g. Kitsch scalp brush).
