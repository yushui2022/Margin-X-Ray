# Launch directory: 500 creators

Collected 2026-11-17. This is a starter directory of public TikTok accounts, not
500 completed product investigations or rated creators.

## Selection and provenance

- Preserve the four profiles with existing product research and their portraits.
- Read 25 public pages of the [Famadex TikTok people ranking](https://famadex.com/en/ranking/tiktok/people/).
- Parse valid handles, deduplicate by lowercase handle, and select in source-rank
  order until the combined roster contains exactly 500 accounts. The collection
  yielded 499 valid source rows and added 496 profiles after retaining the four.
- Save the name, handle, original image URL, directory page, directory profile
  URL, source rank, rounded follower count, source category, available country
  label, and observation date. `creator-seed-evidence.json` contains row extracts
  and the SHA-256 of each source HTML page. Full HTML snapshots stay in the
  collector's local cache, outside the repository.
- Download and convert each new directory portrait to a 96×96 WebP. Existing
  portraits retain their original local format/size and source. All 500 portraits
  are local, with an initials fallback if the browser cannot load one.

The roster includes celebrities and large creators across the global directory.
It is not asserted to be the definitive global top 500, a list of verified
TikTok Shop affiliates, or a representative sample of shopping recommendations.
Name/handle associations and newly collected portraits come from a secondary
directory; individual TikTok accounts were not independently retrieved.

497 profiles have a rounded directory follower observation. Three retained
profiles (Glamzilla, Mrwhosetheboss and NikkieTutorials) were outside this source
sample and keep their follower counts null. Observation date means the date we
read the directory, not the source's underlying TikTok measurement date. Current
figures may differ from the retained snapshot. Follower count never contributes
to the Onion Score.

The source categories in this collection are "Public figure" and "Content
creator". These do not support assigning Beauty, Tech or another product niche;
new accounts therefore use Uncategorized. Country labels are also explicitly
attributed to the directory, not independently verified nationality/location.

## Product behavior

The page shows 20 profiles at a time, with full-collection name/handle search,
follower/name sorting, category filtering, a product-evidence filter and numbered
pagination. All 500 known handles resolve locally to their own report routes.
Unknown handles remain unsupported by live retrieval. Images load lazily.

The four researched profiles retain their eight product records. New profiles
show "Research not started" in Products & earnings, rather than an empty panel
or copied product claims. All real scores remain null. The six fictional scoring
examples remain in their separate view.

## Recollection

The collector uses Python 3 and Pillow. Run with a new cache directory for a new
observation date; reuse an existing cache only to reproduce that date's snapshots:

```sh
python3 scripts/collect-creator-seed.py --cache /path/to/dated-cache --observed-at YYYY-MM-DD
```

The script retains profiles outside the launch-seed collection, validates handles
and decoded portraits, and refuses to invent records to reach the target. Review
changes before committing a fresh collection. Source observations can change.
