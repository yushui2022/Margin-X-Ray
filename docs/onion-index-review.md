# Rotten Onion Index · design review

Historical feature review. The vote-share formula and Early labels described
below were superseded by `confidence-v1`; see `confidence-ranking-review.md`.

Scope: a community disagreement index and score-band onion illustrations in
directory rows and real creator reports. Evaluated with the fixed rubric in
`frontend-self-review.md`. Scores below are agent judgments about this feature's
presentation, not independent product or creator ratings.

| Dimension | First rendering | After visual refinement |
| --- | ---: | ---: |
| Task access & hierarchy | 9.0 | 9.0 |
| Brand & visual composition | 8.5 | 9.0 |
| Readability & information density | 8.5 | 9.0 |
| Interaction & feedback | 9.0 | 9.0 |
| Responsive behavior & accessibility | 9.0 | 9.0 |

The first rendering placed 34px icons next to the index, but the marks and
expressions were too small. The refinement uses 42px directory icons and a wider
desktop feedback column; the report icon is 56px. A collapsible five-state scale
shows 48px examples, labels, exact ranges and the formula. Text labels and altered
leaf/expression shapes supplement color. All icons are local, scalable SVG paths.

The index is down-vote share, rounded to one decimal, not the inverse of evidence
coverage. This preserves the distinction between collected research and community
opinion. It starts unknown when no votes exist. Loading, unavailable and no-vote
states are distinct. Fewer than five votes receive an Early label. A single vote
can produce an extreme value; no statistical confidence is implied.

Validation: 63 unit/API tests passed, including every band boundary, round-before-
classification behavior, zero/invalid counts and distinct local assets. Browser
checks covered all five bands and the neutral state, images actually loading,
API-backed counts in an isolated SQLite database, switching and withdrawing votes,
refresh persistence, Early labels, unchanged evidence scores, failure/retry and
the expanded legend at 320/375/768/1024/1440. Existing directory/report voting,
keyboard, pagination and search regression checks also passed.

Screenshots were inspected for the desktop scale, desktop directory and mobile
directory. All seeded votes belonged to a temporary test database. The real vote
database was not modified by validation. Testing was in Chromium; no independent
user study or cross-browser certification is claimed.

The image-generation service failed because of invalid credentials. No generated
asset was used; the six illustrations were authored locally as SVGs.
