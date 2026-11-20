# Creator search submission

## Published baseline

In a fresh Chrome session on GitHub Pages, typing **Hank Green** returned six public TikTok account suggestions, headed by **Hank Green · @hankgreen1**. Clicking **Search** returned **No creators found**. On mobile, typing **Jazzy** showed the saved **Jazzy.liveseller · @all_the_jazzy_things** record, while Search opened a live lookup for another account, **@jazzy**. The exact saved username opened its existing 63/100 report. Pasting the unranked Hank Green profile URL opened a public report for the correct account, which reported five recent posts, zero linked products and an unrated score.

[Original phone](before-375.png) · [Original desktop](before-1440.png)

## Revised flow

Submitting the same display name now opens a headed results page. Each candidate displays its name, handle and a link to its price check. Selecting **@hankgreen1** opens its report. Selecting **Jazzy.liveseller** from the results for **Jazzy** opens the saved 63/100 report. An explicit **@all_the_jazzy_things**, a Hank Green profile link with a sharing query, and the saved Jazzy video link each led to their corresponding report in the release build. The video landed on the original product receipt.

[Revised phone](after-375.png) · [Revised desktop](after-1440.png)

Chrome at 320, 375, 768, 1024 and 1440px showed all six Hank Green matches without horizontal overflow. The first match had a touch target at least 44px high and could be selected by keyboard. A mobile submission during autocomplete reused the in-flight request. An empty response offered another search or an exact username. A simulated HTTP 503 preserved saved Jazzy matches, and **Retry TikTok search** restored remote results. The local release preview replayed captures from the actual public suggestions and profile service so each viewport could test identical account data.

A fresh mobile-width browser on the published GitHub Pages build also submitted **Hank Green** with no network substitution. The public suggestions endpoint returned HTTP 200 with six matches. Selecting **@hankgreen1** returned HTTP 200 from the public creator service, and the report disclosed a partial check covering five posts and zero linked products.

| Review dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 6 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted design judgment | | 7.8 | 9.0 |

The revised hierarchy names the active query and keeps candidate accounts visible after submission. Row labels distinguish saved scores from available checks. Viewport, keyboard and recovery findings are limited to the tested Chromium build.
