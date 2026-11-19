import { productHref } from "../shared/shopping-links";
import { retailComparisons } from "../shared/retail-premium";
import RESEARCH from "../../research/creator-products.json";
import { brandScenario, commissionScenario, scenarioNumber } from "../shared/creator-economics";
import { renderScreening } from "./creator-screening";
import { screeningFor, brandLeadsFor } from "../shared/creator-screening";
import { productScreening } from "./product-issue-screening";

export type Product = (typeof RESEARCH.products)[number];
export const PRODUCT_ARCHIVE = RESEARCH.products;
export const PRODUCT_OBSERVATION = RESEARCH.observedAt;
export const PRODUCT_SOURCE_COUNT = RESEARCH.sources.length;

const retailRecords = retailComparisons();
const archiveIds = new Set(PRODUCT_ARCHIVE.map(product => product.id));
const supplements = retailRecords.filter(record => !archiveIds.has(record.productId));
const relationLabels = { "founder-store": "Founder-associated brand store", "creator-offer": "Documented creator offer", "retail-reference": "Retail reference" };
export const CREATOR_SHOP_PRODUCTS = [
  ...PRODUCT_ARCHIVE.map(product => ({
    id: product.id, handle: product.handle, name: product.name, variant: product.variant, relationship: product.relationship,
    promotionDate: product.promotionDate, observedAt: PRODUCT_OBSERVATION, price: product.price,
  })),
  ...supplements.map(record => ({
    id: record.productId, handle: record.handle, name: record.name, variant: record.variant, relationship: relationLabels[record.relation],
    promotionDate: null, observedAt: record.reference.observedAt, price: { amount: record.reference.amount, currency: record.currency },
  })),
];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function link(label: string, url: string): HTMLAnchorElement {
  const element = node("a", "", `${label} ↗`);
  element.href = url;
  element.target = "_blank";
  element.rel = "noopener noreferrer";
  return element;
}

export function productCount(handle: string): number {
  return CREATOR_SHOP_PRODUCTS.filter(product => product.handle === handle).length;
}

function sources(ids: string[]): HTMLDetailsElement {
  const details = node("details", "creator-product-sources");
  details.append(node("summary", "", `Sources & access notes (${ids.length})`));
  const list = node("ul");
  for (const id of ids) {
    const source = RESEARCH.sources.find((item) => item.id === id);
    if (!source) continue;
    const item = node("li");
    item.append(link(source.label, source.url), node("p", "", `${source.access} · Observed ${RESEARCH.observedAt}${source.publishedAt ? ` · Published ${source.publishedAt}` : " · Publication date unknown"}`), node("p", "", `Recorded extract: ${source.excerpt}`));
    list.append(item);
  }
  details.append(list);
  return details;
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" }).format(amount);
}

