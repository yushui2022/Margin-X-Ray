import archive from "../research/creator-products.json" with { type: "json" };
import samples from "../research/creator-screening.json" with { type: "json" };
import brandLeads from "../research/creator-brand-leads.json" with { type: "json" };
import captionReviews from "../research/creator-caption-reviews.json" with { type: "json" };
import ledger from "../research/issue-screening-records.json" with { type: "json" };
import screeningSample from "../research/issue-screening-sample.json" with { type: "json" };
import reviews from "../research/creator-issue-reviews.json" with { type: "json" };
import issueRubric from "../research/creator-issue-rubric.json" with { type: "json" };
import evidenceRubric from "../research/creator-score-rubric.json" with { type: "json" };
import { admittedReviewFor, evidencePoints, issuePoints, sourceIndex, usableProducts } from "../src/shared/creator-scoring.mjs";

const postsByHandle = new Map(samples.creators.filter(row => row.status === "sampled"
  && row.platformHandle?.toLowerCase() === row.handle).map(row => [row.handle, row]));
const disclosure = /(?:^|[^\p{L}\p{N}_])#(?:ad|sponsored|paidpartner(?:ship)?|affiliate|tiktokshop|publicidad|publi|werbung)(?![\p{L}\p{N}_])|\b(?:paid partnership|affiliate link|sponsored by)\b/iu;

function uniqueSources(sources) {
  return [...new Map(sources.map(source => [source.url, source])).values()];
}

function archivedLeads(handle, sample) {
  const fromCaption = captionReviews.reviews.filter(record => record.handle === handle).flatMap(record => {
    const post = sample?.posts.find(item => item.id === record.postId);
    return post ? [{ ...record, url: post.url, observedAt: sample.observedAt }] : [];
  });
  return [...brandLeads.leads.filter(record => record.handle === handle), ...fromCaption].map(record => ({
    kind: "reviewed", label: record.title, detail: record.note, url: record.url, observedAt: record.observedAt,
  }));
}

function archivedScreenings(products) {
  if (screeningSample.rubricVersion !== issueRubric.version || ledger.sampleId !== screeningSample.id) return [];
  return products.flatMap(product => {
    const row = ledger.products.find(item => item.id === product.id && screeningSample.productIds.includes(item.id));
    if (!row) return [];
    const keys = [...ledger.checks[row.group], ...(row.extra ?? [])];
    return [{ product: product.name, variant: product.variant, checkedAt: ledger.checkedAt, detail: row.note,
      next: ledger.nextByMarket[row.group], sources: keys.map(key => ledger.sources[key]) }];
  });
}

export function creatorIssueResult(handle, archiveReviews = reviews) {
  const review = admittedReviewFor(handle, archiveReviews);
  const points = issuePoints(review);
  const sources = points ? uniqueSources(review.products.flatMap(product =>
    [product.creatorLink, ...product.reviewSources, ...product.issues.map(issue => issue.source)])) : [];
  return {
    status: points ? "rated" : "pending", value: points?.total ?? null, version: issueRubric.version,
    windowStart: issueRubric.windowStart, windowEnd: issueRubric.windowEnd, minimumProducts: issueRubric.minimumProducts,
    weights: { ...issueRubric.weights }, frequency: points?.frequency ?? null, severity: points?.severity ?? null,
    affected: points?.affected ?? null, reviewed: points?.reviewed ?? null,
    reviewedAt: points ? review.reviewedAt : null,
    reason: points ? review.selectionMethod : `Publication requires a completed review of at least ${issueRubric.minimumProducts} distinct creator-linked products with dated primary evidence for ${issueRubric.windowStart} through ${issueRubric.windowEnd}.`,
    sources, products: points ? review.products : [],
  };
}

function explanationFacts(report) {
  const { coverage, score } = report;
  const status = score.status === "rated"
    ? `The Onion Score is ${score.value}/100. The reviewed sample found documented problems in ${score.affected} of ${score.reviewed} products.`
    : `The Onion Score is pending. ${score.reason}`;
  const candidates = report.leads.filter(item => item.kind === "caption").length;
  const facts = {
    sample: `The evidence includes ${coverage.captionCount} distinct public ${coverage.captionCount === 1 ? "caption" : "captions"} across the collected samples.`,
    coverage: `Research coverage is ${coverage.value}/100 under ${coverage.version}.`,
  };
  if (coverage.productCount) facts.products = `The archive contains ${coverage.productCount} priced product ${coverage.productCount === 1 ? "record" : "records"} for this account.`;
  if (candidates) facts.leads = `Disclosure language flagged ${candidates} ${candidates === 1 ? "post" : "posts"} for product follow-up.`;
  return { status, facts };
}

