# Resumable TikTok Shop checks

The local English interface was reviewed using the fixed project rubric in [frontend-self-review.md](frontend-self-review.md). These are design judgments for the tested routes.

| Dimension | Weight | Before | First pass | Final |
| --- | ---: | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 8 | 9 | 9 |
| Brand and visual composition | 20% | 9 | 9 | 9 |
| Readability and density | 15% | 9 | 8 | 9 |
| Interaction and feedback | 20% | 7 | 8 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 | 9 |
| Weighted mean | | 8.4 | 8.7 | 9.0 |

The old shared field accepted a handle, but the submit button said “Check price” and the source guidance included independent stores. Reloading lost the active operation. The homepage now has an explicit creator mode, preserves the familiar video entry, and labels its archive example. A saved report address and the tab’s last-check link return to the same server job.

In the first pass a profile showed counts for posts, products and verified price differences. Reading the live sample showed why coverage matters. The summary now also states how many variants reached comparison and how many possible matches were found. A removed source SKU leaves the replacement selector blank, including when a single replacement remains. Items with temporarily unreadable details and items in an unsupported market have distinct messages.

## Checks

- Chrome at 320, 375, 768, 1024 and 1440 CSS pixels. The shopping homepage and profile report fit all five widths. The creator switch preserves keyboard focus in the field, accepts a bare handle and submits with Enter.
- Isolated server responses exercised queued, running, ready, failed and expired jobs. A reload during comparison, a reload of a finished report and reopening from the homepage each issued only a read of the saved job. Changing the market or explicitly checking a new SKU submitted a new operation. Queued and failed selections cleared the former SKU's result.
- The same isolated run verified that a pasted Amazon address and a screenshot containing only an independent-store URL initiated zero shopping jobs. A separate missing-SKU interaction started with one available replacement and issued zero new submissions until the shopper chose a version and pressed the seller check.
- A saved production-path result for `@ccollins15` was opened from the local API and reloaded on both desktop and mobile. Each browser issued two GET requests for the same job, with zero POST requests. The final saved run contained five posts and three linked products with four, seven and eight listed variants. The three default variants reached the seller comparison and returned zero verified differences. Source links for every sampled post opened in the disclosure. No votes or creator scores were changed.
- Routing and polling regression tests exercise the request methods, server ID and selected SKU. Type checking and the frontend build passed.

| View | Desktop | Mobile |
| --- | --- | --- |
| Before | [1440 px](shopping-job-before-1440.png) | [375 px](shopping-job-before-375.png) |
| Creator entry | [1440 px](shopping-job-entry-1440.png) | [375 px](shopping-job-entry-375.png) |
| Saved live report | [1440 px](shopping-job-result-1440.png) | [375 px](shopping-job-result-375.png) |
