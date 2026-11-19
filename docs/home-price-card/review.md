# Homepage price comparison card

The published card opened with the tied rank and a large 63. In a screenshot of the card alone, readers encountered the product and its prices much later. The labels “Original shop” and “Shop benchmark” left the shops’ roles implicit. The revised example opens with the $10.11 difference on the creator’s link. It names the product and creator, labels the other listing as a similar item and offers the underlying price sources. The creator’s score follows the example on phones and sits beside it on desktop.

| First appearance inside the card at 375px wide | Before | After |
| --- | ---: | ---: |
| $10.11 price difference | 358px | 40px |
| Product name | 217px | 114px |
| Creator's quoted price | 303px | 243px |
| Other shop's quoted price | 330px | 243px |

At 375 × 812, the homepage shows the purpose, search, both shop prices, the 18.4% difference, the similar-item label and the price-source link before the fixed bottom navigation. The score panel begins above the bottom navigation, and a short scroll reveals the complete scale. Desktop keeps the dollar difference and score side by side. In both layouts the creator total is explicitly scoped to one scored product for this example.

| Screenshots | Before | After |
| --- | --- | --- |
| Phone card | [Original](before-375.png) | [Revised](after-375.png) |
| First phone viewport | [Original](before-phone-home.png) | [Revised](after-phone-home.png) |
| Desktop card | [Original](before-1440.png) | [Revised](after-1440.png) |

The first revision arranged the figures and the source link on separate lines at 375px. Shortening the masthead description and placing the percentage and source link on one line moved the start of the card from 374px to 352px and reduced its height from 517px to 499px. The source link retains its 44px target, and the two footer elements still wrap on the narrower 320px screen.

## Interaction checks

Chromium rendered the published original and the revised Pages build at 320, 375, 768, 1024 and 1440px without horizontal overflow or page errors. At every width the full ranking opened from the keyboard, a saved handle submitted to its creator report, and the card's source link opened the Disney item's receipt showing $64.94, $54.83 and $10.11. The archive retained its 15 featured rows. Testing a new username used a fixture for the suggestions service and empty report. Its avatar decoded, the dropdown row was 55px high, and Arrow Down and Enter selected the intended account with visible focus.

## Design judgment

| Dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 9 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted judgment | | 8.4 | 9.0 |

The hierarchy rating reflects the newly prominent price difference. The readability rating reflects the explicit labels for the two prices and the distinction between the item example and the creator’s overall score. A visitor study would be needed to measure first-time comprehension.
