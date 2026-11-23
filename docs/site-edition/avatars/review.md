# Creator identity in saved price checks

The published price report for `@2412ya` showed a circle containing “2” on both mobile and desktop. Chrome also found the initial in the ranking row and the first local search suggestion. Each rendered a text span. The account already had a measured score and price observations.

The revised report displays Lelyshop’s portrait, display name and exact handle. On phone screens the face and score share the first line. The price comparison still opens for the selected item. At 375 px Chrome decoded a 144 px portrait and measured it at 42 px in the report, 34 px in the ranking list and 36 px in the suggestion. The inline ranking opened the same image. The first review exposed the missing account data, so the change populated the shared lookup using sourced profile metadata.

| Project review dimension | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Task access and hierarchy | 8 | 9 | Search, the ranking row and the product report identify the same account by portrait and name. |
| Brand and visual composition | 8 | 9 | The creator portrait sits next to the name. The separate Onion Score icon retains its established position. |
| Readability and information density | 8 | 9 | The display name and exact handle are visible alongside the price-index result. |
| Interaction and feedback | 8 | 9 | Selecting the account opened the expected inline row. Selecting the full ranking row opened the existing product permalink. |
| Responsive behavior and accessibility | 9 | 9 | Chrome exercised 320, 375, 768, 815, 1024 and 1440 px layouts with no horizontal overflow. The identity remains available as text. |
| Weighted design judgment | 8.2 | 9.0 | Internal review of the affected account-recognition path. |

| Viewport | Before | After |
| --- | --- | --- |
| 375 px | [Original](before-375.png) | [Revised](after-375.png) |
| 815 px | [Original](before-815.png) | [Revised](after-815.png) |

The baseline public edition supplied 15 portraits for 89 ranked accounts and 14 for 72 unrated accounts. All 29 supplied images decoded.

In the final Pages release preview, Chrome decoded all 89 ranked and all 72 unrated creator portraits. This adds 132 previously missing portraits across the two groups. The six-width account-path checks passed with the complete data loaded.
