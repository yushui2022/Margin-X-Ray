# Mobile homepage purpose

The original 375px homepage showed the index title, ranking link and search field before its first score of 63/100. A visitor had to read the price comparison to infer what the site does. A short sentence now explains, above search, that a creator's products can be compared with the same or similar items at other TikTok shops. Labels beneath the price scale explain the direction and its midpoint.

| 375 × 812, from top of viewport | Before | After |
| --- | --- | --- |
| Purpose under the title | — | 135–180px |
| Search field | 226–290px | 232–296px |
| Featured item price difference | 652–678px | 674–700px |

The first pass placed the search field at 279px and the price difference ended at 747px, only 10px above the bottom navigation. Moving the ranking link onto the search heading row and removing the extra mobile search shortcut recovered 47px. The final search field starts just 6px below its original position.

At 375 × 812 the entire featured card fits above the bottom navigation, including the $10.11 difference, 18.4% premium and similar-item label. At 375 × 667 the purpose, search, score scale, product name and receipt link are visible immediately. An 88px scroll brings the complete price difference above the fixed navigation. The desktop view keeps the prices and the difference alongside the featured score.

[Original phone](before-375.png) · [Revised phone](after-375.png) · [Original short phone](before-375-short.png) · [Revised short phone](after-375-short.png) · [Original desktop](before-1440.png) · [Revised desktop](after-1440.png)

## Checks

Chrome rendered the Pages build at widths of 320, 375, 768, 1024 and 1440px with no horizontal scrolling. At all five widths, exactly one full-ranking link was visible and its target was at least 44px tall. A keyboard user could open the full ranking, choose a suggestion with Arrow Down and Enter, and open a saved creator by typing their handle. The suggestion presented a decoded avatar, username and visible keyboard focus in a 55px-tall row. A fixture supplied the remote account and its empty report to exercise the unfamiliar-user flow. The featured receipt used the real saved Disney item and displayed $64.94, $54.83 and their $10.11 difference. All 15 featured archive entries rendered.

## Internal design review

| Dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 9 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted judgment | | 8.4 | 9.0 |

The two increases reflect the explicit purpose above the first action and the visible scale labels. The screenshots cover Chromium with keyboard and pointer checks. First-time visitor comprehension would require a user study.
