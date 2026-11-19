import { storefrontOffers } from "../shared/storefront-offer";
import { listingKey, productForListing, productHref, publicUrl } from "../shared/shopping-links";
import { el, link, money } from "./shop-dom";
import { retailerFinder } from "./retailer-finder";
import { retailComparison } from "../shared/retail-premium";

function field(labelText: string, input: HTMLElement) {
  const label = el("label", labelText);
  label.append(input);
  return label;
}

function amountInput() {
  const input = el("input");
  input.type = "number"; input.min = "0.01"; input.step = "0.01";
  input.required = true; input.inputMode = "decimal"; input.placeholder = "0.00";
  return input;
}

/** Shopper-entered totals remain in this view and never contribute to a public index. */
export function listingCheck(raw: string, signal: AbortSignal, alternative: string | null) {
  const main = el("div", "", "shop-page shop-narrow");
  const first = publicUrl(raw);
  main.append(link("← Shopping check", "#shop", "shop-back"), el("h1", "Compare two listings"));
  if (!first) {
    main.append(el("p", "A public product URL is needed to start a comparison."), link("Enter a product link →", "#shop"));
    return main;
  }
  main.append(link("Your listing on " + first.hostname + " ↗", first.href), el("p",
    "Check two retailers’ totals for the same item, quantity and delivery address.", "shop-lede"));
  const known = productForListing(first.href);
  if (known) main.append(link("View the archived product record →", productHref(known), "shop-action-link"));
  const observed = el("p", "", "shop-small");
  const offerSelect = el("select");
  const offerField = field("Public storefront variant", offerSelect); offerField.hidden = true;
  let selectedBarcode: string | undefined;
  let selectedCurrency: string | undefined;
  function updatePublicOffer() {
    selectedBarcode = offerSelect.selectedOptions[0]?.dataset.barcode;
    selectedCurrency = offerSelect.selectedOptions[0]?.dataset.currency;
    finder.setCode(selectedBarcode ?? "", selectedCurrency);
    if (selectedCurrency && [...currency.options].some(option => option.value === selectedCurrency)) currency.value = selectedCurrency;
    clearResult();
  }
  offerSelect.addEventListener("change", updatePublicOffer);
  main.append(observed, offerField);
  const form = el("form", "", "shop-compare-form");
  const second = el("input");
  second.type = "url"; second.required = true; second.placeholder = "https://…";
  if (alternative && publicUrl(alternative)) second.value = alternative;
  const finder = retailerFinder(signal, url => {
    second.value = url;
    second.dispatchEvent(new Event("input", { bubbles: true }));
    second.focus();
  });
  const a = amountInput(), b = amountInput(), currency = el("select");
  for (const code of ["USD","GBP","EUR","CAD","AUD","CNY","JPY"]) currency.add(new Option(code, code));
  const record = known && retailComparison(known);
  if (record && [record.reference, record.alternative].some(offer => listingKey(offer.url) === listingKey(first.href))) {
    currency.value = record.currency;
    if (/^\d{8,14}$/.test(record.reference.sku)) finder.setCode(record.reference.sku, record.currency);
  }
  const region = el("input");
  region.placeholder = "e.g. mainland UK"; region.required = true; region.maxLength = 80;
  const same = el("input"); same.type = "checkbox"; same.required = true;
  const confirm = el("label", "", "shop-confirm");
  confirm.append(same, document.createTextNode("I checked that the model, variant, quantity and condition match. Both totals include delivery and tax to this destination."));
  const grid = el("div", "", "shop-form-grid");
  grid.append(field("Original checkout total", a), field("Other checkout total", b), field("Currency for both", currency), field("Delivery destination", region));
  const calculate = el("button", "Compare my totals", "btn primary"); calculate.type = "submit";
  const result = el("div", "", "shop-user-result"); result.setAttribute("role", "status");
  const sourceMatches = el("p", "", "shop-small");
  const secondVariants = el("select");
  const secondField = field("Other storefront variant", secondVariants);
  secondField.hidden = true;
  function clearResult() { result.replaceChildren(); }
  function checkBarcodes() {
    const other = secondVariants.selectedOptions[0]?.dataset;
    const mismatch = !!selectedBarcode && !!other?.barcode && selectedBarcode.padStart(14, "0") !== other.barcode.padStart(14, "0");
    const incompatible = !!selectedCurrency && !!other?.currency && selectedCurrency !== other.currency;
    const reason = mismatch ? "The selected variants have different barcodes." : incompatible ? "The two selected offers use different currencies." : "";
    second.setCustomValidity(reason);
    if (reason) sourceMatches.textContent = reason;
    else if (selectedBarcode && other?.barcode) sourceMatches.textContent = "The two selected public variants have a matching barcode. Confirm pack size and checkout terms.";
    else sourceMatches.textContent = "";
    return !reason;
  }
  secondVariants.addEventListener("change", () => { checkBarcodes(); same.checked = false; clearResult(); });
  offerSelect.addEventListener("change", () => { checkBarcodes(); same.checked = false; });
  form.addEventListener("input", clearResult);
  let lastLookup = "";
  second.addEventListener("input", () => {
    lastLookup = ""; second.setCustomValidity(""); secondField.hidden = true; secondVariants.replaceChildren(); sourceMatches.textContent = ""; same.checked = false;
  });
  async function readOffers(url: URL, select: HTMLSelectElement) {
    const offers = await storefrontOffers(url.href).catch(() => []);
    if (signal.aborted || (select === secondVariants && second.value.trim() !== url.href && publicUrl(second.value.trim())?.href !== url.href)) return false;
    select.replaceChildren();
    if (offers.length > 1) select.add(new Option("Select a variant", ""));
    for (const offer of offers) {
      const option = new Option(offer.title + " · " + money(offer.price, offer.currency) + " before delivery", offer.id);
      option.dataset.currency = offer.currency;
      if (offer.barcode && /^\d{8,14}$/.test(offer.barcode)) option.dataset.barcode = offer.barcode;
      select.add(option);
    }
    return offers.length > 0;
  }
  second.addEventListener("blur", async () => {
    const url = publicUrl(second.value.trim());
    if (!url || lastLookup === url.href) return;
    lastLookup = url.href;
    if (await readOffers(url, secondVariants)) { secondField.hidden = false; same.checked = false; checkBarcodes(); clearResult(); }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const other = publicUrl(second.value.trim());
    if (!other || listingKey(other.href) === listingKey(first.href)) {
      second.setCustomValidity("Enter a different public product listing."); second.reportValidity(); return;
    }
    if (!checkBarcodes()) { second.reportValidity(); return; }
    if ((!offerField.hidden && !offerSelect.value) || (!secondField.hidden && !secondVariants.value)) {
      result.textContent = "Choose the exact storefront variants before comparing."; return;
    }
    if ([selectedCurrency, secondVariants.selectedOptions[0]?.dataset.currency].some(code => code && code !== currency.value)) {
      result.textContent = "Choose the currency used by both public offers."; return;
    }
    const centsA = Math.round(a.valueAsNumber * 100), centsB = Math.round(b.valueAsNumber * 100);
    if (![centsA, centsB].every(value => Number.isSafeInteger(value) && value > 0)) { result.textContent = "Enter two positive checkout totals."; return; }
    const gap = (centsA - centsB) / 100;
    const cheaper = gap > 0 ? other : first;
    result.replaceChildren(el("small", "Your checkout comparison · " + region.value.trim()), el("h2", gap === 0 ? "Same checkout total" : money(Math.abs(gap), currency.value) + " less at " + cheaper.hostname),
      el("p", "Based on the totals you entered."), link("Original listing ↗", first.href), link("Other listing ↗", other.href));
  });
  form.append(field("Other retailer’s product link", second), secondField, sourceMatches, grid, confirm, calculate, result);
  main.append(finder.box, form);
  void readOffers(first, offerSelect).then(ok => {
    if (signal.aborted) return;
    offerField.hidden = !ok;
    if (ok) { observed.textContent = "Public item prices are available for this listing."; updatePublicOffer(); }
    else observed.textContent = "A verified checkout total is unavailable for this link. Use the amounts shown by the two retailers.";
  });
  return main;
}
