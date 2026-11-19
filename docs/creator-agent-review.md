# Creator research lookup

The original off-directory page offered a product checker and a second username field. A visitor who entered a valid handle could not start an investigation. The first revision added a research workspace with a single start action, a four-step trail and a saved report. On a 375px screen the first report repeated the eligibility paragraph in two cards and used an inactive refresh button alongside the source link. The final version removes the repeated paragraph, shows the next refresh time, and moves the evidence disclosures closer to the score.

| Project rubric | Original | First revision | Final |
| --- | ---: | ---: | ---: |
| Task access & hierarchy | 5 | 8 | 9 |
| Brand & visual composition | 8 | 9 | 9 |
| Readability & information density | 7 | 8 | 9 |
| Interaction & feedback | 5 | 8 | 9 |
| Responsive behavior & accessibility | 8 | 8 | 9 |
| Weighted result | 6.5 | 8.2 | 9.0 |

These are design judgments for the creator-research task in desktop Chrome and emulated viewports. Physical devices and independent usability testing were outside this review.

## Browser checks

- Entered an off-directory TikTok profile URL for NASA using the homepage search at 375px. Opening the shareable URL made one read. Keyboard activation of **Run research** started the job. The account-matched TikTok public embed returned 11 public posts, yielding an evidence coverage score of 15.5/100 under `evidence-v3`. The Onion Score remained pending because its distinct product review requirements were unmet. The report remained accessible after refreshing the page.
- Checked both the idle workspace and saved report at 320, 375, 768, 1024 and 1440px. No horizontal overflow was measured, including with all 11 public post links and captions expanded. The main action measured at least 44px high at each width.
- Tested partial-name matching, exact handle, off-directory bare usernames, TikTok mobile profile URLs, known creator research, Back to report, the Products tab, directory filters, pagination, and fictional examples. Saved community feedback selection, switching and withdrawal were exercised in an isolated SQLite database.
- Used intercepted API responses for failed collection, cooldown expiry, queued work, retry, throttling, connection loss after a write, cached-report recovery and an eligible zero under the score rubric. Tested linked product candidates and regulator sources in disclosures. These scenarios used browser fixtures without saving synthetic records to application storage.
- The live browser lookup used TikTok’s public embed and the deterministic explanation. A credentialed TikHub or AI request was outside this UI run.

| Viewport | Original off-directory page | Start research | Collected NASA report |
| --- | --- | --- | --- |
| 375px | [Original](creator-agent-before-375.png) | [Lookup](creator-agent-idle-375.png) | [Report](creator-agent-report-375.png) |
| 1440px | [Original](creator-agent-before-1440.png) | [Lookup](creator-agent-idle-1440.png) | [Report](creator-agent-report-1440.png) |
