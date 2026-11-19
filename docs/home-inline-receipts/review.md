# Inline creator price receipts

The published homepage displayed a price comparison above the archive. Its product, gap and score repeated the first creator entry. Selecting another creator's name navigated to a separate report. The revised entries open their own comparison under the selected post, with links to its TikTok video and full price sources.

| From the top of the homepage | Before | After |
| --- | ---: | ---: |
| First creator row at 375 × 812 | 1,001px | 445px |
| First creator row at 1440 × 900 | 1,072px | 606px |
| Expanded comparisons on initial load | 1 | 0 |

[Original mobile](before-375.png) · [Collapsed mobile](collapsed-375.png) · [Expanded mobile row](expanded-375.png)

[Original desktop](before-1440.png) · [Collapsed desktop](collapsed-1440.png) · [Expanded desktop row](expanded-1440.png)

## Interaction and data checks

Chrome rendered the Pages build at 320, 375, 768, 1024 and 1440px wide. At each width, all 15 rows started collapsed and the horizontal viewport fitted both open and closed states. Enter opened a focused row and Space closed it with focus on its summary. Searching by an archived handle opened its creator page, Browse all opened the rankings, and the price-sources link opened and focused the exact product on its creator report.

At 375px, each of the 15 expanded cards matched its archived handle, video URL, product ID, two quoted prices, creator score and number of scored products. For example, Bethanny's summary and expanded card both showed the two-product creator score of 58. The associated product's own score was 53. Two creators promoting the same Disney table could remain open together, each with its own video and report. Tapping the portrait, score, product or caption toggled the row. Reopening an entry reused a single card. Each original-post link opened the expected TikTok URL in a separate tab. A local response intercepted the external video request, so this check covered the link destination.

## Internal design review

| Dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 8 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted judgment | | 8.2 | 9.0 |

The first phone viewport now fits two complete creator entries. The summary chevron shows the disclosure state, and the expanded card preserves direct access to the post and evidence. The final visual pass added an underline to the post link and identified the full-ranking position with “overall.” The scores reflect internal Chromium review with touch emulation and keyboard testing.
