# Home search and ranking

The previous mobile homepage gave one featured creator most of the first screen. At 375 × 812 the link input began at y=705, the screenshot actions began behind the bottom navigation at y=757, and the next creators began at y=868. The desktop input began at y=793. The review prioritizes immediate access to the input and upload, and readable ranked rows.

| Design dimension | Before | Observation |
| --- | ---: | --- |
| Task access and hierarchy | 6 | Put input and image actions above the ranking and show several creators together. |
| Brand and visual composition | 9 | Retain the Onion Head identity, type and palette. |
| Readability and information density | 7 | Replace the featured receipt and secondary previews with aligned ranks, handles and scores. |
| Interaction and feedback | 8 | Give each visible creator a direct route to their receipt. |
| Responsive behavior and accessibility | 8 | Keep the phone upload control above the fixed navigation. |

[Previous phone](home-search-ranking/before-375.png) · [Previous desktop](home-search-ranking/before-1440.png)

Chromium checked the rendered homepage at 320, 375, 768, 1024 and 1440 CSS pixels. The opening table displayed ten creators. Expanding it exposed all 89 scored creators, and each displayed rank, handle and score matched the edition data. The four tied leaders each displayed #1 and 63/100. Opening the last creator and returning restored the expanded list and keyboard focus. Collapsing restored ten rows. The full ranking and first creator's receipt opened successfully.

On phone and desktop, pasting a creator profile, video or Shop product link preserved the text and submitted to the corresponding route. The review used the native browser clipboard for both links and PNGs, a file input for upload and a file drop on the entry field. An unsupported file produced an error. A simulated OCR service failure recovered on retry. Price-check and OCR responses were intercepted for routing and recovery checks. No vote or ranking data was changed.

A separate 375 px check pasted a PNG into the field and sent it through the local OCR endpoint. One request resolved @allicoolmom and @hiddengemssd and opened the two-creator selection step.

| Width | Input y | Upload y | First row y | Complete first-screen rows |
| ---: | ---: | ---: | ---: | ---: |
| 320 | 138 | 192 | 375 | 2 |
| 375 | 138 | 192 | 356 | 8 |
| 768 | 164 | 157 | 362 | 10 |
| 1024 | 181 | 174 | 400 | 7 |
| 1440 | 213 | 206 | 459 | 8 |

The first mobile pass clipped the placeholder at 320 px, crowded the score heading and moved the full-ranking link below the heading. The final pass shortened the placeholder, freed the score column from a decorative arrow and kept the full-ranking link beside the title. All five widths had zero horizontal overflow. The 320 px layout exposes a third creator's name and score above the navigation, with part of that row outside the usable height.

For these tasks the final self-review is 9/10 on each of the five dimensions. The search and upload precede the first ranked rows, the existing identity remains visible, and the table can be used with a keyboard at every tested width. No user engagement data was collected.

[Final phone](home-search-ranking/after-375.png) · [Final desktop](home-search-ranking/after-1440.png) · [Small phone](home-search-ranking/after-320.png)
