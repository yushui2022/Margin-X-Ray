# Homepage search in the creator ranking

On the published GitHub Pages homepage, entering **@bethannyyyy** opened a price-check card with 58/100 and rank #5. The search field remained in place, but the result had no adjacent creators or selected leaderboard row. The phone and desktop captures show the same query.

[Before, 375 px](before-375.png) · [Before, 1440 px](before-1440.png)

| Review dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and composition | 20% | 9 | 9 |
| Readability and density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 8 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted internal design judgment | | 8.2 | 9.0 |

## Interaction checks

The first release preview placed **@bethannyyyy** in the same order as the saved leaderboard, between **@steph.walker09** and **@kimandcrewfinds**. Her selected row opened with a tied rank of #5, a score of 58/100, the original shop price of $59.99 and a similar-item comparison of $55.64. Pressing Enter or Space on the row toggled its evidence. Moving to the next group and back restored the selected row.

At 320, 375, 768, 1024 and 1440 px, the exact handle, a bare username outside the homepage's featured rows and a pasted profile URL opened the correct ranking context. A partial name offered candidates. Choosing a result or tapping its avatar selected its row. Returning to matches and clearing the field restored their preceding views, with the same input element and zero hash changes. Unscored archived accounts opened the unrated group. A video link opened the specific saved product receipt. A replay of the real live response for **@hankgreen1** showed the original partial report with five checked posts and zero products. The preview used local response replay for these repeatable checks.

The first pass exposed one short-screen issue. At 320 × 568, the fixed navigation bar covered Bethanny’s selected summary. At 375 × 667, the last selected creator in a five-row group could also fall below the visible area.


## Final release preview

[Search result, 375 px](after-375.png) · [Search result, 1440 px](after-1440.png)

The final mobile layout places the selected row at y=430 on a 375 × 812 screen. The preceding row, both shop prices and the next two accounts are visible together. The 1440 × 900 layout places the selected row at y=565. Both stayed at the original scroll position.

On the 320 × 568 screen, the selected summary moved into y=415–470 for both Bethanny and the final creator, above the navigation bar at y=506. On a 375 × 667 screen the final creator occupied y=521–576, above the bar at y=612. Paging from the start through the complete scored group yielded 89 distinct creators in source order. The checked-but-unrated group showed no numeric rank or score. All five widths passed again after these adjustments. The measurements reflect Chromium desktop and emulated mobile viewports.

All 161 saved handles were also submitted through the homepage input on the release preview. Each opened its own row with the expected score or unrated state and made zero live profile requests.

On GitHub Pages build `9370ab2`, 375 px and 1440 px Chrome sessions submitted the bare username **bethannyyyy** from the canonical homepage and saw the selected row tied at #5 with 58/100. Both selected the Jazzy avatar and saw the #1 row in the same list view. Returning to the name matches kept the original URL. These public checks used the deployed services without response substitution.
