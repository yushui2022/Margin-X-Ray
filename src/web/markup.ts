import { archivedAssessment, listingUrl, markupHref, markupRecord, observationsFor, quoteDate, supplierForBarcode } from "../shared/markup-records";
import { assessPrice } from "../shared/price-comparison";
import { supplierRange } from "./supplier-range";
import { compareUnitPrices, HIGH_PRICE_MULTIPLE } from "../shared/product-markup";
import type { ScanResult, SupplyReport } from "../shared/types";
import { storefrontOffers } from "../shared/storefront-offer";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
}

function link(label: string, href: string) {
  const a = el("a", label);
  a.href = href;
  if (!href.startsWith("#")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
  return a;
}

function label(text: string, control: HTMLElement) {
  const field = el("label", text);
  field.append(control);
  return field;
}

function num(initial: number | null, units = false) {
  const input = el("input");
  input.type = "number";
  input.min = units ? "1" : "0";
  input.step = units ? "1" : "any";
  input.inputMode = units ? "numeric" : "decimal";
  if (initial !== null) input.value = String(initial);
  return input;
}

function examples() {
  const nav = el("nav");
  nav.setAttribute("aria-label", "Product checks");
  nav.append(link("New check", "#markup"), link("Winco measuring spoons", "#markup/winco-msp-4p"),
    link("Feastables chocolate", "#markup/feastables-king"), link("Biodance serum mist", "#markup/nikkie-biodance-mist"));
  return nav;
}

function shareRecord(name: string) {
  const button = el("button", "Share price check"); button.type = "button";
  const status = el("span"); status.setAttribute("role", "status");
  const wrap = el("div"); wrap.className = "record-share";
  button.addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} · Onion Head`, url });
      else { await navigator.clipboard.writeText(url); status.textContent = "Link copied"; }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const address = el("input"); address.value = url; address.readOnly = true;
      address.setAttribute("aria-label", "Select and copy report link");
      status.replaceChildren(address); address.focus(); address.select();
    }
  });
  wrap.append(button, status); return wrap;
}

function productLookup() {
  const form = el("form");
  form.className = "markup-lookup";
  const input = el("input");
  input.type = "url";
  input.required = true;
  input.placeholder = "Paste a retail product link";
  input.setAttribute("aria-label", "Retail listing URL");
  const submit = el("button", "Check link");
  submit.className = "btn primary";
  input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (listingUrl(input.value)) location.hash = markupHref(input.value);
    else { input.setCustomValidity("Enter an http or https product URL."); input.reportValidity(); }
  });
  form.append(input, submit);
  return form;
}

function quoteTiers(supply: SupplyReport, apply: (price: string, url?: string) => void) {
  const group = el("div");
  const fx = supply.fxRate;
  if (!fx || !Number.isFinite(fx) || fx <= 0) {
    group.append(el("p", "The scan has CNY offers. A CNY to USD rate is needed to use them here."));
    return group;
  }
  const select = el("select");
  select.add(new Option("Choose a listing", ""));
  const source = el("div");
  const tiers = supply.offers.flatMap(offer => offer.tiers.flatMap(tier => {
    const usd = tier.unitCny / fx;
    const url = listingUrl(offer.detailUrl || "") ?? (/^\d+$/.test(offer.id) ? `https://detail.1688.com/offer/${offer.id}.html` : undefined);
    if (!url || !Number.isFinite(usd) || usd <= 0 || !Number.isSafeInteger(tier.moq) || tier.moq < 1) return [];
    return [{ usd, url, text: `${offer.title} · ${tier.unitCny} CNY each at ${tier.moq}+` }];
  }));
  if (!tiers.length) return group;
  tiers.forEach((tier, index) => select.add(new Option(tier.text, String(index))));
  select.addEventListener("change", () => {
    const tier = tiers[select.selectedIndex - 1];
    source.replaceChildren();
    if (tier) source.append(link("Open supplier listing ↗", tier.url));
    apply(tier ? String(tier.usd) : "", tier?.url);
  });
  group.append(label("1688 offer and order quantity", select), el("small", `This scan uses ${fx} CNY per USD.`), source);
  return group;
}

