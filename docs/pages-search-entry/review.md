# Search from the public Pages address

## Before

The URL in GitHub Pages settings served the same application as the versioned link. On the November 20 build `535d6ae`, opening the bare site address added `#shop`. The homepage search displayed the saved 63/100 report for **@all_the_jazzy_things** in place, but hid the creator archive.

| Public entry | Phone | Desktop |
| --- | --- | --- |
| Homepage before searching | [375 px](home-before-375.png) | [1440 px](home-before-1440.png) |
| Homepage with a report | [375 px](report-before-375.png) | [1440 px](report-before-1440.png) |

| Internal design judgment | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 8 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 9 | 9 |
| Interaction and feedback | 20% | 8 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted mean | | 8.6 | 9.0 |

## After

| Homepage | Phone | Desktop |
| --- | --- | --- |
| Search field and creator archive | [375 px](home-after-375.png) | [1440 px](home-after-1440.png) |
| Saved match above the creator archive | [375 px](matches-after-375.png) | |
| Account selected, compact price receipt | [375 px](report-after-375.png) | [1440 px](report-after-1440.png) |

- At 320, 375, 768, 1024 and 1440 px the release preview opened at the bare address. Submitting **Jazzy**, choosing the account from the results and directly activating the autocomplete avatar all kept the same URL and input element. Browser instrumentation recorded zero history writes and zero hash changes. The archive remained below the active search throughout.
- Clicking **Search** kept focus on the button. Enter in the field kept focus on the field. Choosing a keyboard-focused suggestion transferred focus to the result heading. With the viewport scrolled 90 px, each activation kept the same scroll position and search-field coordinates, including a touch tap on the avatar.
- The first inline report initially displayed the full source details below the score. A second pass put the product, both prices and the gap on the collapsed receipt. The saved report showed 63/100, $64.94, $54.83 and a $10.11 gap at every width. “View full price report” expanded in place with the same prices and collapsed again. On a 375 × 812 viewport, the creator archive began at y=671, within the first screen.
- Back to matches, Close, the earlier versioned homepage link and the standalone report link worked. The document fit the viewport at every tested width and Chrome reported no JavaScript errors.

This internal review covered Chromium with mouse, keyboard and emulated touch. The five-width preview checks used a saved account and a controlled empty remote response so account selection could be repeated without paid lookups.

## Public Pages check

GitHub Pages built revision `a59fb79`. Fresh mobile-width touch and desktop Chrome sessions opened the repository's canonical Pages URL without a query or fragment. Both submitted Jazzy with Search, selected the match, and separately selected its avatar directly from autocomplete. Each session recorded one initial document request and zero URL changes. The original input and ranking stayed on the page while the 63/100 report expanded and collapsed. No API responses were substituted in these sessions.
