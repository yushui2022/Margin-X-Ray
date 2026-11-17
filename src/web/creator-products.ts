import RESEARCH from "../../research/creator-products.json";
import { brandScenario, commissionScenario, scenarioNumber } from "../shared/creator-economics";

type Product = (typeof RESEARCH.products)[number];

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
  return RESEARCH.products.filter((product) => product.handle === handle).length;
}

function sources(ids: string[]): HTMLElement {
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

function money(amount: number, currency: string): string {
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

function productCard(product: Product): HTMLElement {
  const card = node("article", "card creator-product");
  card.dataset.productId = product.id;
  card.append(node("p", "eyebrow", product.relationship), node("h3", "", product.name), node("p", "", product.variant));
  const facts = node("div", "creator-product-facts");
  const price = node("div");
  price.append(node("span", "", "Observed reference price"), node("strong", "", money(product.price.amount, product.price.currency)), node("small", "", `${product.price.market} · ${RESEARCH.observedAt}`));
  const earnings = node("div");
  earnings.append(node("span", "", product.kind === "third-party" ? "Creator commission / fee" : "Brand gross / contribution margin"), node("strong", "", "Unknown"), node("small", "", product.kind === "third-party" ? "Rate, contract and settlement unavailable" : "Net revenue and costs unavailable"));
  facts.append(price, earnings);
  card.append(facts, node("p", "", product.price.conditions), node("p", "creator-product-status", product.shopStatus));
  const evidence = node("details", "creator-product-evidence");
  evidence.append(node("summary", "", "Relationship & financial gaps"), node("p", "", `Evidence confidence: ${product.confidence}.`));
  if (product.postUrl) evidence.append(link("Open source TikTok post", product.postUrl), node("p", "", `Promotion date: ${product.promotionDate ?? "not established"}. Original video content was not directly retrieved.`));
  evidence.append(node("p", "", product.kind === "third-party"
    ? "Actual commission rate, sponsorship fee, sales, refunds and creator expenses are unknown. Merchant costs and product margins are also unknown. A paid post does not establish sales-based commission."
    : "Actual net revenue, manufacturing / landed costs, variable costs, sales volumes and creator distributions are unknown. A founder or collaboration relationship does not establish ownership percentage or personal earnings."));
  card.append(evidence, sources(product.sources));
  if (product.kind === "third-party") card.append(calculator(product, true));
  card.append(calculator(product, false));
  return card;
}

export function renderCreatorProducts(handle: string): HTMLElement {
  const wrapper = node("div", "creator-products");
  const creator = RESEARCH.creators.find((item) => item.handle === handle);
  if (!creator) return wrapper;
  const products = RESEARCH.products.filter((item) => item.handle === handle);
  const overview = node("section", "card creator-product-overview");
  overview.append(node("p", "eyebrow", `Public evidence · Collected ${RESEARCH.observedAt}`), node("h2", "", "Products & earnings"), node("p", "", `${products.length} product records · ${creator.leads.length} unresolved leads · 0 verified earnings records`), node("p", "", RESEARCH.scope), node("p", "creator-notice", "Actual creator income and product margins remain unknown. The calculators below use only assumptions you enter; they do not estimate a creator's real earnings."));
  wrapper.append(overview);
  const groups = [
    { title: "Third-party promotions & mentions", kind: "third-party", note: creator.thirdPartyNote },
    { title: "Founder-brand products", kind: "founder-brand", note: creator.brandNote },
    { title: "Collaborations & equity relationships", kind: "collaboration", note: creator.brandNote },
  ];
  for (const group of groups) {
    const items = products.filter((item) => item.kind === group.kind);
    if (group.kind === "collaboration" && !items.length) continue;
    const section = node("section", "creator-product-group");
    section.append(node("h2", "", `${group.title} · ${items.length}`));
    if (group.kind === "founder-brand" && products.some((item) => item.kind === "collaboration")) {
      section.append(node("p", "", "No founder-brand product established in this collection. See the collaboration evidence below."));
    } else {
      section.append(node("p", "", group.note));
      if (group.kind !== "third-party") section.append(sources(creator.brandSources));
    }
    const grid = node("div", "creator-product-grid");
    for (const product of items) grid.append(productCard(product));
    section.append(grid);
    if (group.kind === "third-party") {
      for (const lead of creator.leads) {
        const card = node("article", "card creator-product-lead");
        card.append(node("h3", "", lead.title), node("p", "", lead.note), sources(lead.sources));
        section.append(card);
      }
    }
    wrapper.append(section);
  }
  return wrapper;
}
