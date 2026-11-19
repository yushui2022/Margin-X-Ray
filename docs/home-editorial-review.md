# Shopping homepage visual review

The comparison used the live shopping homepage and five dimensions in the project’s frontend review. The screenshots use 375 × 812 and 1440 × 900 viewports.

| Dimension | Before | Observation |
| --- | ---: | --- |
| Task access and hierarchy | 9 | Search, upload and multiple ranked creators were already visible when the page opened. |
| Brand and composition | 7 | The large plum form and compact table had similar visual weight. The Onion Head illustration appeared only as a small navigation icon. The previous edition gave the index a distinct masthead, illustration and price receipt. |
| Readability and density | 8 | Every creator had a legible score. At desktop width, the handles and short score bars had a long gap between them. |
| Interaction and feedback | 9 | Rows linked to their receipts and the list expanded in place. |
| Responsive behavior and accessibility | 9 | Search, upload and rows fit on phones, with a keyboard-accessible expansion control. |

[Before on phone](home-editorial/before-375.png) · [Before on desktop](home-editorial/before-1440.png)

## Revised edition

An edition date and a large serif masthead introduce the top search field. A plum and cream receipt sits beside the desktop table. The receipt follows the list on phones. The rank, account and score remain in aligned columns. At larger widths, each row also shows the creator's median premium across scored products.

A browser opened the local homepage from both the root URL and the shopping route. It matched all 89 ranks, handles and scores to the edition data, expanded and collapsed the default ten rows, and opened the full ranking. Browser Back restored the expanded table and focus to the last selected creator. The receipt link opened its specific product. The receipt displayed the observed $64.94 and $54.83 prices, a $10.11 difference, a similar-item estimate and one reference shop.

On phone and desktop, the tests pasted a profile URL, video URL and Shop listing into the search field and checked the request and destination. They exercised image upload, clipboard paste, drag and drop, invalid file feedback and recovery after a simulated OCR outage. A separate PNG of two creator URLs was sent to the actual local OCR endpoint. A single request correctly found both accounts. The price-check responses used in navigation tests were intercepted locally.

The first narrow-phone pass wrapped the masthead and ranking heading onto two lines each. At 320 × 568 only one full row fit above the bottom navigation. On the first desktop pass the creator whose receipt was featured could be identified by the link’s accessible name.

The final narrow masthead uses cream and apricot type with the mascot on plum. Both headings now fit on one line at 320 px. The receipt link visibly names the creator. The final pass compared the percentage in every row against the median item-price gap from the underlying receipt prices. All 89 matched.

| Viewport | First row y | Full rows above the navigation | Horizontal overflow |
| --- | ---: | ---: | ---: |
| 320 × 568 | 388 | 2 | 0 |
| 375 × 812 | 402 | 7 | 0 |
| 768 × 1024 | 478 | 10 | 0 |
| 1024 × 768 | 470 | 5 | 0 |
| 1440 × 900 | 516 | 7 | 0 |

The final local judgment is 9/10 for each of the five dimensions. Task access and hierarchy retain the input and ranking in the opening view. The custom edition masthead, illustration and receipt establish a recognizable composition. The aligned columns and visible source attribution improve the reading of the rankings and supporting prices. The lookup and receipt navigation passed their interaction checks, and all five viewport widths fit. This review covers the tested layouts and functional paths.

[Final phone](home-editorial/after-375.png) · [Final desktop](home-editorial/after-1440.png) · [Small phone](home-editorial/after-320.png)