export function buildCreatorReport(handle, collection) {
  if (collection.profile.handle.toLowerCase() !== handle) throw new Error("The collected profile does not match this handle.");
  const sample = postsByHandle.get(handle);
  const products = usableProducts(archive.products.filter(product => product.handle === handle));
  const reviewed = archivedLeads(handle, sample);
  const posts = [...new Map(collection.posts.filter(post => /^\d+$/.test(post.id)
    && post.url === `https://www.tiktok.com/@${handle}/video/${post.id}`).map(post => [post.id, post])).values()];
  const leads = [...reviewed];
  for (const post of posts) {
    if (disclosure.test(post.caption) && !leads.some(lead => lead.url === post.url)) {
      leads.push({ kind: "caption", label: "Disclosure in a public caption", detail: post.caption,
        url: post.url, observedAt: collection.observedAt });
    }
  }

  // A newly fetched sample can overlap the archive. Only human-selected leads
  // are eligible for evidence-v3, even when disclosure keywords are explicit.
  const captionIds = [...new Set([...(sample?.posts ?? []), ...posts].filter(post => post.caption.trim()).map(post => post.id))];
  const points = evidencePoints({ matchedSample: true, captionIds, commercialUrls: reviewed.map(lead => lead.url), products });
  const coverageSources = [];
  if (sample) coverageSources.push({ label: "Archived caption sample", url: sample.sourceUrl, observedAt: sample.observedAt });
  for (const lead of reviewed) coverageSources.push({ label: lead.label, url: lead.url, observedAt: lead.observedAt });
  for (const product of products) {
    for (const sourceId of product.sources) {
      const source = sourceIndex.get(sourceId);
      if (source) coverageSources.push({ label: source.label, url: source.url, observedAt: archive.observedAt });
    }
  }
  const report = {
    handle, profile: collection.profile, posts, provider: collection.provider, observedAt: collection.observedAt,
    warnings: [...collection.warnings], leads, score: creatorIssueResult(handle), screenings: archivedScreenings(products),
    coverage: { version: evidenceRubric.version, value: points.total, captionCount: captionIds.length,
      productCount: products.length, points, archivedSources: uniqueSources(coverageSources) },
  };
  const { status, facts } = explanationFacts(report);
  return { ...report, explanation: [status, facts.products ?? facts.sample].join(" ") };
}

/** The model selects supporting facts. Only sentences emitted by the scoring code reach the reader. */
export async function explainCreatorReport(report, { apiKey, model, baseUrl = "https://api.openai.com/v1", fetchImpl = fetch, signal } = {}) {
  if (!apiKey || !model) return report.explanation;
  const { status, facts } = explanationFacts(report);
  try {
    const url = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) return report.explanation;
    url.pathname = url.pathname.replace(/\/$/, "") + "/chat/completions";
    const deadline = AbortSignal.timeout(7000);
    const response = await fetchImpl(url, { method: "POST", redirect: "error", signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_completion_tokens: 200, response_format: { type: "json_object" }, messages: [
        { role: "system", content: 'Choose one or two supporting facts that best explain this public research report. Return JSON of the form {"facts":["sample"]} using only the supplied fact keys.' },
        { role: "user", content: JSON.stringify({ status, facts }) },
      ] }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return report.explanation;
    }
    let bytes = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 32 * 1024) return report.explanation;
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const chosen = JSON.parse(data.choices?.[0]?.message?.content).facts;
    if (!Array.isArray(chosen) || chosen.length < 1 || chosen.length > 2 || chosen.some(key => typeof key !== "string" || !Object.hasOwn(facts, key))) return report.explanation;
    return [status, ...new Set(chosen.map(key => facts[key]))].join(" ");
  } catch {
    return report.explanation;
  }
}
