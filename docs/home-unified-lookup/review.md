# Homepage ranking entry and creator suggestions

## Published baseline

On GitHub Pages build `9370ab2`, selecting Jazzy from the homepage list opened a shopping card beneath the post. Entering the same creator’s handle in Search opened a five-row ranking with a different summary and sources layout. Both showed the same 63/100 score. The two separate views made it hard to recognize the same checked account.

| Before | 375 px | 1440 px |
| --- | --- | --- |
| Homepage list | [Phone](before-archive-375.png) | [Desktop](before-archive-1440.png) |
| Search | [Phone](before-search-375.png) | [Desktop](before-search-1440.png) |

One real mobile-width Chrome lookup for “Hank Green” showed @hankgreen1 after 4,814 ms. The browser waited 252 ms before sending the request and another 4,560 ms for the response headers. These timings describe a single request over the test connection.

| Internal review dimension | Weight | Before | After |
| --- | --- | --- | --- |
| Task access and hierarchy | 25% | 8 | 9 |
| Brand and visual composition | 20% | 9 | 9 |
| Readability and information density | 15% | 9 | 9 |
| Interaction and feedback | 20% | 7 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 |
| Weighted design judgment | | 8.4 | 9.0 |

## Revised interaction

Opening a featured creator and selecting their search match now show the same highlighted row, rank, neighbors, sampled product, price comparison and source links. All 15 featured accounts matched across the two paths. Closing the result restored the original list button and its screen position within two pixels for all 15. Two representative accounts passed at 320, 375, 768, 1024 and 1440 px, with mouse, emulated touch or keyboard activation. The search field instance and URL persisted throughout. The ranking and source links fit the viewport without horizontal scrolling or browser script errors.

[375 px](after-375.png) · [1440 px](after-1440.png)

## Suggestion timing

For a comparable timing run, Chrome replayed recorded account data with a fixed 360 ms response delay. Timing started on the field’s input event and ended when the matching candidate was inserted into the dropdown. An already loaded directory match for Jazzy appeared within 1 ms on both builds.

| Input sequence | Before | After |
| --- | ---: | ---: |
| First remote suggestion for hank | 616 ms | 518 ms |
| Keep typing to hank g | 615 ms | 1 ms |
| Return to hank after a different name | 615 ms | 1 ms |

The five-input sequence issued five requests before the change and three afterward. On refinement, an already verified, text-matching account appears provisionally while the exact query is still checked. The revised cold lookup still depends on the provider. These figures describe individual DOM updates in the tested Chrome environment and do not include subsequent avatar image loading.

## Published check

On GitHub Pages build `fd088cb`, Chrome at 375 and 1440 px showed the same rank, prices, variant and source URLs for @ka.devore whether opened from the list, submitted by handle or selected by display name. Closing restored focus to the clicked list row. The page URL stayed the same throughout. On the public site, after a live lookup for Hank Green returned @hankgreen1, editing the query to “hank gre” showed that candidate in 1 ms. Returning to the original query showed it in under 1 ms.
