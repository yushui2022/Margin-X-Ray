# Featured creator mascot

The featured score card on the US home page shows @all_the_jazzy_things at 63/100. Its original plum background, cream score and horizontal price index made the result easy to read. The earlier 98px desktop mascot was a small front-facing onion. At 320px and 375px the layout hid the character entirely.

| Size | Before | After |
| --- | --- | --- |
| Desktop, 1440px | [Original card](before-1440.png) | [Onion boy and score](after-1440.png) |
| Phone, 375px | [Original card](before-375.png) | [Onion boy and score](after-375.png) |

The new character raises one eyebrow and looks left at the price score with his arms folded. A striped shirt and onion sprout read clearly against the plum background. The sprout and arms stay inside the card. At 320px and 375px the 80px illustration sits alongside the handle and score. At 768px, 1024px and 1440px it occupies 90px, 102px and 140px respectively. The transparent 512px asset provides at least two source pixels per rendered CSS pixel throughout.

Screen checks at all five widths found no intersections with the score, handle, rank or scale, and no horizontal page overflow. The decorative image has an empty alt attribute. The score retains its accessible numerical description and each page shows five ranked rows. Keyboard activation of the featured receipt opened its saved product, and searching for `@all_the_jazzy_things` opened the corresponding creator report, on both desktop and phone layouts.

| Internal design rubric | Before | After |
| --- | ---: | ---: |
| Task access and hierarchy | 9 | 9 |
| Brand and visual composition | 8 | 9 |
| Readability and information density | 9 | 9 |
| Interaction and feedback | 9 | 9 |
| Responsive behavior and accessibility | 8 | 9 |
| Weighted mean | 8.6 | 9 |

The same checks passed on the publicly deployed version 5 in fresh browser contexts. The updated character appeared on the featured card, and the linked product receipt kept its own illustration. [Public US edition](https://onion-head-price-index.purebeak64.chatgpt.site/#shop)

The scope of this review is the featured card, its linked receipt and the adjacent home search. All captures use Chromium on macOS with a device pixel ratio of two. Screenshot crops are exported in CSS pixels for comparison. The ratings are internal design judgments based on these views and interactions.
