import rubric from "../../research/creator-issue-rubric.json" with { type: "json" };
import coverageRubric from "../../research/creator-score-rubric.json" with { type: "json" };
import products from "../../research/creator-products.json" with { type: "json" };

export const sumEvidencePoints = (values) => values.reduce((sum, value) => sum + Math.round(value * 10), 0) / 10;
export const coveragePoints = (count, target, maximum) => Math.round(maximum * Math.min(Math.max(count, 0), target) / target * 10) / 10;
export const distinct = (values) => [...new Set(values.filter(value => value.trim()))];
export const sourceIndex = new Map(products.sources.map(source => [source.id, source]));
const hasSources = (product) => product.sources.some(id => sourceIndex.has(id));
export const usableProducts = (records) => [...new Map(records.filter(product => product.id && product.name.trim() && hasSources(product)).map(product => [product.id, product])).values()];
export const hasPrice = (product) => Number.isFinite(product.price.amount) && product.price.amount > 0 && /^[A-Z]{3}$/.test(product.price.currency);
export const hasContext = (product) => hasPrice(product) && !!product.price.market.trim() && !!product.price.conditions.trim();
export const hasPost = (product) => !!product.postUrl && /^https:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+$/.test(product.postUrl);

export function evidencePoints(input) {
  const records = usableProducts(input.products);
  const captions = input.matchedSample ? distinct(input.captionIds).length : 0;
  const points = {
    identity: captions ? 10 : 0,
    captions: coveragePoints(captions, coverageRubric.targets.captions, 10),
    leads: coveragePoints(distinct(input.commercialUrls).length, coverageRubric.targets.leads, 15),
    linkage: coveragePoints(distinct(records.filter(hasPost).map(product => product.postUrl)).length, coverageRubric.targets.linkage, 10),
    products: coveragePoints(records.length, coverageRubric.targets.products, 10),
    variants: coveragePoints(records.filter(product => product.variant.trim()).length, coverageRubric.targets.variants, 10),
    prices: coveragePoints(records.filter(hasPrice).length, coverageRubric.targets.prices, 10),
    context: coveragePoints(records.filter(hasContext).length, coverageRubric.targets.context, 5),
    compensation: 0,
    costs: 0,
  };
  // Financial criteria are reserved until reviewed primary records and a new
  // methodology exist. Descriptive notes and scenario inputs cannot award points.
  return { ...points, total: sumEvidencePoints(Object.values(points)) };
}

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const hasText = value => typeof value === "string" && value.trim().length > 0;
function validSource(source) {
  try { return !!source.label.trim() && validDate(source.observedAt) && ["http:", "https:"].includes(new URL(source.url).protocol); }
  catch { return false; }
}
const round = (value) => Math.round(value * 10) / 10;

export function issuePoints(review) {
  if (!review || review.version !== rubric.version || review.windowStart !== rubric.windowStart || review.windowEnd !== rubric.windowEnd
    || review.complete !== true || !hasText(review.selectionMethod) || !validDate(review.reviewedAt) || review.reviewedAt < review.windowEnd
    || !Array.isArray(review.products) || review.products.length < rubric.minimumProducts
    || new Set(review.products.map(product => product?.id)).size !== review.products.length) return null;
  let affected = 0, severitySum = 0;
  for (const product of review.products) {
    if (!product || !hasText(product.id) || !hasText(product.name) || !hasText(product.variant) || !hasText(product.reviewNote)
      || !validSource(product.creatorLink) || product.creatorLink.observedAt > review.reviewedAt
      || !Array.isArray(product.reviewSources) || !product.reviewSources.length
      || !product.reviewSources.every(source => validSource(source) && source.observedAt <= review.reviewedAt)
      || !Array.isArray(product.issues)
      || !["documented-issue", "no-documented-issue"].includes(product.outcome)) return null;
    if (product.outcome === "no-documented-issue" && product.issues.length) return null;
    if (product.outcome === "documented-issue" && !product.issues.length) return null;
    let severity = 0;
    for (const issue of product.issues) {
      if (!issue || !hasText(issue.id) || issue.status !== "confirmed" || !validDate(issue.occurredAt)
        || issue.occurredAt < review.windowStart || issue.occurredAt > review.windowEnd
        || !["regulator", "recall", "ruling", "test-report", "seller-resolution"].includes(issue.kind)
        || !hasText(issue.assessment) || !validSource(issue.source) || issue.source.observedAt < issue.occurredAt || issue.source.observedAt > review.reviewedAt
        || !Number.isFinite(rubric.severity[issue.severity])) return null;
      severity = Math.max(severity, rubric.severity[issue.severity]);
    }
    if (severity > 0) affected++;
    severitySum += severity;
  }
  const reviewed = review.products.length;
  const frequency = round(rubric.weights.frequency * affected / reviewed);
  const severity = round(rubric.weights.severity * severitySum / reviewed);
  return { total: sumEvidencePoints([frequency, severity]), frequency, severity, affected, reviewed };
}

// Only reviews explicitly admitted to this versioned collection may enter a score.
export function admittedReviewFor(handle, collection) {
  if (collection.version !== rubric.version) return undefined;
  const matches = collection.reviews.filter(review => review?.handle === handle);
  return matches.length === 1 ? matches[0] : undefined;
}
