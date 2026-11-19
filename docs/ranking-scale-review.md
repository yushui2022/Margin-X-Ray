# Reading the ranking scale

The baseline was the local US TikTok Shop edition on November 19. The opening creator receipt displayed 0/100 for an original offer of $59.99 and a reference of $55.64. It showed the allowance but left the shopper to calculate the difference. Visitors had to open another receipt to work out how its score related to the ranking.

| Baseline view | Phone | Desktop |
| --- | --- | --- |
| Full ranking | [375 px](ranking-scale/before-ranking-375.png) | [1440 px](ranking-scale/before-ranking-1440.png) |
| Creator receipt | [375 px](ranking-scale/before-creator-375.png) | [1440 px](ranking-scale/before-creator-1440.png) |

| Design dimension | Weight | Baseline judgment and change to make |
| --- | ---: | --- |
| Task access and hierarchy | 25% | 7. Explain the midpoint alongside the headline score. |
| Brand and composition | 20% | 9. Preserve the plum masthead and the two-color shop receipt. |
| Readability and information density | 15% | 8. Write the price difference alongside the original and reference prices. |
| Interaction and feedback | 20% | 8. Surface the ranking rules beside the first rows and identify the archived method before opening a saved receipt. |
| Responsive behavior and accessibility | 20% | 9. The opening screens fit the phone and desktop. Preserve native controls and keep the scale readable without relying on color. |

## Reviewed build

The ranking masthead now gives the three reference points of the product scale. The creator page places the score on the same line and identifies the median when several products qualify. The rules disclosure beside the opening score explains shop selection, allowances, ties and the treatment of missing comparisons. Its example table reads the anchors used by the scorer.

The reviewed edition contained 89 ranked creators and 72 without a qualifying comparison. The 89 scores comprised four at 63, six at 58, three at 57 and 76 at 53. Four distinct listings supplied all the scored products. The coverage line reports the shared listing concentration.

| Design dimension | Reviewed judgment |
| --- | --- |
| Task access and hierarchy | 9. The midpoint and both extremes are visible above the ranking. A creator row opens the receipt with the original price, reference and difference. |
| Brand and composition | 9. The score scale fits inside the established plum masthead. The receipt uses its original shop and benchmark colors. |
| Readability and information density | 9. In the first mobile rendering, the rating narrowed a long product title into seven lines. The final rendering gives it the full width and places the score alongside the variant. The category note combines match status and allowance. |
| Interaction and feedback | 9. Keyboard focus, Enter and Space opened the rules, benchmark directory and saved price checks. The archived score is labeled with its receipt version. Returning to the ranking and opening an unrated row also worked. |
| Responsive behavior and accessibility | 9. Chromium rendered the ranking, expanded rules and evidence at 320, 375, 768, 1024 and 1440 CSS pixels without horizontal overflow. Numbers and plain-language labels accompany the scale marker. |

The browser compared every ranked row with its computed edition score at each viewport. It verified the four reference store links, the prices and item scores in a single-product and a three-product score, and the source version and score in their original receipts. The $59.99 offer for @allicoolmom was $4.35 above the $55.64 edition reference and scored 53. Opening its earlier receipt showed the original $49.95 quote and the recorded score of 9. A previously scored check for @bbsanti1 remained available under its now-unrated index card.

Separate in-memory examples exercised verified item savings, similar-item differences, parity, a cheaper original and a range of original offers. The edition itself contains similar-item estimates from a single reference shop per listing. Browser checks ran against the local app without new TikHub calls, vote mutations or page exceptions. These scores for the interface are local design judgments.

| Final view | Phone | Desktop |
| --- | --- | --- |
| Full ranking | [375 px](ranking-scale/after-ranking-375.png) | [1440 px](ranking-scale/after-ranking-1440.png) |
| Creator receipt | [375 px](ranking-scale/after-creator-375.png) | [1440 px](ranking-scale/after-creator-1440.png) |

The [item comparison](ranking-scale/receipt-375.png) shows the dollar difference and the applicable product allowance. The [opened post receipt](ranking-scale/archive-375.png) shows its saved score and original evidence.

## Submitted and shared reports

The same scale runs when a shopper submits a new link or asks to review a saved report. A browser opened a published v2 receipt for @ccollins15 at 320, 375, 768, 1024 and 1440 pixels, then used its review button. The original displayed 9. Its new private copy showed 65 for the same $59.99 original and $49.95 peer price, labeled the result a low-confidence similar-item estimate and identified 50 as the midpoint. The method disclosure opened with the keyboard and showed the v3 anchors. The public original still displayed 9 on the next visit. The new views fit all five widths without horizontal scrolling.

| Submitted report | Phone | Desktop |
| --- | --- | --- |
| Saved v2 receipt | [375 px](ranking-scale/before-report-375.png) | [1440 px](ranking-scale/before-report-1440.png) |
| Reviewed receipt | [375 px](ranking-scale/after-report-375.png) | [1440 px](ranking-scale/after-report-1440.png) |

A separate live check pasted @all_the_jazzy_things' Disney Princess table video through the homepage. A search-only run found the original listing and timed out before verifying a peer. With a direct reread of the reviewed Shop SKU, the browser returned a report in 20.5 seconds. The two observed prices were $64.94 and $58.37, a $6.57 difference and an 11.3% premium. It scored 56 with one similar-item reference. Another post from @hiddengemssd was checked in 35.1 seconds and returned $64.94 versus $58.77 for 55 points. The dated edition continues to show the earlier peer price of $54.83 and the corresponding 63. The receipts identify the source SKU and observation time. These timings describe two local checks.