export function renderMarkup(route: string, scan?: ScanResult) {
  const split = route.indexOf("?");
  const id = split < 0 ? route : route.slice(0, split);
  const params = new URLSearchParams(split < 0 ? "" : route.slice(split + 1));
  const record = markupRecord(id);
  const listing = record?.listing;
  const quote = record?.quote;
  const live = id === "scan" && scan?.dataSource === "api" ? scan : undefined;
  const enteredUrl = id === "item" && listingUrl(params.get("url") ?? "");
  const main = el("section"); main.className = "markup-page";
  if (id) {
    const toolbar = el("div"); toolbar.className = "price-toolbar";
    toolbar.append(listing?.handle ? link("← Product record", `#creator/${encodeURIComponent(`@${listing.handle}`)}/products/${id}`) : link("← Price check", "#markup"));
    if (listing) toolbar.append(shareRecord(listing.name));
    main.append(toolbar);
  }
  if (id && !record && !live && !enteredUrl) {
    main.append(el("h1", id === "scan" ? "Scan result unavailable" : "Listing unavailable"),
      el("p", id === "scan" ? "Run a live product scan to use its supplier offers, or start a new check below." : "Open a product link or choose a check below."), productLookup(), examples());
    return main;
  }

  const heading = el("header");
  heading.className = "markup-heading";
  heading.append(el("h1", listing?.name ?? live?.product.title ?? (enteredUrl ? "Check this listing" : "Compare supplier prices")));
  const intro = el("p");
  if (enteredUrl) intro.append(link(`Open listing on ${new URL(enteredUrl).hostname} ↗`, enteredUrl));
  else if (live) {
    const url = listingUrl(live.product.sourceUrl);
    if (url) intro.append(link("Open scanned listing ↗", url), " · ");
    intro.append(`Scanned ${live.generatedAt.slice(0, 10)}`);
  } else intro.textContent = listing ? `Supplier price check · ${listing.market}` : "Compare a retail listing with supplier quotes, one item at a time.";
  heading.append(intro);
  main.append(heading);
  let samples: HTMLElement | undefined;
  if (!id) {
    main.classList.add("markup-start");
    heading.append(productLookup());
    samples = el("section"); samples.className = "example-checks";
    samples.append(el("h2", "Saved price checks"));
    for (const [key, detail] of [["winco-msp-4p", "Multiple suppliers"], ["feastables-king", "Different pack sizes"], ["nikkie-biodance-mist", "Missing wholesale price"]]) {
      const example = markupRecord(key)!;
      const item = link("", `#markup/${key}`);
      const title = el("strong", example.listing.name);
      const amount = new Intl.NumberFormat("en-US", {style:"currency", currency:example.listing.currency}).format(example.listing.amount);
      const price = el("span", amount);
      price.className = "example-price";
      price.prepend(el("small", "Retail"));
      const arrow = el("span", "→");
      arrow.className = "example-open";
      arrow.setAttribute("aria-hidden", "true");
      item.append(title, el("small", detail), price, arrow);
      samples.append(item);
    }
  }
  if (record) main.append(supplierRange(archivedAssessment(record), record.listing.currency, quote?.unit ?? "item", record.listing.observedAt, record.listing.url));

  const grid = el("div"); grid.className = "markup-grid";
  const form = el("form"); form.className = "card markup-form";
  form.addEventListener("submit", event => event.preventDefault());
  const retail = num(listing?.amount ?? live?.product.retailUsd ?? null);
  const retailUnits = num(quote?.retailUnits ?? (id ? null : 1), true);
  const wholesale = num(quote?.quoteAmount ?? null);
  const quoteUnits = num(quote?.quoteUnits ?? 1, true);
  const currency = el("select");
  for (const code of ["USD", "EUR", "GBP", "CNY", "CAD", "AUD", "JPY"]) currency.add(new Option(code, code));
  currency.value = listing?.currency ?? "USD";
  currency.disabled = !!listing || !!live;
  const match = el("select");
  match.add(new Option("Select match", "unknown"));
  match.add(new Option("Same variant and unit", "same"));
  match.add(new Option("Similar appearance only", "similar"));
  match.value = quote?.match === "same" ? "same" : "unknown";
  const fields = el("div"); fields.className = "markup-fields";
  fields.append(label("Retail pack price", retail), label("Items in retail pack", retailUnits), label("Supplier pack price", wholesale), label("Items in supplier pack", quoteUnits), label("Currency for both prices", currency), label("Product match", match));
  form.append(el("h2", "Pack prices"), el("p", "Use whole-pack prices for the same size, market and tax basis."), fields);
  const sourceInput = el("input");
  sourceInput.type = "url";
  sourceInput.placeholder = "https://…";
  let retailUrl = listing?.url || enteredUrl || listingUrl(live?.product.sourceUrl ?? "");
  let supplierUrl = quote?.quoteUrl;
  let barcodeQuote: ReturnType<typeof supplierForBarcode>;
  let fetchedRetail: number | undefined;
  let quotedAmount = quote?.quoteAmount;
  const confirmMarket = el("input"); confirmMarket.type = "checkbox";
  const linkedRange = el("div");
  if (!quote) {
    const sources = el("details");
    sources.append(el("summary", "Add a supplier source"), label("Supplier listing URL", sourceInput));
    form.append(sources);
  }
  if (enteredUrl) {
    const availability = el("p", "Reading public storefront offers…");
    availability.setAttribute("role", "status");
    const source = el("div");
    main.append(availability, source, linkedRange);
    // A delayed storefront response must not overwrite the reader's edits.
    let edited = false;
    form.addEventListener("input", () => { edited = true; });
    void storefrontOffers(enteredUrl).catch(() => []).then(offers => {
      if (!main.isConnected || edited) { availability.remove(); return; }
      if (!offers.length) {
        availability.textContent = "No public price retrieved. Enter the two pack prices below.";
        return;
      }
      const select = el("select");
      select.add(new Option("Choose the retail variant", ""));
      offers.forEach((offer, index) => select.add(new Option(`${offer.title} · ${offer.currency} ${offer.price}`, String(index))));
      const receipt = el("div");
      const showOffer = () => {
        const offer = offers[select.selectedIndex - 1];
        wholesale.value = "";
        retail.value = "";
        retailUnits.value = "";
        quoteUnits.value = "";
        match.value = "unknown";
        currency.disabled = false;
        supplierUrl = undefined;
        quotedAmount = undefined;
        barcodeQuote = undefined;
        fetchedRetail = undefined;
        confirmMarket.checked = false;
        sourceInput.value = "";
        retailUrl = enteredUrl;
        receipt.replaceChildren();
        if (offer) {
          retail.value = String(offer.price);
          if (![...currency.options].some(option => option.value === offer.currency)) currency.add(new Option(offer.currency, offer.currency));
          currency.value = offer.currency;
          currency.disabled = true;
          const variantUrl = new URL(enteredUrl);
          variantUrl.searchParams.set("variant", offer.id);
          retailUrl = variantUrl.href;
          receipt.append(link(`${offer.title} ↗`, variantUrl.href));
          const supplier = supplierForBarcode(offer.barcode ?? "", offer.currency);
          if (supplier) {
            barcodeQuote = supplier;
            fetchedRetail = offer.price;
            supplierUrl = supplier.quoteUrl;
            quotedAmount = supplier.quoteAmount;
            wholesale.value = supplier.quoteAmount == null ? "" : String(supplier.quoteAmount);
            quoteUnits.value = String(supplier.quoteUnits);
            receipt.append(el("p", `Barcode ${offer.barcode} matches a supplier record from ${quoteDate}. Confirm how many ${supplier.unit}s the retail offer contains.`), link(supplier.quoteLabel, supplier.quoteUrl));
            receipt.append(label(`Both listings use ${supplier.quoteMarket} merchandise prices before tax and delivery`, confirmMarket));
          } else receipt.append(el("p", "Enter the item count and a supplier quote for this variant."));
        }
        update();
      };
      availability.textContent = `Retail offer retrieved ${new Date().toISOString().slice(0, 10)}.`;
      if (offers.length === 1) select.selectedIndex = 1;
      else { source.append(label("Retail variant", select)); select.addEventListener("change", showOffer); }
      source.className = "markup-offer";
      source.append(receipt);
      showOffer();
    });
  }
  if (live?.supply?.offers.length) form.append(quoteTiers(live.supply, (price, url) => {
    supplierUrl = url;
    quotedAmount = price ? Number(price) : undefined;
    sourceInput.value = "";
    wholesale.value = price;
    quoteUnits.value = "1";
    match.value = "unknown";
    update();
  }));

  const result = el("section"); result.className = "card markup-result"; result.setAttribute("role", "status");
  const output = el("div"); output.className = "markup-output";
  output.append(result, el("small", `Provisional high-gap threshold ≥ ${HIGH_PRICE_MULTIPLE}×`));
  grid.append(form, output);
  const note = el("p", "Profit depends on actual purchase cost, shipping, tax, fees and returns.");
  note.className = "fine-print";
  if (!id || (record && quote?.match === "same")) {
    const calculator = el("details"); calculator.className = "pack-calculator";
    calculator.append(el("summary", id ? "Edit pack prices and quantities" : "Enter pack prices manually"), grid, note);
    main.append(calculator);
  } else main.append(grid, note);
  if (samples) main.append(samples);
  if (listing) {
    const evidence = el("section"); evidence.className = "card markup-evidence";
    evidence.append(el("h2", "Listing evidence"), link(listing.label, listing.url), el("p", `${listing.observedAt} · ${listing.conditions}`));
    if (quote) evidence.append(link(quote.quoteLabel, quote.quoteUrl), el("p", `${quoteDate} · ${quote.matchNote}`), link("Brand specification ↗", quote.matchUrl));
    else evidence.append(el("p", "A comparable supplier quote is still needed for this record."));
    main.append(evidence);
  }
  if (id) main.append(examples());

  function update() {
    linkedRange.replaceChildren();
    if (barcodeQuote && confirmMarket.checked && fetchedRetail === retail.valueAsNumber && retailUrl && retailUnits.validity.valid && retailUnits.valueAsNumber > 0 && match.value === "same") {
      const date = new Date().toISOString().slice(0, 10);
      const analysis = assessPrice({ amount: fetchedRetail, units: retailUnits.valueAsNumber, currency: currency.value, market: barcodeQuote.quoteMarket, observedAt: date, url: retailUrl }, observationsFor(barcodeQuote));
      linkedRange.append(supplierRange(analysis, currency.value, barcodeQuote.unit, date, retailUrl));
    }
    const comparison = compareUnitPrices(retail.valueAsNumber, retailUnits.valueAsNumber, wholesale.valueAsNumber, quoteUnits.valueAsNumber);
    const observed = listing && quote?.match === "same" && retail.valueAsNumber === listing.amount && retailUnits.valueAsNumber === quote.retailUnits && wholesale.valueAsNumber === quote.quoteAmount && quoteUnits.valueAsNumber === quote.quoteUnits && match.value === "same";
    const status = el("p", observed ? "One observed quote" : "Your price scenario"); status.className = "eyebrow";
    result.replaceChildren(status);
    result.dataset.high = "false";
    if (!comparison || match.value !== "same") {
      result.append(el("h2", "Comparison pending"));
      if (quote?.quoteAmount === null && !wholesale.value) result.append(el("p", "The supplier shows the case quantity and requires login for its wholesale price."));
      else if (!comparison) result.append(el("p", "Enter two positive pack prices and whole item counts."));
      if (match.value !== "same") result.append(el("p", "Confirm that the model, contents and purchase terms match."));
      return;
    }
    const money = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.value, maximumFractionDigits: 4 });
    result.dataset.high = String(comparison.high);
    const unit = quote?.unit ?? "item";
    const rounded = comparison.multiple.toLocaleString("en-US", { maximumFractionDigits: 3 });
    const display = !comparison.high && rounded === String(HIGH_PRICE_MULTIPLE) ? `< ${rounded}` : rounded;
    const equation = el("p");
    const sale = `Retail ${money.format(comparison.salePerUnit)}`;
    const cost = `supplier ${money.format(comparison.quotePerUnit)}`;
    // An edited price is a scenario. Link only the inputs that match their source.
    const url = sourceInput.value ? listingUrl(sourceInput.value) : wholesale.valueAsNumber === quotedAmount ? supplierUrl : undefined;
    const saleSource = retail.valueAsNumber === (listing?.amount ?? fetchedRetail ?? live?.product.retailUsd) ? retailUrl : undefined;
    equation.append(saleSource ? link(sale, saleSource) : sale, " ÷ ", url ? link(cost, url) : cost, ` per ${unit}.`);
    result.append(el("h2", comparison.high ? "At or above 3× for this quote" : "Below 3× for this quote"), el("strong", `${display}×`), equation,
      el("p", `${money.format(comparison.spread)} difference per ${unit}.`));
  }
  form.addEventListener("input", update);
  confirmMarket.addEventListener("change", update);
  // Keep the result in a stable position while editing on phones.
  grid.classList.toggle("markup-observation", quote?.match === "same" && quote.quoteAmount != null);
  update();
  return main;
}
