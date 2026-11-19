# Shared price benchmarks

The baseline was the local November 19 index with 78 ranked creators. Its masthead explained that the same toy appeared in 61 creators’ posts. A shopper could see price variation across checks but could not inspect a common comparison price. A creator’s receipt opened directly on the quote captured for that post.

| View | Phone, 375 CSS px | Desktop, 1440 CSS px |
| --- | --- | --- |
| Ranking before the change | [Phone](shopping-benchmarks/before-ranking-375.png) | [Desktop](shopping-benchmarks/before-ranking-1440.png) |
| Creator before the change | [Phone](shopping-benchmarks/before-creator-375.png) | [Desktop](shopping-benchmarks/before-creator-1440.png) |

| Review dimension | Weight | Baseline assessment |
| --- | ---: | ---: |
| Task access and hierarchy | 25% | 7. The full ranking showed the original shop link, while the storefront supplying the comparison required a visit to an individual receipt. |
| Brand and visual composition | 20% | 9. The masthead, onion illustration and display typography carried through the ranking and receipts. |
| Readability and information density | 15% | 8. The two prices and gap were clear, but shoppers had to infer how many separate stores supplied the benchmark. |
| Interaction and feedback | 20% | 8. Original posts and store pages opened from the receipt. The ranking lacked a way to inspect the shared evidence. |
| Responsive behavior and accessibility | 20% | 9. The opening views fit the sampled phone and desktop sizes and the creator rows were keyboard accessible. |

## Reviewed edition

The ranking now shows the benchmark amount and the number of contributing shops beside each scored creator. The benchmark directory groups the underlying variants. Each card lists the shops, prices, product titles, selected options and UTC observation times. Single-store coverage is visible at the price. The TIRTIR 21N card identifies the observed shade match, names the competing product lines and labels the formula as unverified.

The creator card gives the score and threshold derived from the shared benchmark. Its original TikTok post links directly to the source. The original price check and the other listing leads each have a separate disclosure.

The checked build showed 89 ranked creators out of 161, with four scored variants. Seven creators had more than one scored product. The browser exercised all three of @ka.devore’s product benchmarks. All four scored variants used a dedicated edition check. The shared prices were $55.64 for the tool bench, $54.83 for the Disney Princess table, $59.86 for the Marvel air hockey table and $29.00 for TIRTIR 21N. The Marvel table's $64.94 original price earned 0 points under its allowance.

An older receipt may have scored a candidate whose package evidence was later found to conflict. In that case the main card shows “Unrated” and the recorded exclusion reason. Opening “Original post price check” restores the earlier evidence and score.

| Review dimension | Reviewed assessment |
| --- | --- |
| Task access and hierarchy | 9. One disclosure beside the ranking opens the shop sources for the edition. A creator receipt starts with the benchmark used for the displayed score. |
| Brand and visual composition | 9. The display face, warm paper, plum benchmark column and rust original-shop column follow the established receipt design. |
| Readability and information density | 9. Store counts, quoted prices and UTC check times sit beside the evidence. The second pass shortened long listing titles at their source separators and placed the selected variant below the title. |
| Interaction and feedback | 9. Each accepted storefront has a direct link. Other candidate links sit outside the price calculation and are explicitly labeled. |
| Responsive behavior and accessibility | 9. Keyboard interaction and visible focus worked with the source directory, original receipts and candidate disclosures. The source rows measured at least 44 CSS pixels in height. |

Chromium on macOS exercised 320, 375, 768, 1024 and 1440 CSS pixels. The test compared the rendered creator scores, benchmark amounts and complete sets of eligible links to the calculated edition. It expanded the original price receipt, checked the creator's TikTok attribution, opened the candidate disclosure and verified that a source link opened a separate tab at its recorded product address. The popup request was intercepted during the interaction test. There were no additional TikHub calls, POST requests, JavaScript errors or horizontal overflow in these read-only flows. The rubric records local design judgments.

| View | Phone | Desktop |
| --- | --- | --- |
| Ranking | [375 px](shopping-benchmarks/after-ranking-375.png) | [1440 px](shopping-benchmarks/after-ranking-1440.png) |
| Expanded benchmark sources | [375 px](shopping-benchmarks/after-sources-375.png) | [1440 px](shopping-benchmarks/after-sources-1440.png) |
| Creator receipt | [375 px](shopping-benchmarks/after-creator-375.png) | [1440 px](shopping-benchmarks/after-creator-1440.png) |

The [unrated creator view](shopping-benchmarks/after-unrated-375.png) shows the main card for a previously scored snapshot.
