# Homepage creator search and report progress

## Design review

On the previous public build, submitting **Hank Green** opened a separate results page. Selecting **@hankgreen1** then opened a report page with a single loading sentence. Both transitions removed the homepage search from view. The desktop and phone captures show the report request held briefly, then released to the public service. [Original phone](before-375.png) · [Original desktop](before-1440.png)

| Dimension | Weight | Before | After |
| --- | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 7 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 8 | 9 |
| Interaction and feedback | 20% | 7 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted design judgment | | 8.0 | 9.0 |

Search stays above the candidates and report. Back to matches returns to the same name. Close restores the creator archive and focuses the search field. On the first phone render, the result summary wrapped the last letter of “Unrated” onto another line. After the type adjustment, the word fits at both 320 and 375 pixels. The scores reflect an internal review of these flows in Chrome.

| Preview state | Phone | Desktop |
| --- | --- | --- |
| Account choices with names and avatars | [375 px](matches-375.png) | [1440 px](matches-1440.png) |
| Recent posts in progress | [375 px](progress-375.png) | [1440 px](progress-1440.png) |
| Five posts checked, zero linked products | [375 px](report-375.png) | |

## Interaction evidence

- The live baseline search for **Hank Green** returned six candidates. The real response for **@hankgreen1** contained five checked posts, zero linked products and a partial result. The preview replayed those captured responses. A local HTTP stream held each stage on demand for repeatable screenshots and checks.
- At 320, 375, 768, 1024 and 1440 pixels, the address, search field and entered name persisted through account selection and report loading. Clicking a candidate and pressing Enter both opened the result in place. The page stayed within the viewport width and reported no uncaught JavaScript errors.
- The four progress labels follow the service events. A no-product result skipped shop prices. A controlled exact-match fixture verified the comparison stage with three checked posts and one product, a $60 and $50 pair, $10 potential savings and a 65/100 score. This fixture lived in the test session only.
- A partial response retained the checked posts and showed Unrated. A recoverable service error exposed Retry lookup and a second request completed. A cached JSON response rendered the report immediately. Replacing or clearing an in-flight search kept the late response out of the new view.
- Arrow keys focused an autocomplete candidate. Escape dismissed the dropdown and restored input focus. Enter selected the account inline. A failed name lookup exposed Retry TikTok search, and an empty response showed the no-matches message.
- Real saved receipts opened inline for **@all_the_jazzy_things** and the original video link. The data showed 63/100, $64.94 and $54.83. The product link exposed eleven saved matches and opened the selected receipt. An unknown product link displayed the missing-receipt message on the homepage.

## Published verification

On the public Pages build `535d6ae`, a 375 px Chrome session submitted **Hank Green** and selected **@hankgreen1**. The public service streamed Profile, Recent posts and Verdict. The report showed five posts, zero products and Unrated. Returning to the same candidate list and searching for the saved **@all_the_jazzy_things** report displayed 63/100. The original search field stayed mounted and the browser recorded zero hash changes.

A separate uncached public service lookup for **@mkbhd** reached Profile at 5.3 seconds, Recent posts at 6.2 seconds, Shop prices at 23.2 seconds and Verdict at 28.1 seconds. The report arrived at 28.3 seconds with one linked product from five posts and no qualifying cross-shop score. These timings describe this request.
