import archive from "../research/creator-products.json" with { type: "json" };
import ledger from "../research/issue-screening-records.json" with { type: "json" };
import rubric from "../research/creator-issue-rubric.json" with { type: "json" };

const foodByProduct = new Map(ledger.products.filter(product => product.group === "US food").map(product => [product.id, product]));

export function validGtin(code) {
  if (typeof code !== "string" || !/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length) || /^0+$/.test(code)) return false;
  const digits = [...code].reverse().map(Number);
  return digits.reduce((sum, n, i) => sum + n * (i % 2 ? 3 : 1), 0) % 10 === 0;
}

function targetsFor(handle, posts, candidates) {
  const targets = new Map();
  const productIds = new Set([...archive.products.filter(product => product.handle === handle).map(product => product.id),
    ...candidates.flatMap(candidate => candidate.listings.map(listing => listing.id))]);
  for (const id of productIds) {
    const food = foodByProduct.get(id);
    if (!food) continue;
    for (const term of food.terms) {
      targets.set(term, { label: term, field: "product_description", term });
    }
  }
  for (const post of posts) {
    for (const match of post.caption.matchAll(/\b(?:UPC|EAN|GTIN)(?:-\d{1,2})?\s*[:#]?\s*(\d{8,14})\b/gi)) {
      if (validGtin(match[1])) targets.set(match[1], { label: "Product code " + match[1], field: "code_info", term: match[1] });
    }
    if (targets.size >= 3) break;
  }
  return [...targets.values()].slice(0, 3);
}

// These are leads. A text/code match still needs market, variant, lot and date review.
// An unavailable source, as well as a successful empty query, earns no issue points.
export async function checkRecallSources(handle, posts, { signal, fetchImpl = fetch, candidates = [] } = {}) {
  const observedAt = new Date().toISOString().slice(0, 10);
  return Promise.all(targetsFor(handle, posts, candidates).map(async target => {
    const url = new URL("https://api.fda.gov/food/enforcement.json");
    const from = rubric.windowStart.replaceAll("-", ""), to = rubric.windowEnd.replaceAll("-", "");
    url.searchParams.set("search", `recall_initiation_date:[${from} TO ${to}] AND ${target.field}:"${target.term}"`);
    url.searchParams.set("limit", "3");
    const check = { label: "openFDA food recalls · " + target.label, url: url.href, observedAt };
    try {
      const timeout = AbortSignal.timeout(6500);
      const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: "error", headers: { Accept: "application/json" } });
      if (!response.ok && response.status !== 404) throw new Error("Provider unavailable");
      const data = await response.json();
      if (response.status === 404 && data?.error?.code === "NOT_FOUND" && /no matches found/i.test(data.error.message)) {
        return { ...check, status: "no-match", detail: "The query returned no matching U.S. food recall records in the scoring window. Coverage is limited to this database and search term." };
      }
      if (!response.ok || !Array.isArray(data.results) || !data.results.length) throw new Error("Invalid response");
      const ids = data.results.slice(0, 3).map(row => String(row.recall_number ?? "").slice(0, 60)).filter(Boolean);
      return { ...check, status: "candidates", detail: `Candidate records${ids.length ? " (" + ids.join(", ") + ")" : ""}. Review the market, product identifier and affected lot before attributing an issue.` };
    } catch {
      signal?.throwIfAborted();
      return { ...check, status: "unavailable", detail: "The live U.S. food enforcement search was unavailable. The query can be retried at the source." };
    }
  }));
}
