# Creator username lookup on GitHub Pages

## Previous edition

With the 375px and 1440px Chromium viewports, the plain account handle `all_the_jazzy_things` and `@bethannyyyy` opened the expected price reports. The two searches `Jazzy` and `Jazzy.liveseller` led to “No saved check”. Submitting `Scotia Gamble` triggered a native validity error and left the search on the homepage. The homepage showed a search field above the featured report but offered no name matches while typing.

[Original desktop search](before-1440.png) · [Original mobile search](before-375.png)

## Saved creator lookup

Typing “Jazzy” now shows Jazzy.liveseller, the original account handle and the measured 63/100 in a 55px-high link. It opens the same price report using touch, click or the Down Arrow and Enter keys. Both the field label and its placeholder mention display names. “Scotia Gamble” and “Jazzy.liveseller” open the corresponding accounts. Typing “kim” and selecting “See all” gives seven archived results, including two different ranked creators scoring 58 and 53. The other directory entries carry the label “Profile”. The results URL also works when reloaded separately.

[Desktop suggestions](after-1440.png) · [Mobile suggestions](after-375.png) · [Desktop search results](results-1440.png) · [Mobile search results](results-375.png)

The locally built Pages project was tested in Chromium at 320, 375, 768, 1024 and 1440 CSS pixels. No horizontal overflow or missing resources were observed. Keyboard selection opened the same report at all five widths. Mobile and desktop also covered capitalization, an account with periods, a two-word name, the Khaby Lame directory profile, an unrated checked account, a TikTok profile URL, a shoppable video and the associated product URL. The video still opened the specific receipt showing a $10.11 observed difference.

| Internal review dimension | Previous edition | Saved lookup |
| --- | ---: | ---: |
| Task access and hierarchy | 7 | 9 |
| Brand and visual composition | 9 | 9 |
| Readability and information density | 8 | 9 |
| Interaction and feedback | 7 | 9 |
| Responsive behavior and accessibility | 8.5 | 9 |
| Weighted mean | 7.9 | 9 |

These observations cover the saved lookup and the linked reports. Responsive checks used desktop Chromium viewport emulation.

## Real-time lookup routing

An unlisted valid username can be submitted immediately. A partial handle such as “jazzy” also offers archived matches while typing. Choosing a saved match opens its report. Submitting the handle starts its live lookup. An unmatched display name with spaces offers an editable archive search.

Isolated browser responses exercised rate-limit feedback, a successful retry, an account with public posts and no linked product, and an account that TikTok could not find. The field issued zero live requests while typing. Submitting a username, selecting its TikTok lookup link or pasting its profile URL issued one request for the intended account. Only the public live run, when recorded, establishes the upstream data service was reachable.

## Live account suggestions

On the published GitHub Pages site, typing “tim” issued one debounced account search. The response supplied six accounts. Each row displayed its name, handle and a working avatar from TikTok. All six images decoded in Chromium. Before selection, the browser sent zero profile-report requests. Testing identified an earlier set of signed HEIC avatars that Chromium could not render. The revised images passed the same decode check.

[Live suggestions on desktop](public-suggestions-1440.png) · [Live suggestions on mobile](public-suggestions-375.png)

In the final anonymous-browser run, typing “tim” produced six real TikTok matches in approximately four seconds. All six avatar images decoded at 168 × 168 pixels. Selecting the first rendered result, @tim196400, sent one account request and received HTTP 200. The service checked five public posts, found no linked products, and showed “Unrated”. The account and post links were present. This was one actual query on this release. Results and response time may change on a later search.

[Selected account on mobile](public-selected-account-375.png)
