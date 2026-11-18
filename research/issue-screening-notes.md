# November 2026 product issue screening

On November 18 we checked the 21 price records across 12 creators selected in
`issue-screening-sample.json`. The selection uses all records present in commit
`d078be4`. The issue window is November 18, 2025 through November 17, 2026.
All 21 have source checks. All 12 creator reviews remain pending.

## Reproduce the structured searches

Run `python3 scripts/check-issue-sample.py /path/to/cache` with Python 3. It
downloads public files into the supplied cache and prints a JSON receipt. To
replay a saved run, use the same cached files. Compare SHA-256 digests before
comparing candidate lists because regulators revise exports. The checked-in
`issue-screening-receipt.json` retains URLs, file digests, date fields, row counts,
search results and the observed date span. `issue-screening-records.json` records
the terms and manual decisions. `creator-confidence-assessments.json` identifies
the existing relationship and listing evidence for each price record.

Searches use whole terms after case, accent, HTML entity, punctuation and
whitespace normalization. These are lexical searches. Abbreviations, unnamed
brands, missing distributor details and publication lags can hide relevant
records. Any candidate requires a manual market, model, variant, date and
applicable lot comparison. Sources have different scopes. Do not sum their row
counts to calculate a score or compare creators.

| Official source | In-window entries | Interpretation |
| --- | ---: | --- |
| FDA firm-issued notices | 43 in 2025 and 272 in 2026 | Search fields were brand, company and product description. The latest notice in the files was November 13. |
| FDA food enforcement download | 1,148 | Search fields were recalling firm and product description. The latest initiation date was October 26. |
| FDA cosmetics event download | 0 | Latest initial receipt was August 29, 2025. The November 2026 export date conceals a gap for this window. |
| CPSC US recalls | 574 | Searched all fields in the dated recall response for Sony and the model. Latest returned recall was November 12. |
| EU Safety Gate weekly reports | 3,709 | 51 published weekly files had 3,739 notification entries. Applied the date window to each alert as well. Latest file was November 13. |

The structured searches returned no term matches in the applicable in-window
records. Alerts from the Rapid Alert System for dangerous non-food products,
published free of charge on the [Safety Gate website](https://ec.europa.eu/safety-gate-alerts/).

## Manual checks and follow-up

- **NikkieTutorials.** Both Dutch founder-brand listings specify a product and
  size. Their Safety Gate searches also included reports from outside the
  Netherlands. In the Dutch NVWA search form, submitting `Nimya` triggered a
  successful search request with `searchTerm=Nimya` and an empty filter list.
  The response reported `total_results=0`. The third record is a US-reference
  Biodance mist. ASIN `B0GF86QJK7` identifies a 50 mL single bottle. The creator
  caption names Amazon and the product line and supplies no ASIN. The exact
  promoted pack remains open. [NVWA search](https://www.nvwa.nl/zoeken) ·
  [Brand specification](https://biodance.com/pages/collagen-peptide-jelly-serum-mist) ·
  [Seller listing](https://www.amazon.com/BIODANCE-Hydrating-Anti-Aging-Sprayable-Essentials/dp/B0GF86QJK7)
- **Mikayla Nogueira.** The two POV products have distinct names, functions and
  volumes. The Glaze It page's automated summary of customer reviews mentions
  pump operation. A dated test or attributable seller resolution for an identified
  unit is still needed. The L’Oréal listing enumerates five washable shades.
  The historical January 2023 post identifies the mascara line and leaves the
  exact shade unresolved. [POV product page](https://povbeauty.com/products/glaze-it) ·
  [L’Oréal listing](https://www.lorealparisusa.com/makeup/eye/mascara/telescopic-lift-mascara-washable)
- **Distributor and food records.** The December 26 Gold Star public notice names
  multiple brands and categories. We extracted text from all 44 pages of the
  official SKU and UPC attachment using PDFKit, then searched the terms for all
  18 US food and cosmetic targets. None matched. The attachment SHA-256 was
  `30d9cc5cd0f67508b4170ec0e451ff71d7f9c83dd729961215ccfab245e3708a`.
  Two separate openFDA food enforcement searches used `Feastables` in
  `recalling_firm` and `product_description`, constrained by the initiation
  date window. Both returned HTTP 404 with `NOT_FOUND` and `No matches found!`.
  The date-only control returned 1,148 records. A bulk export with the same
  in-window count allowed checking creator aliases. The two pack sizes still
  require a distinct-product decision. [Distributor notice](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/gold-star-distribution-inc-issues-recall-certain-fda-regulated-products-three-states-including-drugs) ·
  [Product schedule](https://www.fda.gov/media/190382/download?attachment) ·
  [Food enforcement query](https://api.fda.gov/food/enforcement.json?search=recall_initiation_date%3A%5B20251118+TO+20261117%5D+AND+product_description%3A%22Feastables%22&limit=1)
- **Sony.** The manufacturer-filtered CPSC search returned `[]`. A second
  search across the full dated response checked the model as well. Sony's
  indexed October 15 update describes new gaming audio support and general
  improvements. Its July 16 troubleshooting guide covers multiple models and
  potential app-related causes. Neither document establishes a dated product
  failure in the promoted unit. The promotion copy leaves the color unresolved.
  [CPSC manufacturer query](https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=2025-11-18&RecallDateEnd=2026-11-17&Manufacturer=Sony) ·
  [Firmware release](https://www.sony.com/electronics/support/software/00377141)

The FDA press-release table request returned HTTP 406. The annual XML downloads
succeeded. The FDA recall dashboard and enforcement search returned HTTP 403
and 404 respectively in this session. Their fuller cosmetics coverage remains
outstanding. The direct Sony firmware request returned HTTP 403. Sony notes,
the Amazon product, the POV review summary and the five L’Oréal shades were
read through indexed extracts. The original market and terms of each price
observation are retained. [FDA enforcement reports](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/enforcement-reports)