function calculator(product: Product, commission: boolean): HTMLElement {
  const details = node("details", "creator-calculator");
  details.dataset.model = commission ? "commission" : "margin";
  const entity = product.kind === "third-party" ? "Merchant" : "Brand";
  details.append(node("summary", "", commission ? "Hypothetical affiliate commission" : `Hypothetical ${entity.toLowerCase()} margin`));
  details.append(node("p", "", commission
    ? "What if this product earned an affiliate commission? Enter your own assumptions. No affiliate arrangement or rate has been verified. Commission is before refunds, agency shares, creator costs and tax; sponsorship fees are separate."
    : `${entity} economics per unit, using your own assumptions. Enter revenue excluding VAT / sales tax and after discounts and refunds. Use costs on the same tax basis. This does not calculate the creator's personal earnings or net profit.`));
  const form = node("form", "creator-scenario-form");
  form.addEventListener("submit", (event) => event.preventDefault());
  const fields = node("div", "creator-scenario-fields");
  const labels = commission
    ? [`Commissionable amount per order (${product.price.currency})`, "Assumed commission rate (%)"]
    : [`Net revenue per unit (${product.price.currency})`, `Cost of goods per unit (${product.price.currency})`, `Other variable costs per unit (${product.price.currency})`];
  const inputs = labels.map((text, index) => {
    const label = node("label", "", text);
    const input = node("input");
    input.type = "number";
    input.min = "0";
    input.step = "any";
    if (commission && index === 1) input.max = "100";
    input.placeholder = "Enter an assumption";
    input.required = true;
    input.inputMode = "decimal";
    label.append(input);
    fields.append(label);
    return input;
  });
  const output = node("output", "creator-scenario-output");
  output.setAttribute("aria-live", "polite");
  const update = () => {
    const values = inputs.map((input) => {
      const value = input.validity.valid ? scenarioNumber(input.value) : null;
      input.setAttribute("aria-invalid", String(input.validity.badInput || (input.value !== "" && value === null)));
      return value;
    });
    const incomplete = "Enter every assumption to calculate. Use non-negative numbers; commission must be 0–100%. Blank means unknown. Enter 0 explicitly only when you assume no cost or commission.";
    if (commission) {
      const result = commissionScenario(values[0]!, values[1]!);
      output.textContent = result === null ? incomplete : `Hypothetical gross commission per order: ${money(result, product.price.currency)}. Not observed creator income.`;
    } else {
      const result = brandScenario(values[0]!, values[1]!, values[2]!);
      const pct = (value: number | null) => value === null ? "undefined at zero revenue" : `${value.toFixed(1)}%`;
      output.textContent = result === null ? incomplete : `Hypothetical ${entity.toLowerCase()} gross profit: ${money(result.gross, product.price.currency)} (${pct(result.grossMarginPct)}). Contribution: ${money(result.contribution, product.price.currency)} (${pct(result.contributionMarginPct)}). Per unit, before fixed overhead, financing and income tax. Not personal profit.`;
    }
  };
  for (const input of inputs) input.addEventListener("input", update);
  const reset = node("button", "btn secondary", "Clear assumptions");
  reset.type = "button";
  reset.addEventListener("click", () => { for (const input of inputs) input.value = ""; update(); });
  form.append(fields, output, reset);
  details.append(form, node("p", "", commission
    ? "Formula: commissionable amount × commission rate / 100. The commissionable amount depends on the actual affiliate contract; a retail price alone does not establish it."
    : "Gross profit = net revenue − cost of goods. Contribution = gross profit − other variable costs. Margin = profit / net revenue. Include fulfillment, platform/payment fees, commissions, advertising and return handling in variable costs; avoid double counting refunds already deducted from revenue."), node("p", "", "Assumptions stay in this view and clear when you leave or reload. They never change the collected facts or the Onion Score."));
  update();
  return details;
}

function productCard(product: Product, standalone = false): HTMLElement {
  const card = node("article", "card creator-product");
  card.dataset.productId = product.id;
  const heading = node("header", "record-heading");
  heading.append(node("p", "eyebrow", product.relationship), node(standalone ? "h1" : "h3", "", product.name), node("p", "record-variant", product.variant));
  card.append(heading);
  const facts = node("div", "creator-product-facts");
  const price = node("div");
  price.append(node("span", "", "Observed reference price"), node("strong", "", money(product.price.amount, product.price.currency)), node("small", "", `${product.price.market} · ${RESEARCH.observedAt}`));
  const earnings = node("div");
  earnings.append(node("span", "", product.kind === "third-party" ? "Creator commission / fee" : "Brand gross / contribution margin"), node("strong", "", "Unknown"), node("small", "", product.kind === "third-party" ? "Rate, contract and settlement unavailable" : "Net revenue and costs unavailable"));
  facts.append(price, earnings);
  const reading = standalone ? node("section", "record-reading") : card;
  (standalone ? card : reading).append(facts);
  const references = sources(product.sources);
  if (standalone) {
    card.append(reading);
    const screening = productScreening(product);
    if (screening) reading.append(screening);
    const sourcePanel = node("aside", "record-references");
    sourcePanel.append(node("h2", "", "Source documents"), references);
    references.open = true;
    card.append(sourcePanel);
    reading.append(node("h2", "", "Purchase conditions"));
  } else {
    reading.append(references);
    const file = node("a", "", "Open product record & issue checks →");
    file.href = `#creator/${encodeURIComponent(`@${product.handle}`)}/products/${product.id}`;
    reading.append(file);
  }
  reading.append(node("p", "", product.price.conditions), node("p", "creator-product-status", product.shopStatus));
  if (standalone) {
    const compare = node("a", "btn primary", "Compare retail prices →");
    compare.href = productHref(product.id);
    reading.append(compare);
  }
  const evidence = node("details", "creator-product-evidence");
  evidence.append(node("summary", "", "Relationship & financial gaps"), node("p", "", `Evidence confidence: ${product.confidence}.`));
  if (product.postUrl) evidence.append(link("Open source TikTok post", product.postUrl), node("p", "", `Promotion date: ${product.promotionDate ?? "not established"}. Original video content was not directly retrieved.`));
  evidence.append(node("p", "", product.kind === "third-party"
    ? "Actual commission rate, sponsorship fee, sales, refunds and creator expenses are unknown. Merchant costs and product margins are also unknown. A paid post does not establish sales-based commission."
    : "Actual net revenue, manufacturing / landed costs, variable costs, sales volumes and creator distributions are unknown. A founder or collaboration relationship does not establish ownership percentage or personal earnings."));
  reading.append(evidence);
  if (product.kind === "third-party") reading.append(calculator(product, true));
  reading.append(calculator(product, false));
  return card;
}

