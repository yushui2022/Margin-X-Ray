# Price receipt and buying advice

The reviewed report is the saved US TikTok Shop comparison for @ccollins15’s tool bench. The original offer is $59.99. A different store listed a similar item for $49.95. Both are item prices. The report has one eligible comparison and a reference score of 9/100 under shop-onion-v2.

## Before

The original receipt showed the sellers and both prices, a useful basis for checking the figures. The text separated the 20.1% gap, the 15% allowance and the $57.44 ceiling from their consequence for the buyer. At the five tested widths, 166 CSS pixels separated the receipt from the start of the buying advice. The first intervening control opened the score rubric. The second opened the evidence log. The main seller links measured 40 pixels high on the 375-pixel viewport. The shortened heading omitted the distinguishing words in the middle of the listing title.

| View | 1440 × 1000 | 375 × 850 |
| --- | --- | --- |
| Before | [Desktop receipt](receipt-layout/before-1440-receipt.png) | [Phone receipt](receipt-layout/before-375-receipt.png) |
| After | [Desktop comparison and advice](receipt-layout/after-1440-receipt.png) | [Phone comparison](receipt-layout/after-375-receipt.png) · [Phone advice](receipt-layout/after-375-advice.png) |

## After

On the saved report, the two shop prices lead directly to the observed $10.04 gap and the warning that the variant is unconfirmed. The scale shows a $57.44 threshold and the original offer 4.4% above it. Buying advice explains that one other shop matched the selected options. Opening the 9/100 explanation exposes the four recorded decision steps and the 0–20-point interval for prices 0–10% above this threshold. Both cards start at the same height at 1024 and 1440 pixels. At 375 pixels, the advice follows the receipt after a 14-pixel gap.

| Fixed dimension | Weight | Before | After | Evidence |
| --- | ---: | ---: | ---: | --- |
| Task access and hierarchy | 25% | 8 | 9 | The recommendation now follows the prices before the method and source disclosures. |
| Brand and visual composition | 20% | 8.5 | 9 | The advice carries the existing onion illustration. Each shop has a distinct tile and a marker shape repeated on the threshold scale. |
| Readability and information density | 15% | 8 | 9 | The price difference, selected variant and threshold are visible. The product name retains the identifying first clause from the source. |
| Interaction and feedback | 20% | 8.5 | 9 | The listing inspection button opens the evidence, scrolls to it and transfers keyboard focus to its summary. |
| Responsive behavior and accessibility | 20% | 8.5 | 9 | The shop links are at least 44 pixels tall. The tested viewports fit closed and expanded evidence. |
| Weighted design judgment | 100% | 8.3 | 9.0 | Internal review of this report flow. |

The first visual pass showed the original seller’s link arrow wrapping onto its own line at 375 pixels. The final pass keeps the last word and arrow together and replaces a repeated threshold sentence in the advice with the eligible seller count.

## Interaction checks

- A Chromium browser opened the published share URL and restored the saved video. Keyboard Enter and Space operated all five visible disclosure controls with visible focus. The listing inspection button focused its target. Selecting another recorded variant exposed the lookup action. Returning to the original variant restored its seller evidence.
- The shop links retained the recorded TikTok URLs. Opening the price evidence, score, method, sources and market settings sent zero shopping or voting requests that change data. Expanded listing evidence and the closed report fit 320, 375, 768, 1024 and 1440 CSS pixels.
- A second saved video kept its v1 score of 20/100. A saved profile kept its three receipts, 11/100 score and five linked source posts.
- Nine additional states used isolated browser responses and the existing scoring function. They covered an exact alternative with $17.00 savings, an original priced lower, identical prices, an original at the allowed limit, a 100-point result, a missing comparison, two peers producing a $48.95 median, an incompatible pack size and a post with no product. Exact-match actions linked to the less expensive offer, or the original on a tie. The missing, incompatible and no-product states stayed unrated.

The browser checks used Chromium on macOS with emulated viewport sizes. The observations and design judgments apply to the saved reports and isolated states above. No external store checkout or user study was part of this review.
