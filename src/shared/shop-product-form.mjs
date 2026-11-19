export function plain(value, limit = 180) {
  if (typeof value !== "string") return "";
  return value
    .replace(
      /&(?:amp|quot|apos|lt|gt|#39|#x27);/gi,
      (token) =>
        ({
          "&amp;": "&",
          "&quot;": '"',
          "&apos;": "'",
          "&lt;": "<",
          "&gt;": ">",
          "&#39;": "'",
          "&#x27;": "'",
        })[token.toLowerCase()],
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export const normalized = (text) =>
  plain(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const ignored = new Set([
  "a",
  "an",
  "and",
  "at",
  "buy",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function words(value) {
  return typeof value === "string"
    ? (value
        .normalize("NFKC")
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? [])
    : [];
}

// Read the thing being sold separately from brand, character, colour and marketing
// text. Unknown product forms need a verified identifier before becoming a candidate.
const productNouns = new Set(
  "adapter apron backpack bag battery beanie belt bench blender board book bottle bowl bracelet brush cable caddy camera candle cardigan case chair charger clock coat comb controller cover cream cup cushion desk doll dress drill dryer earring figurine flashlight flask frame frother game glove grinder guitar headphone headset heater helmet hoodie jacket kettle keyboard kit lamp lantern lens lighter lipstick lotion machine mask mat mattress microphone mirror mixer monitor mug necklace notebook oven pad pan pants pen perfume phone pillow plate playset pot printer projector puzzle radio razor ring robot router sandal scarf scale scanner screen serum shampoo shirt shoe shorts skillet skirt slipper speaker spoon stand sticker stool strap suitcase sweater sweatshirt swimsuit table tablet telescope thermometer toaster tool toothbrush towel toy tripod tumbler vacuum vase wallet watch whisk wrench".split(
    " ",
  ),
);
const formAliases = new Map(
  Object.entries({
    workbench: "bench",
    workbenches: "bench",
    benches: "bench",
    headphones: "headphone",
    tshirt: "shirt",
    videogame: "game",
    games: "game",
    playsets: "playset",
    knives: "knife",
    glasses: "glasses",
    accessories: "accessory",
  }),
);
const optionWords = new Set([
  "black",
  "white",
  "blue",
  "red",
  "green",
  "yellow",
  "silver",
  "gold",
  "grey",
  "gray",
  "pink",
  "purple",
  "large",
  "small",
  "medium",
  "single",
  "default",
  "variant",
  "sku",
  "size",
  "color",
]);

function titleForm(text) {
  const clean = String(text || "")
    .slice(0, 350)
    .toLowerCase()
    .replace(/\bplay[- ]+sets?\b/g, "playset")
    .replace(/\bwork[- ]+bench(es)?\b/g, "workbench")
    .replace(/\bt[- ]shirt(s?)\b/g, "tshirt$1");
  for (const part of clean.split(/\s+[–—-]\s+|[,;|]/)) {
    const headline = part.split(/\b(?:with(?:out)?|including|ideal for|compatible with|for)\b/)[0];
    const tokens = words(headline);
    for (let n = tokens.length - 1; n >= 0; n--) {
      const token = tokens[n];
      const root = formAliases.get(token) ?? (productNouns.has(token) ? token : token.replace(/s$/, ""));
      if (!productNouns.has(root) && !formAliases.has(token)) continue;
      // An immediately preceding compound noun remains in the query ("tool bench playset").
      const previous = tokens[n - 1];
      let start = previous && !ignored.has(previous) && !optionWords.has(previous) ? n - 1 : n;
      if (start > 0 && productNouns.has(previous) && !ignored.has(tokens[start - 1])) start--;
      return { root, phrase: tokens.slice(start, n + 1).join(" ") };
    }
  }
  return null;
}

function primaryForm(item, variant) {
  const name = String(item?.name || ""),
    option = String(variant?.variant || "");
  // Labels like "without stand - black" describe configuration; "PS4 Video Games"
  // and "Tool Bench Playset" name a product. Accessories can be standalone listings too.
  const form = !/[+]|\b(?:with(?:out)?|no)\b/i.test(option) && titleForm(option);
  return form || titleForm(name);
}

export function shopProductQuery(item, variant) {
  // A subtitle can contain a noun unrelated to the listing ("A Life-Changing Tool").
  // Keep the complete name for subsequent matching; shorten only the discovery query.
  const listingName = plain(item.name, 350);
  // Bracketed endorsements sometimes repeat the type but omit the brand and
  // product line ("[Cardi B' Pick Eye Cream] HEVEBLUE Black Yuja ...").
  const name = listingName.replace(/^(?:\[[^\]]*\bpicks?\b[^\]]*\]|【[^】]*\bpicks?\b[^】]*】)\s*/i, "") || listingName;
  const beforeSubtitle = name.split(/:\s+/, 1)[0];
  const queryName = words(beforeSubtitle).filter(word => !ignored.has(word)).length >= 2 ? beforeSubtitle : name;
  const form = primaryForm({name:queryName}, variant);
  const title = words(queryName),
    brand = words(item.brand),
    model = words(variant.mpn || item.model);
  const inName = new Set(title);
  const label = /[+]|\b(?:with(?:out)?|no)\b/i.test(variant.variant)
    ? []
    : words(variant.variant).filter(
        (w) => w.length > 2 && !ignored.has(w) && !optionWords.has(w) && inName.has(w),
      );
  const keyWords = form ? words(form.phrase) : title.filter(word => !ignored.has(word)).slice(0,8);
  // Without a model or named option, the seller's leading words are often the
  // only product identity. A form alone can reduce a named puzzle cube to "toy".
  if (form && !model.length && !label.length) {
    const lead = words(queryName.split(/[,;|]|\s+[–—-]\s+/,1)[0]).filter(word => !ignored.has(word));
    keyWords.unshift(...lead.slice(0,5));
  }
  return [...new Set([...brand, ...model, ...label.slice(0, 4), ...keyWords])].join(" ").slice(0, 120);
}

// Short seller titles often omit the full named edition. Search for the
// product line and form as well, then verify the selected SKU in its listing.
export function shopProductTitleQuery(item, variant) {
  const name = plain(item.name, 350);
  const headline = name.replace(/^(?:\[[^\]]*\]|【[^】]*】)\s*/, "").split(/[,;:|]|\s+[–—-]\s+|\s+[lI]\s+(?=[A-Z])/,1)[0];
  const form = primaryForm(item, variant);
  const brand = words(item.brand).filter(word => !["generic","unbranded","unknown","official"].includes(word));
  const title = words(headline).filter(word => !ignored.has(word) && word !== "official").slice(0, 6);
  const label = words(variant?.variant).filter(word => !ignored.has(word) && !genericOptions.has(word));
  const terms = [...new Set([...brand, ...title, ...words(form?.phrase)])];
  // A shade or model code can distinguish options that share the product name.
  const code = label.find(word => /[a-z]/i.test(word) && /\d/.test(word));
  if (code && !terms.includes(code)) terms.push(code);
  else if (label.length && label.length <= 3 && label.every(word => words(name).includes(word))) {
    for (const word of label) if (!terms.includes(word)) terms.push(word);
  }
  return terms.length >= 2 ? terms.join(" ").slice(0, 120) : "";
}

export function sameShopProductForm(item, variant, other, otherVariant) {
  const source = primaryForm(item, variant),
    target = primaryForm(other, otherVariant);
  return !!source && !!target && source.root === target.root;
}

function packCount(item, v) {
  const words = plain(item.name + " " + v.variant, 500);
  const match =
    words.match(/\b(\d{1,3})[- ]?(?:pack|pk|pieces|pcs|count)\b/i) || words.match(/\bpack of (\d{1,3})\b/i);
  return match ? Number(match[1]) : 1;
}

const colors =
  /\b(black|white|red|green|blue|navy|yellow|orange|pink|purple|brown|beige|cream|gold|silver|gr[ae]y|teal|khaki|ivory|charcoal|burgundy|clear)\b/g;
const distinctValues = (s, regex) =>
  new Set([...s.toLowerCase().matchAll(regex)].map((m) => m[1].replace("grey", "gray")));
const disjoint = (a, b) => a.size > 0 && b.size > 0 && ![...a].some((x) => b.has(x));

function accessoryStates(label) {
  const map = new Map();
  for (const m of label
    .toLowerCase()
    .matchAll(/\b(without|with|no|w\/o|w\/)\s+(?:a |an |the )?([a-z]{3,30})\b/g)) {
    if (!["the", "and", "for"].includes(m[2]))
      map.set(m[2], ["without", "no", "w/o"].includes(m[1]) ? "without" : "with");
  }
  if (label.includes("+")) {
    for (const part of label
      .toLowerCase()
      .split("+")
      .map((s) => s.trim())) {
      if (/^[a-z]{3,25}$/.test(part) && !map.has(part)) map.set(part, "with");
    }
  }
  return map;
}

export function knownBrand(value) {
  const name = normalized(value);
  return /^(?:unbranded|generic(?: brand)?|no brand|no brand name|brandless|unbranded generic|unknown(?: brand)?|not specified|not applicable|n a|na|none|null|不详|无品牌)$/.test(
    name,
  )
    ? ""
    : name;
}

export function variantConflicts(item, v, product, other) {
  if (packCount(item, v) !== packCount(product, other)) return true;
  const aBrand = knownBrand(item.brand),
    bBrand = knownBrand(product.brand);
  if (aBrand && bBrand && aBrand !== bBrand) return true;
  const a = plain(v.variant),
    b = plain(other.variant);
  if (disjoint(distinctValues(a, colors), distinctValues(b, colors))) return true;
  // Numeric option values in a selected SKU override a general product headline.
  for (const unit of ["speeds?", "heads?", "settings?", "ml", "watts?", "inches"]) {
    const re = new RegExp("\\b(\\d+(?:\\.\\d+)?)\\s*[- ]?\\s*(?:" + unit + ")\\b", "gi");
    const facet = (label, title) => {
      const values = distinctValues(label, re);
      return values.size ? values : distinctValues(title, re);
    };
    if (disjoint(facet(a, plain(item.name)), facet(b, plain(product.name)))) return true;
  }
  const included = accessoryStates(a),
    alternative = accessoryStates(b);
  return [...included].some(([key, state]) => alternative.has(key) && alternative.get(key) !== state);
}

// A similar-product benchmark needs a shared distinguishing option in addition
// to the broad product type required for displaying a possible shop listing.
const genericOptions = new Set([
  ...optionWords,
  "colour",
  "natural",
  "navy",
  "ivory",
  "khaki",
  "teal",
  "lime",
  "magenta",
  "orange",
  "brown",
  "beige",
  "cream",
  "charcoal",
  "burgundy",
  "clear",
  "multicolor",
  "regular",
  "standard",
  "title",
  "classic",
  "basic",
  "premium",
  "deluxe",
  "edition",
  "official",
  "set",
  "version",
  "one",
  "only",
  "new",
  "original",
  "unbranded",
  "generic",
  "unknown",
  "type",
  "style",
  "option",
  "design",
  "assorted",
  "xs",
  "xl",
  "xxl",
]);

function optionIdentity(label, brand) {
  const source = plain(label);
  if (!source || /^(?:sku|item|option|variant|style|model|size)[ #:_-]*\d+$/i.test(source)) return null;
  const withAccessory = /\b(?:with(?:out)?|no)\s+[a-z]/i.test(source);
  const brandWords = new Set(words(brand));
  const selected = words(source).filter(
    (word) =>
      !brandWords.has(word) &&
      (word === "with" || !ignored.has(word)) &&
      (withAccessory ||
        (!productNouns.has(word) && !productNouns.has(word.replace(/s$/, "")) && !formAliases.has(word))),
  );
  const named = selected.filter(
    (word) =>
      word.length > 2 &&
      !genericOptions.has(word) &&
      !/^\d+$/.test(word) &&
      !["with", "without"].includes(word),
  );
  const configured = withAccessory && named.length > 0;
  const measured =
    /\b\d+(?:\.\d+)?\s*[- ]?(?:pack|count|ml|oz|inches|inch|watts|speeds|heads|settings|gb|tb)\b/i.test(
      source,
    );
  return (named.length >= 2 || configured || measured) && selected.length ? selected.join(" ") : null;
}

export function comparableCondition(name, variant) {
  return (
    (!variant.condition || /^(NewCondition|new)$/i.test(variant.condition)) &&
    !/\b(?:used|pre-owned|renewed|refurbished|open[- ]box|parts only)\b/i.test(name + " " + variant.variant)
  );
}

// Foundation lines from a single brand can share a shade code and colour name.
// They qualify only as similar items. A colour on its own cannot establish it.
function sameNamedShade(product, variant, offer) {
  const brand = knownBrand(product.brand), source = normalized(variant.variant);
  if (!brand || !source || product.weightConflict || offer.weightConflict || source !== normalized(offer.variant) ||
    !/^\d{1,2}[cnw]\d? [a-z]+(?: [a-z]+)*$/.test(source)) return false;
  const names = [normalized(product.name), normalized(offer.name)];
  if (!names.every(name => /\b(?:foundation|concealer|cushion)\b/.test(name) && (" " + name + " ").includes(" " + brand + " "))) return false;
  if (names.some(name => /\b(?:minis?|refills?|samples?|travel size)\b/.test(name))) return false;
  function weightGrams(item) {
    const text = (item.netWeight || "") + " " + item.name;
    const grams = text.match(/\b(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);
    if (grams) return Number(grams[1]);
    const oz = text.match(/(?<!fl\.?\s)\b(\d+(?:\.\d+)?)\s*oz\b/i);
    return oz ? Number(oz[1]) * 28.3495 : null;
  }
  const left = weightGrams(product), right = weightGrams(offer);
  // 0.63 oz and 18 g describe the same nominal fill after label rounding.
  return !!left && !!right && Math.abs(left - right) <= Math.min(left,right) * 0.015;
}

export function hasComparableShopOption(product, variant, offer, { namedShades = false } = {}) {
  const peerVariant = { variant: offer.variant, gtin: offer.gtin };
  if (
    variantConflicts(product, variant, offer, peerVariant) ||
    !sameShopProductForm(product, variant, offer, peerVariant)
  )
    return false;
  const originalForm = titleForm(product.name),
    peerForm = titleForm(offer.name);
  if (originalForm && peerForm && originalForm.root !== peerForm.root) return false;
  const sourceOption = optionIdentity(variant.variant, product.brand);
  if (namedShades && /\b(?:foundation|concealer|cushion)\b/i.test(product.name) &&
    /^\d{1,2}[cnw]\d?\s/i.test(variant.variant)) return sameNamedShade(product, variant, offer);
  return sourceOption !== null && sourceOption === optionIdentity(offer.variant, product.brand);
}