export function renderProductFile(product: Product, creatorName: string, creatorReport: string): HTMLElement {
  const wrapper = node("section", "creator-products product-file");
  const nav = node("nav", "record-nav");
  nav.setAttribute("aria-label", "Price record navigation");
  const archive = node("a", "", "← Price archive");
  archive.href = "#prices";
  const report = node("a", "", `${creatorName} · Creator report →`);
  report.href = creatorReport;
  nav.append(archive, report);
  wrapper.append(nav, productCard(product, true));
  return wrapper;
}

export function renderCreatorProducts(handle: string): HTMLElement {
  const wrapper = node("div", "creator-products");
  const additional = supplements.filter(record => record.handle === handle);
  if (additional.length) {
    const section = node("section", "card creator-product-overview");
    section.append(node("h3", "", "Additional retail comparisons"));
    for (const record of additional) {
      const item = node("a", "", record.name + " →");
      item.href = productHref(record.productId);
      section.append(item, node("p", "", [relationLabels[record.relation], record.market, "Observed " + record.reference.observedAt].join(" · ")));
    }
    wrapper.append(section);
  }
  const creator = RESEARCH.creators.find((item) => item.handle === handle);
  if (!creator) {
    const empty = node("section", "card creator-product-overview");
    const sample = screeningFor(handle);
    const leads = brandLeadsFor(handle);
    if (additional.length) {
      empty.append(node("h3", "", "Historical price archive"), node("p", "", "No price file for this creator was included in the " + PRODUCT_OBSERVATION + " archive."));
      wrapper.append(empty, renderScreening(handle));
      return wrapper;
    }
    empty.append(node("p", "eyebrow", sample ? "Initial research · Offer verification pending" : "Research not started"), node("h2", "", "Products & earnings"), node("p", "", sample
      ? `No priced product record has been accepted for this creator. ${leads.length ? `See the ${leads.length} follow-up ${leads.length === 1 ? "lead" : "leads"} below.` : "No product or brand lead has been selected for this report yet."} Exact products, current seller offers and financial terms need verification.`
      : "Product research has not started for this account."), node("p", "", "0 priced product records · Earnings unknown. A limited sample does not establish that the creator has no products, brand or commercial relationships."));
    wrapper.append(empty, renderScreening(handle));
    return wrapper;
  }
  const products = RESEARCH.products.filter((item) => item.handle === handle);
  const overview = node("section", "card creator-product-overview");
  overview.append(node("p", "eyebrow", `@${handle} · ${RESEARCH.observedAt}`), node("h2", "", "Historical price files"), node("p", "", `${products.length} archived ${products.length === 1 ? "product" : "products"} · Observed reference prices · Earnings unknown`));
  wrapper.append(overview);
  const grid = node("div", "creator-product-grid");
  for (const product of products) grid.append(productCard(product));
  wrapper.append(grid);
  const scope = node("details", "creator-product-scope");
  scope.append(node("summary", "", "Collection scope & brand relationships"), node("p", "", RESEARCH.scope), node("p", "", creator.thirdPartyNote), node("p", "", creator.brandNote));
  if (creator.brandSources.length) scope.append(sources(creator.brandSources));
  wrapper.append(scope);
  if (creator.leads.length) {
    const section = node("section", "creator-product-group creator-unresolved-leads");
    section.append(node("h2", "", `Unresolved product leads · ${creator.leads.length}`), node("p", "", "These leads need further verification and are excluded from product counts and calculators."));
    for (const lead of creator.leads) {
      const card = node("article", "card creator-product-lead");
      card.append(node("h3", "", lead.title), node("p", "", lead.note), sources(lead.sources));
      section.append(card);
    }
    wrapper.append(section);
  }
  wrapper.append(renderScreening(handle));
  return wrapper;
}
