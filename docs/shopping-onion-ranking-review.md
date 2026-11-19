# Shopping price ranking review

The task followed the five dimensions in [the project review workflow](frontend-self-review.md). The design judgments cover navigation from the shopping and creator pages to scored TikTok Shop price evidence.

## Baseline

The shopping home offered a TikTok price lookup and an archive link for Kylie Jenner’s retail premium index. The creator directory offered a priced-products filter and premium sorting across 500 profiles. Neither opening view let a shopper browse the saved TikTok Shop pricing decisions as a ranked group. The archive and directory used recognizable Onion Head typography and provided working product navigation.

| Opening view | Desktop, 1440 × 900 | Phone, 375 × 850 |
| --- | --- | --- |
| Shopping home | [Before](shopping-rank/before-shop-1440.png) | [Before](shopping-rank/before-shop-375.png) |
| Creator directory | [Before](shopping-rank/before-creators-1440.png) | [Before](shopping-rank/before-creators-375.png) |

## Design assessment

| Fixed dimension | Weight | Before | After | Evidence |
| --- | ---: | ---: | ---: | --- |
| Task access and hierarchy | 25% | 7 | 9 | The shopping preview, creator directory and saved shopping report lead to the index. A row opens the corresponding creator sample. |
| Brand and visual composition | 20% | 9 | 9 | The plum masthead, local onion illustration and display typography carry through from shopping reports. |
| Readability and information density | 15% | 8 | 9 | The rank and score have separate positions. Each ranked row states the number of products scored and the match basis. |
| Interaction and feedback | 20% | 8 | 9 | Keyboard activation opens the list and receipts. Headings receive focus on navigation and disclosures show focus. A handle outside the edition has a return link. |
| Responsive behavior and accessibility | 20% | 9 | 9 | The list and expanded evidence fit the tested widths. Each ranked row presents a target at least 44 CSS pixels tall. |
| Weighted design judgment | 100% | 8.2 | 9.0 | Internal assessment of the sampled flows. |

## Browser checks

- Chromium on macOS exercised 320, 375, 768, 1024 and 1440 CSS pixels. The home preview, ranked pages, product receipts and expanded scoring method fit each viewport. Enter and Space opened disclosures, and a keyboard reader could return from a creator record to the list.
- Read-only visits from the shopping home, directory and existing shopping report restored the index. The browser checked the post and seller destinations against the recorded URLs. Ranking navigation and disclosures sent no POST requests.
- The directory still allowed creator search, the twelve-creator priced-products filter and pagination across 500 profiles. In a separate server with a temporary vote database, a vote was created, switched, persisted across reload, withdrawn and recovered from a simulated request failure.
- In-memory ranking fixtures confirmed competition ranks of 1, 1 and 3. A zero score remained eligible and a missing comparison stayed unrated. A newer observation for the same product replaced the earlier result. Entries from a different market and mismatched creator URLs were excluded.

| Ranked view | Desktop, 1440 × 900 | Phone, 375 × 850 |
| --- | --- | --- |
| Shopping home | [After](shopping-rank/after-shop-1440.png) | [After](shopping-rank/after-shop-375.png) |
| Creator directory | [After](shopping-rank/after-creators-1440.png) | [After](shopping-rank/after-creators-375.png) |
| Ranking | [After](shopping-rank/after-index-1440.png) | [After](shopping-rank/after-index-375.png) |
| Creator sample | [After](shopping-rank/after-detail-1440.png) | [After](shopping-rank/after-detail-375.png) |

The observations cover the sources present in this edition, the versioned rules and browser-emulated viewport sizes. The design judgment applies to the flows inspected here.

## Price comparison follow-up

Before this pass, the featured receipt displayed two shop amounts and a separate scoring-threshold diagram. The first ranking edition displayed a score and coverage per creator. The paired screenshots below use the same local report at both widths.

| Before adding direct price graphics | Desktop | Phone |
| --- | --- | --- |
| Saved US comparison | [Two shop tiles](shopping-rank/before-bars-receipt-1440.png) | [Two shop tiles](shopping-rank/before-bars-receipt-375.png) |
| Initial ranking layout | [Rank rows](shopping-rank/before-bars-index-1440.png) | [Rank rows](shopping-rank/before-bars-index-375.png) |

The finished edition includes nine checked creators and thirteen sampled posts. @ccollins15 and @ivy.faves share first place at 9/100 for the same distinct scored listing. Seven handles appear in the unrated disclosure. Each ranked row includes the source and reference amounts with bars on a common baseline. Entering @ivy.faves in the directory shows the matching saved index entry. Pressing Enter opens its 9/100 record.

In the [desktop receipt](shopping-rank/after-bars-receipt-1440.png) and [phone receipt](shopping-rank/after-bars-receipt-375.png), $59.99 and $49.95 share a $0–$60 axis. Both rows mark the $57.44 scoring threshold. The original bar shades the $2.55 beyond it, labeled 4.4%. The larger $10.04 observed difference remains visible with its similar-item qualification.

Chromium measured bar lengths against their numeric amounts at all five widths, using the real report, a saved legacy report, a saved profile and nine isolated edge cases. The two tracks start at the same position and have the same length. Equal prices produce equal bars, and a cheaper original produces a shorter bar. A missing, conflicting or unavailable comparison has no chart. Frozen v1 evidence retains the historical score without a v2 threshold. A fresh local server with an empty shopping database and external requests blocked still opened the ranking and its receipt.

## First edition with at least 50 scored creators

The November 19 edition contains **78 ranked creators, 161 checked creators, and three scored original listings**. The comparison basis for all 78 creators is a similar-item estimate. The original shop's $59.99 toy variant accounts for 61 creators. Its comparable quotes ranged from $49.95 to $59.93 during these checks, resulting in different scores for some identical original prices. The masthead now gives the sample concentration, the observed range and a link to the shared listing. The receipts retain each check’s own quote, variant and source post.

| Fixed design dimension | Before | Reviewed result |
| --- | ---: | ---: |
| Task access and hierarchy | 9 | 9 |
| Brand and visual composition | 9 | 9 |
| Readability and information density | 8 | 9 |
| Interaction and feedback | 9 | 9 |
| Responsive behavior and accessibility | 9 | 9 |

The internal readability judgment reflects the earlier lack of visibility into overlapping creator samples. The first link treatment in the plum masthead had low contrast. The final treatment uses an underlined cream link. At widths of 320, 375, 768, 1024 and 1440 CSS pixels, Chromium rendered all 78 ranked rows and opened the top receipt with Enter. The source link matched the creator, and both the board and receipt fit the viewport. The shade check now recognizes an explicit post caption such as “shade 21N” and shows its source on the receipt. A caption mentioning several shades requires a choice. The earlier screenshots show the first 24 available scored creators while the batch was running.

| View | Before | Final |
| --- | --- | --- |
| Phone, 375 px | [Before](shopping-rank/launch-before-375.png) | [Final](shopping-rank/launch-after-375.png) |
| Desktop, 1440 px | [Before](shopping-rank/launch-before-1440.png) | [Final](shopping-rank/launch-after-1440.png) |
