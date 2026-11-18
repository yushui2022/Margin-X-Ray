import ledger from "../../research/issue-screening-records.json";
import sample from "../../research/issue-screening-sample.json";
import archive from "../../research/creator-products.json";
import assessments from "../../research/creator-confidence-assessments.json";
import { sources as exportsChecked, matches as recordMatches } from "../../research/issue-screening-receipt.json";
import { issueFor } from "../shared/creator-issues";

const selected = new Set(sample.productIds);
const entries = new Map(ledger.products.map(row => [row.id, row]));
const sourceGroups: Record<string, string[]> = ledger.checks;
const nextChecks: Record<string, string> = ledger.nextByMarket;
const sources: Record<string, { label: string; url: string; result: string }> = ledger.sources;
const coverage: Record<string, { inWindow: number }> = exportsChecked;
const matches: Record<string, Record<string, unknown[]>> = recordMatches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}

function external(label: string, url: string) {
  const link = el("a", label + " ↗");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

export function screeningSampleLinks(handle: string) {
  const products = archive.products.filter(p => p.handle === handle && selected.has(p.id));
  if (!products.length) return null;
  const block = el("details");
  block.className = "creator-method issue-sample";
  block.append(el("summary", `Screening sample · ${products.length} price ${products.length === 1 ? "record" : "records"}`),
    el("p", `Selected from the ${archive.observedAt} price archive before checking official notices. Open a record to see its market, search results and remaining checks.`));
  const list = el("ul");
  for (const product of products) {
    const item = el("li");
    const link = el("a", product.name);
    link.href = `#creator/${encodeURIComponent(`@${handle}`)}/products/${product.id}`;
    item.append(link);
    list.append(item);
  }
  block.append(list);
  return block;
}

export function productScreening(product: (typeof archive.products)[number]) {
  const row = entries.get(product.id);
  if (!row || !selected.has(product.id)) return null;
  const section = el("section");
  section.className = "product-issue-check";
  section.append(el("h2", "Product issue screening"));
  const accepted = issueFor(product.handle);
  const reviewed = accepted?.points && accepted.review?.products.find(item => item.id === product.id);
  const status = reviewed ? (reviewed.outcome === "documented-issue" ? "Confirmed finding" : "Reviewed") : "Pending review";
  section.append(el("strong", status), el("p", row.note));
  for (const issue of reviewed?.issues ?? []) {
    const paragraph = el("p");
    if (issue.severity === "critical" && issue.kind === "recall") paragraph.append(el("strong", "High-risk recall · "));
    paragraph.append(`${issue.assessment} `, external(issue.source.label, issue.source.url));
    section.append(paragraph);
  }
  const details = el("details");
  details.append(el("summary", "Source checks & matching notes"), el("p", `${product.price.market} · ${sample.windowStart} to ${sample.windowEnd} · Checked ${ledger.checkedAt}`));
  const provenance = assessments.products.find(entry => entry.productId === product.id);
  if (provenance) {
    const links = el("p");
    for (const [label, id] of [["Creator relationship", provenance.relationshipSource], ["Reference listing", provenance.listingSource]]) {
      const source = archive.sources.find(s => s.id === id)!;
      if (links.childNodes.length) links.append(" · ");
      links.append(external(label, source.url));
    }
    details.append(links);
  }
  details.append(el("p", `Search terms included ${[...row.aliases, ...row.terms].join(", ")}.`));
  const list = el("ul");
  for (const id of [...sourceGroups[row.group], ...(row.extra ?? [])]) {
    const source = sources[id];
    const item = el("li");
    item.append(external(source.label, source.url), el("p", source.result));
    const hits = matches[row.id]?.[id];
    if (hits && coverage[id].inWindow > 0) {
      item.append(el("small", `${coverage[id].inWindow.toLocaleString("en-US")} entries searched · ${hits.length} matching entries`));
    }
    list.append(item);
  }
  details.append(list);
  if (!reviewed) details.append(el("p", nextChecks[row.group]));
  section.append(details);
  return section;
}
