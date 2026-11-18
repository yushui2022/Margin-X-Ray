# Product markup checks

The original scan page accepted a link or image. Its three example buttons filled the input with demo URLs. The page offered no way to compare pack sizes or trace a per-item result. The revised scan page links to an observed comparison. A reader can also start at a creator report, a product record or a previously unseen listing.

In the first rendered check the result was easy to find, but its price sources sat below the form, the threshold was small and the selected variant label clipped at 375px. The final check links both amounts in the equation, puts the threshold next to the result and gives the variant control a full row on small phones. [Desktop](markup-result-1440.png) · [Mobile](markup-result-375.png)

| Project design judgment | Baseline | First pass | Final |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 7 | 8 | 9 |
| Brand and visual composition | 9 | 9 | 9 |
| Readability and density | 8 | 8 | 9 |
| Interaction and feedback | 7 | 8 | 9 |
| Responsive behavior and accessibility | 9 | 8 | 9 |

## Observations on November 18, 2026

- The indexed US Amazon single-set offer and Ford Hotel Supply's product page both identify Winco MSP-4P, UPC 812944006815. Their listed prices were $5.82 and $1.58. The provisional 3× screen flags the 3.684× per-set multiple.
- A browser lookup of an unarchived East Bay Restaurant Supply link retrieved the $2.99 USD offer and the same barcode from its public storefront. The form suggested the dated Ford quote. Selecting one set and confirming the product yielded 1.892×. [East Bay listing](https://eastbayrestaurantsupply.com/products/cckmsp-4p) · [Ford quote](https://fordstl.com/winco-msp-4p-measuring-spoon-4-set-stainless-steel/)
- Feastables' 10-bar retail pack and 24-bar supplier case yielded 0.467× per bar. The Biodance supplier shows an 80-bottle case and requires login for a price. Its check remains pending.

Chromium checks covered direct linking, source links, match selection, pack counts, currency, keyboard submission, Back and refresh at 320, 375, 768, 1024 and 1440px. All fit the viewport. Mock, unavailable, missing-FX and live-format API responses were exercised with test fixtures. The public East Bay lookup used the actual store. The two priced supplier observations and one missing-price record are a limited sample. The exercise covers product links. Creator homepage discovery and commercial provider coverage still require separate validation.
