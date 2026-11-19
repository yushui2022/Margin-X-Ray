# Shopping discovery review

The existing price-check homepage was evaluated with the task-specific rubric in [frontend-self-review.md](frontend-self-review.md). The design judgments below cover the local shopping interface. Prices, creator scores and votes come from their own evidence systems.

| Dimension | Weight | Before | First pass | Final |
| --- | ---: | ---: | ---: | ---: |
| Task access and hierarchy | 25% | 8 | 8 | 9 |
| Brand and visual composition | 20% | 9 | 9 | 9 |
| Readability and density | 15% | 9 | 8 | 9 |
| Interaction and feedback | 20% | 7 | 8 | 9 |
| Responsive behavior and accessibility | 20% | 9 | 9 | 9 |
| Weighted mean | | 8.4 | 8.4 | 9.0 |

The original homepage offered an accessible text field and a visible curated example. Screenshot evidence had no entry point. An off-directory handle opened creator research. A fresh video without a catalog match led directly to a manual listing form.

In the first pass the homepage accepted screenshots and opened live shopping reports from links and handles. A clipped screenshot yielded an inferred domain that OCR could read as a different merchant. A long title from TikTok Shop pushed the item price below the first screen. The final interface asks the shopper to confirm an inferred website URL. An explicitly visible full URL can continue automatically. Long titles use an excerpt from the merchant's wording, with the full original available in a disclosure. The source price appears directly beneath the title.

## Browser checks

- Measured the homepage and report at 320, 375, 768, 1024 and 1440 CSS pixels in Chrome. All five widths fit the viewport. Verified keyboard search submission, visible file-picker focus, source disclosures, archive navigation and recovery from a failed lookup.
- Exercised two variants, a market change, changing the selected SKU, submitting again, a confirmed item-price difference, unconfirmed offers, a bounded creator sample, site leads, a retry, a direct listing, invalid file type, screenshot routing and OCR search-text edits with isolated API responses. Those test responses were used only for browser interaction checks.
- Submitted a real video through the local service for a product with 20 store variants. Verified the merchant's full original title in the disclosure and the selected variant's price at every width. The service supplied a store price and returned no independently verified comparison. No checkout difference appeared.
- Uploaded real PNGs to the local OCR service. A cropped URL required confirmation and caused zero retailer lookups before the address was corrected. A complete website URL automatically opened the matching store check. Image bytes and OCR transcripts do not go in a share URL.
- A direct independent-store link returned a source-unavailable state during this check. The report identifies the original page, offers a retry, and preserves the archived price record where available. Shared voting and scoring were outside the change and no test votes were submitted.

| View | Desktop | Mobile |
| --- | --- | --- |
| Before | [1440 px](shopping-discovery-before-1440.png) | [375 px](shopping-discovery-before-375.png) |
| Shopping home | [1440 px](shopping-discovery-home-1440.png) | [375 px](shopping-discovery-home-375.png) |
| Live product result | [1440 px](shopping-discovery-product-1440.png) | [375 px](shopping-discovery-product-375.png) |
| Store source unavailable | [1440 px](shopping-discovery-store-1440.png) | [375 px](shopping-discovery-store-375.png) |
