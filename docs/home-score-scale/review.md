# Homepage score scale

The previous panel showed 63/100 above a five-pixel track. Its unnumbered circle sat to the right of a line at 50. The two marks asked readers to work out which one belonged to the displayed score. The revised scale prints the observed 63 directly above its position. Three fixed labels show where 0, 50 and 100 fall. Highlighting the distance from 50 to 63 ties the result to the reference price.

| Score panel | Before | After |
| --- | --- | --- |
| 375px phone | [Original](before-375.png) | [Revised](after-375.png) |
| 1440px desktop | [Original](before-1440.png) | [Revised](after-1440.png) |

The baseline used the published GitHub Pages edition at commit `2c611aa`. The comparison captures use that build and the revised Pages build at identical sizes. At 375px the panel grew from 165px to 203px to accommodate the numbered pointer and two lines of scale labels. The product and both price quotes remain above the panel.

## Rendering and interactions

Chromium rendered the featured creator's observed 63 at 320, 375, 768, 1024 and 1440px without horizontal overflow. In 30 additional renders of the same component, local test values of 0, 49, 50, 51, 63 and 100 placed the number at its corresponding position at all five widths. The markers at 0 and 100 stayed within the panel and the labels at 49–51 stayed clear of the midpoint caption. A 320px viewport had a 246px rail. Forced-colors emulation at 375px retained visible labels, pointer and reference tick.

The accessibility tree exposes one named meter with a 0–100 range, its current value and the product-score explanation. The meter displays a result and does not add a keyboard stop. In all five widths, keyboard selection in a test username dropdown opened the intended report, a saved creator query opened the real report, the ranking link opened the full ranking, and the featured source link opened the receipt containing $64.94, $54.83 and the $10.11 gap. The unfamiliar-account search used fixture responses. Comparison evidence, votes and stored scores were untouched.

## Internal design review

| Dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 9 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 9 | 9 |
| Responsive behavior and accessibility | 20% | 8 | 9 |
| Weighted judgment | | 8.7 | 9.0 |

The revised readability score reflects the explicit number on the pointer. The accessibility score reflects the named meter, the forced-colors rendering and the verified end positions. This is a Chromium design review. VoiceOver and first-time visitor comprehension were not tested.
