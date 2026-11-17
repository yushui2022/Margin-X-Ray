# Full-roster initial research · 2026-11-17

All 500 directory handles were requested from the official public creator embed
(`https://www.tiktok.com/embed/@HANDLE`). 499 returned usable identity-matched
samples: 5,212 caption records, with 2–13 posts per successful account. `yahia_x`
returned HTTP 400 on the initial attempt and retry. This is an access failure,
not evidence of account deletion or absence of products.

This completes an initial collection pass across the roster, not 500 complete
product investigations. Samples are platform-selected and can contain old or
pinned posts. Publication dates are null because this response supplies no
timestamps. Videos, audio, frames, on-screen sponsorship labels, TikTok Shop
anchors, checkout offers and livestreams have not been reviewed. Do not infer
that a missing phrase means an absent disclosure, brand or promotion.

## Evidence files

- `creator-screening.json`: one retrieval outcome per handle, returned identity,
  biography, original post URLs/captions, access method, time and snapshot hash.
- `creator-caption-reviews.json`: 157 manually selected captions from across the
  roster. Each record points to an exact collected post and explains its remaining
  gaps. Selection is not an exhaustive manual review of all 5,212 posts.
- `creator-brand-leads.json`: 16 external brand/offer findings, attributed to
  official pages, company releases or explicitly identified secondary reporting.
- Combined follow-up coverage: 173 leads across 153 creators. Leads can concern
  services or brand-level campaigns without identifying a physical product.
  They have no accepted-price field and do not enable financial calculators.
- `creator-products.json`: 21 separately accepted reference-price records across
  12 creators, with 48 sources and three baseline unresolved leads. These counts
  overlap the sampling and follow-up counts; do not add them as unique creators.

The literal multilingual keyword, URL and mention patterns are triage aids.
388 profiles contain at least one automated cue. A person's mention, a music
release, a public-service message or a shopping joke can trigger a cue. We do not
turn those matches into commercial evidence automatically. The matcher also
misses stylized Unicode and some languages/disclosures. Retained captions allow
further review beyond the selected leads.

Financial contracts, creator ownership percentages, settlements, costs and
personal distributions remain unknown. Public founder/partner statements are
attributed statements, not audited ownership or verified income. All 500 real
profiles remain unrated.

## Recollection and provenance

```sh
python3 scripts/collect-creator-screening.py --cache /path/to/dated-cache --observed-at YYYY-MM-DD
```

Reuse the cache only for the same observation date; use a new directory for a
fresh date. Add `--retry-unavailable` to retry failed outcomes. The final record
stores the most recent attempt, not a complete attempt log. Limited runs with
`--limit` write only to the cache, not the committed full-roster artifact.

The collector validates requested/returned handles, rejects private accounts,
skips private and other-author posts, requires numeric post IDs and rejects
duplicate IDs. It stores whitelisted public metadata and redacts contact email
addresses. Other public bio text is retained as source text; it is not verified.
Raw HTML snapshots and extraction cache files remain outside the repository.
SHA-256 values identify the original response bytes before extraction/redaction.
Media URLs, cookies, tracking payloads and platform state are not committed.

The UI inserts source text using `textContent`. Only structured source URLs
become clickable links. Captions, clinical claims, offers and biographical claims
are attributed to their sources and must not be treated as app endorsements.
Collection is an offline dated snapshot; user-entered handles do not trigger a
live search or automatically queue work.
