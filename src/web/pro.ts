import { computeWaterfall } from "../shared/pricing";
import { formatPct, formatUsd } from "../shared/format";
import type { CostAssumptions, CostWaterfall } from "../shared/types";

interface ProTier {
  qty: number;
  price: number;
}

interface ProSupplier {
  id: string;
  maskedName: string;
  location: string;
  tiers: ProTier[];
  signals: string[];
}

interface ProProduct {
  id: string;
  name: string;
  category: string;
  retail: number;
  scans: number;
  trend: string;
  suppliers: ProSupplier[];
}

const PRODUCTS: ProProduct[] = [
  {
    id: "neck-fan",
    name: "Portable Neck Fan",
    category: "Home / cooling",
    retail: 59.9,
    scans: 12480,
    trend: "+38%",
    suppliers: [
      {
        id: "a",
        maskedName: "Supplier A",
        location: "Cixi, Ningbo · Zhejiang",
        tiers: [
          { qty: 100, price: 3.85 },
          { qty: 500, price: 3.1 },
          { qty: 2000, price: 2.55 },
        ],
        signals: [
          "Business scope includes manufacturing and assembly",
          "128 insured employees (2024 filing)",
          "1688 factory flag · 4 years on platform",
          "Lead time 12–18 days · CE/FCC on file",
        ],
      },
      {
        id: "b",
        maskedName: "Supplier B",
        location: "Bao'an, Shenzhen · Guangdong",
        tiers: [
          { qty: 100, price: 4.1 },
          { qty: 500, price: 3.35 },
          { qty: 2000, price: 2.8 },
        ],
        signals: [
          "Electronic product manufacturing scope",
          "96 insured employees (2024 filing)",
          "OEM/ODM available · 2 private molds",
          "Lead time 10–15 days",
        ],
      },
      {
        id: "c",
        maskedName: "Supplier C",
        location: "Dongguan · Guangdong",
        tiers: [
          { qty: 100, price: 3.6 },
          { qty: 500, price: 2.95 },
          { qty: 2000, price: 2.4 },
        ],
        signals: [
          "Molds, injection molding and assembly",
          "64 insured employees (2024 filing)",
          "Supports 100–300 pc trial runs",
          "Lead time 14–20 days",
        ],
      },
    ],
  },
  {
    id: "led-mask",
    name: "LED Light Therapy Face Mask",
    category: "Beauty device",
    retail: 129,
    scans: 8210,
    trend: "+22%",
    suppliers: [
      {
        id: "a",
        maskedName: "Supplier A",
        location: "Bao'an, Shenzhen · Guangdong",
        tiers: [
          { qty: 100, price: 9.8 },
          { qty: 500, price: 8.2 },
          { qty: 2000, price: 6.9 },
        ],
        signals: [
          "Medical device manufacturing scope",
          "210 insured employees (2024 filing)",
          "FDA 510(k) support · CE on file",
          "Lead time 18–25 days",
        ],
      },
      {
        id: "b",
        maskedName: "Supplier B",
        location: "Zhongshan · Guangdong",
        tiers: [
          { qty: 100, price: 10.4 },
          { qty: 500, price: 8.8 },
          { qty: 2000, price: 7.3 },
        ],
        signals: [
          "LED lighting and beauty device scope",
          "140 insured employees",
          "Private label packaging available",
          "Lead time 15–22 days",
        ],
      },
      {
        id: "c",
        maskedName: "Supplier C",
        location: "Shenzhen · Guangdong",
        tiers: [
          { qty: 100, price: 11.2 },
          { qty: 500, price: 9.5 },
          { qty: 2000, price: 7.9 },
        ],
        signals: [
          "Consumer electronics manufacturing",
          "88 insured employees",
          "Small-batch friendly · 50 pc MOQ on stock colors",
          "Lead time 12–18 days",
        ],
      },
    ],
  },
  {
    id: "waffle",
    name: "Mini Waffle Maker",
    category: "Kitchen appliance",
    retail: 39.99,
    scans: 6940,
    trend: "+15%",
    suppliers: [
      {
        id: "a",
        maskedName: "Supplier A",
        location: "Cixi, Ningbo · Zhejiang",
        tiers: [
          { qty: 100, price: 4.2 },
          { qty: 500, price: 3.6 },
          { qty: 2000, price: 3.1 },
        ],
        signals: [
          "Small appliance manufacturing scope",
          "180 insured employees",
          "UL/ETL support · 120V and 220V lines",
          "Lead time 20–28 days",
        ],
      },
      {
        id: "b",
        maskedName: "Supplier B",
        location: "Foshan · Guangdong",
        tiers: [
          { qty: 100, price: 4.4 },
          { qty: 500, price: 3.8 },
          { qty: 2000, price: 3.25 },
        ],
        signals: [
          "Home appliance assembly",
          "112 insured employees",
          "Non-stick coating options",
          "Lead time 18–25 days",
        ],
      },
      {
        id: "c",
        maskedName: "Supplier C",
        location: "Zhongshan · Guangdong",
        tiers: [
          { qty: 100, price: 4.7 },
          { qty: 500, price: 4.05 },
          { qty: 2000, price: 3.5 },
        ],
        signals: [
          "Electrical appliance manufacturing",
          "76 insured employees",
          "Small trial batches available",
          "Lead time 15–22 days",
        ],
      },
    ],
  },
  {
    id: "chopper",
    name: "Vegetable Chopper",
    category: "Kitchen tool",
    retail: 34.99,
    scans: 5320,
    trend: "+11%",
    suppliers: [
      {
        id: "a",
        maskedName: "Supplier A",
        location: "Taizhou · Zhejiang",
        tiers: [
          { qty: 100, price: 2.9 },
          { qty: 500, price: 2.4 },
          { qty: 2000, price: 2.05 },
        ],
        signals: [
          "Plastic injection and assembly",
          "150 insured employees",
          "Food-contact material certificates",
          "Lead time 12–18 days",
        ],
      },
      {
        id: "b",
        maskedName: "Supplier B",
        location: "Jinhua · Zhejiang",
        tiers: [
          { qty: 100, price: 3.05 },
          { qty: 500, price: 2.55 },
          { qty: 2000, price: 2.15 },
        ],
        signals: [
          "Houseware manufacturing scope",
          "98 insured employees",
          "Blade supplier in-house",
          "Lead time 10–16 days",
        ],
      },
      {
        id: "c",
        maskedName: "Supplier C",
        location: "Taizhou · Zhejiang",
        tiers: [
          { qty: 100, price: 3.3 },
          { qty: 500, price: 2.75 },
          { qty: 2000, price: 2.3 },
        ],
        signals: [
          "Kitchen gadget manufacturing",
          "64 insured employees",
          "Low MOQ trial runs",
          "Lead time 14–20 days",
        ],
      },
    ],
  },
  {
    id: "pet-fountain",
    name: "Pet Water Fountain",
    category: "Pet",
    retail: 49.99,
    scans: 4110,
    trend: "+9%",
    suppliers: [
      {
        id: "a",
        maskedName: "Supplier A",
        location: "Zhongshan · Guangdong",
        tiers: [
          { qty: 100, price: 6.1 },
          { qty: 500, price: 5.2 },
          { qty: 2000, price: 4.4 },
        ],
        signals: [
          "Pet appliance manufacturing scope",
          "132 insured employees",
          "Pump supplier in-house · CE on file",
          "Lead time 15–22 days",
        ],
      },
      {
        id: "b",
        maskedName: "Supplier B",
        location: "Dongguan · Guangdong",
        tiers: [
          { qty: 100, price: 6.4 },
          { qty: 500, price: 5.45 },
          { qty: 2000, price: 4.65 },
        ],
        signals: [
          "Injection molding and assembly",
          "104 insured employees",
          "BPA-free material options",
          "Lead time 12–18 days",
        ],
      },
      {
        id: "c",
        maskedName: "Supplier C",
        location: "Shenzhen · Guangdong",
        tiers: [
          { qty: 100, price: 6.9 },
          { qty: 500, price: 5.9 },
          { qty: 2000, price: 5.0 },
        ],
        signals: [
          "Pet electronics and molds",
          "72 insured employees",
          "Small-batch friendly",
          "Lead time 18–25 days",
        ],
      },
    ],
  },
];

const state = {
  selected: PRODUCTS[0]?.id ?? "",
  moq: 500,
  retail: PRODUCTS[0]?.retail ?? 59.9,
  freight: 2.2,
  duty: 25,
  platform: 6,
  affiliate: 20,
  returns: 8,
  ads: 20,
  fulfillment: 4.5,
};

export function renderProWorkspace(): void {
  const radar = document.getElementById("radarList");
  const main = document.getElementById("proMain");
  if (!radar || !main) return;

  radar.replaceChildren(...PRODUCTS.map(renderRadarItem));
  const product = selectedProduct();
  main.replaceChildren(
    renderProductHeader(product),
    renderCalculator(product),
    renderSuppliers(product),
    renderInquiry(product),
  );
}

function selectedProduct(): ProProduct {
  return PRODUCTS.find((p) => p.id === state.selected) ?? PRODUCTS[0]!;
}

function selectProduct(id: string): void {
  const next = PRODUCTS.find((p) => p.id === id);
  if (!next) return;
  state.selected = id;
  state.retail = next.retail;
  state.moq = 500;
  renderProWorkspace();
}

function renderRadarItem(product: ProProduct): HTMLElement {
  const active = product.id === state.selected;
  const node = el("button", {
    class: `radar-item ${active ? "active" : ""}`.trim(),
    attrs: { type: "button" },
  });
  node.append(
    el("div", { class: "radar-item-top" }, [
      el("strong", { text: product.name }),
      el("span", { class: "radar-trend", text: product.trend }),
    ]),
    el("p", { class: "radar-meta", text: `${product.category} · ${formatUsd(product.retail)}` }),
    el("p", {
      class: "radar-scans",
      text: `${product.scans.toLocaleString("en-US")} scans in 24h (mock)`,
    }),
  );
  node.addEventListener("click", () => selectProduct(product.id));
  return node;
}

function renderProductHeader(product: ProProduct): HTMLElement {
  const factory = priceAtMoq(product.suppliers[0]!, state.moq);
  const markup = factory > 0 ? product.retail / factory : null;
  return el("section", { class: "card pro-product" }, [
    el("header", { class: "card-head" }, [
      el("div", {}, [
        el("p", { class: "eyebrow", text: "Selected opportunity" }),
        el("h2", { text: product.name }),
      ]),
      el("span", { class: "mock-badge", text: "Sample data" }),
    ]),
    el("div", { class: "pro-stats" }, [
      stat("Retail", formatUsd(product.retail)),
      stat("Factory at MOQ", factory > 0 ? formatUsd(factory) : "—"),
      stat("Markup", markup === null ? "—" : `${markup.toFixed(1)}×`),
      stat("24h scans", product.scans.toLocaleString("en-US")),
    ]),
    el("p", {
      class: "fine-print",
      text: "Workspace figures are sample data. The model is live; the supplier signals are not verified.",
    }),
  ]);
}

function stat(label: string, value: string): HTMLElement {
  return el("div", { class: "pro-stat" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
  ]);
}

function renderCalculator(product: ProProduct): HTMLElement {
  const card = el("section", { class: "card" });
  card.append(
    el("header", { class: "card-head" }, [
      el("h3", { text: "Net profit calculator" }),
      el("span", { text: "Live model · editable" }),
    ]),
  );

  const grid = el("div", { class: "calc-grid" });
  grid.append(
    numberField("Retail price", state.retail, (v) => {
      state.retail = v;
      updateCalculator();
    }, { min: 1, step: 0.01, prefix: "$" }),
    selectField("MOQ", state.moq, [100, 500, 2000], (v) => {
      state.moq = v;
      updateCalculator();
      renderProWorkspace();
    }),
    numberField("Freight / unit", state.freight, (v) => {
      state.freight = v;
      updateCalculator();
    }, { min: 0, step: 0.1, prefix: "$" }),
    numberField("Duty", state.duty, (v) => {
      state.duty = v;
      updateCalculator();
    }, { min: 0, step: 1, suffix: "%" }),
    numberField("Platform fee", state.platform, (v) => {
      state.platform = v;
      updateCalculator();
    }, { min: 0, step: 0.5, suffix: "%" }),
    numberField("Creator / affiliate", state.affiliate, (v) => {
      state.affiliate = v;
      updateCalculator();
    }, { min: 0, step: 1, suffix: "%" }),
    numberField("Returns", state.returns, (v) => {
      state.returns = v;
      updateCalculator();
    }, { min: 0, step: 0.5, suffix: "%" }),
    numberField("Ads", state.ads, (v) => {
      state.ads = v;
      updateCalculator();
    }, { min: 0, step: 1, suffix: "%" }),
  );
  card.append(grid);

  const output = el("div", { class: "calc-output", attrs: { id: "calcOutput" } });
  card.append(output);
  requestAnimationFrame(updateCalculator);
  return card;
}

function numberField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  opts: { min?: number; step?: number; prefix?: string; suffix?: string },
): HTMLElement {
  const field = el("label", { class: "calc-field" });
  field.append(el("span", { text: label }));
  const wrap = el("div", { class: "calc-input" });
  if (opts.prefix) wrap.append(el("em", { text: opts.prefix }));
  const input = el("input", {
    attrs: {
      type: "number",
      min: String(opts.min ?? 0),
      step: String(opts.step ?? 1),
      value: String(value),
    },
  });
  input.addEventListener("input", () => {
    const next = Number(input.value);
    if (Number.isFinite(next) && next >= 0) onChange(next);
  });
  wrap.append(input);
  if (opts.suffix) wrap.append(el("em", { text: opts.suffix }));
  field.append(wrap);
  return field;
}

function selectField(
  label: string,
  value: number,
  options: number[],
  onChange: (value: number) => void,
): HTMLElement {
  const field = el("label", { class: "calc-field" });
  field.append(el("span", { text: label }));
  const select = el("select", { class: "calc-input" });
  for (const option of options) {
    const node = el("option", { text: `${option} pc`, attrs: { value: String(option) } });
    if (option === value) node.selected = true;
    select.append(node);
  }
  select.addEventListener("change", () => onChange(Number(select.value)));
  field.append(select);
  return field;
}

function updateCalculator(): void {
  const output = document.getElementById("calcOutput");
  if (!output) return;
  const product = selectedProduct();
  const factory = priceAtMoq(product.suppliers[0]!, state.moq);
  const assumptions: CostAssumptions = {
    fobUsd: factory,
    shippingPerUnitUsd: state.freight,
    dutyRatePct: state.duty,
    platformFeePct: state.platform,
    affiliatePct: state.affiliate,
    paymentPct: 3,
    fulfillmentPerUnitUsd: state.fulfillment,
    returnRatePct: state.returns,
    adPct: state.ads,
  };
  const waterfall = computeWaterfall(state.retail, assumptions);
  output.replaceChildren(
    el("div", { class: "calc-headline" }, [
      el("div", {}, [
        el("span", { text: "Net per unit" }),
        el("strong", {
          class: waterfall.netUsd >= 0 ? "good" : "bad",
          text: formatUsd(waterfall.netUsd),
        }),
      ]),
      el("div", {}, [
        el("span", { text: "Net margin" }),
        el("strong", {
          class: waterfall.netUsd >= 0 ? "good" : "bad",
          text: formatPct(waterfall.netMarginPct),
        }),
      ]),
      el("div", {}, [
        el("span", { text: "Landed" }),
        el("strong", { text: formatUsd(waterfall.landedUsd) }),
      ]),
    ]),
    renderBar(waterfall),
    renderCostRows(waterfall),
  );
}

function renderBar(waterfall: CostWaterfall): HTMLElement {
  const segments = [
    { label: "Landed", value: waterfall.landedUsd, cls: "landed" },
    {
      label: "Fees",
      value: waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd,
      cls: "fees",
    },
    {
      label: "Fulfillment & returns",
      value: waterfall.fulfillmentUsd + waterfall.returnsUsd,
      cls: "ops",
    },
    { label: "Ads", value: waterfall.adUsd, cls: "ads" },
    { label: "Net", value: Math.max(0, waterfall.netUsd), cls: "net" },
  ].filter((segment) => segment.value > 0);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const bar = el("div", { class: "calc-bar" });
  if (total <= 0) return bar;
  for (const segment of segments) {
    const node = el("div", {
      class: `calc-bar-seg ${segment.cls}`,
      attrs: { title: `${segment.label}: ${formatUsd(segment.value)}` },
    });
    node.style.width = `${(segment.value / total) * 100}%`;
    bar.append(node);
  }
  return bar;
}

function renderCostRows(waterfall: CostWaterfall): HTMLElement {
  const rows: Array<[string, number]> = [
    ["Retail", waterfall.retailUsd],
    ["Factory (EXW)", waterfall.fobUsd],
    ["Freight", waterfall.shippingUsd],
    ["Duty", waterfall.dutyUsd],
    ["Platform + affiliate + payment", waterfall.platformFeeUsd + waterfall.affiliateUsd + waterfall.paymentUsd],
    ["Fulfillment + returns", waterfall.fulfillmentUsd + waterfall.returnsUsd],
    ["Ads", waterfall.adUsd],
    ["Net before tax", waterfall.netUsd],
  ];
  const list = el("div", { class: "calc-rows" });
  for (const [label, value] of rows) {
    list.append(
      el("div", { class: `calc-row ${label === "Net before tax" ? "total" : ""}`.trim() }, [
        el("span", { text: label }),
        el("strong", { text: formatUsd(value) }),
      ]),
    );
  }
  return list;
}

function renderSuppliers(product: ProProduct): HTMLElement {
  const card = el("section", { class: "card" });
  card.append(
    el("header", { class: "card-head" }, [
      el("h3", { text: "Supplier shortlist" }),
      el("span", { text: "Names locked · sample signals" }),
    ]),
  );
  for (const supplier of product.suppliers) {
    const node = el("div", { class: "supplier" });
    node.append(
      el("div", { class: "supplier-head" }, [
        el("div", {}, [
          el("strong", { text: supplier.maskedName }),
          el("p", { class: "supplier-loc", text: supplier.location }),
        ]),
        el("button", {
          class: "btn secondary small",
          text: "Unlock report",
          attrs: { type: "button" },
        }),
      ]),
    );
    const tiers = el("div", { class: "supplier-tiers" });
    for (const tier of supplier.tiers) {
      const chip = el("button", {
        class: `tier-chip ${tier.qty === state.moq ? "active" : ""}`.trim(),
        text: `MOQ ${tier.qty} · ${formatUsd(tier.price)}`,
        attrs: { type: "button" },
      });
      chip.addEventListener("click", () => {
        state.moq = tier.qty;
        renderProWorkspace();
      });
      tiers.append(chip);
    }
    node.append(tiers);
    const signals = el("ul", { class: "supplier-signals" });
    for (const signal of supplier.signals) signals.append(el("li", { text: signal }));
    node.append(signals);
    node.append(
      el("div", { class: "supplier-locked" }, [
        lockIcon(),
        el("span", { text: "Factory legal name, phone and 1688 link are locked in this sample." }),
      ]),
    );
    const unlock = node.querySelector<HTMLButtonElement>(".btn");
    unlock?.addEventListener("click", () =>
      toast("Paywall is not connected. This is the Pro unlock slot."),
    );
    card.append(node);
  }
  card.append(
    el("p", {
      class: "fine-print",
      text: "Supplier names, signals and prices are sample data for interface review.",
    }),
  );
  return card;
}

function renderInquiry(product: ProProduct): HTMLElement {
  const card = el("section", { class: "card" });
  card.append(
    el("header", { class: "card-head" }, [
      el("h3", { text: "Request factory evidence" }),
      el("span", { text: "Mock form · stored locally" }),
    ]),
  );
  const form = el("form", { class: "inquiry" });
  const email = el("input", {
    class: "inquiry-input",
    attrs: { type: "email", placeholder: "you@brand.com", required: "true" },
  });
  const whatsapp = el("input", {
    class: "inquiry-input",
    attrs: { type: "tel", placeholder: "WhatsApp (optional)" },
  });
  const select = el("select", { class: "inquiry-input" });
  for (const tier of [100, 500, 2000]) {
    const option = el("option", { text: `${tier} pc`, attrs: { value: String(tier) } });
    if (tier === state.moq) option.selected = true;
    select.append(option);
  }
  const message = el("textarea", {
    class: "inquiry-input wide",
    attrs: { rows: "3", placeholder: "What do you need? Packaging, certification, private label…" },
  });
  const oem = el("label", { class: "inquiry-check" });
  const oemInput = el("input", { attrs: { type: "checkbox" } });
  oem.append(oemInput, el("span", { text: "I need OEM / private label" }));

  form.append(
    el("label", { class: "inquiry-field" }, [
      el("span", { text: "Work email" }),
      email,
    ]),
    el("label", { class: "inquiry-field" }, [
      el("span", { text: "WhatsApp" }),
      whatsapp,
    ]),
    el("label", { class: "inquiry-field" }, [
      el("span", { text: "Target MOQ" }),
      select,
    ]),
    oem,
    message,
  );

  const submit = el("button", { class: "btn primary", text: "Queue factory request", attrs: { type: "submit" } });
  form.append(submit);

  const status = el("p", { class: "inquiry-status" });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      status.textContent = "Enter a valid email address.";
      status.className = "inquiry-status error";
      return;
    }
    const inquiry = {
      product: product.name,
      email: value,
      whatsapp: whatsapp.value.trim(),
      moq: Number(select.value),
      oem: oemInput.checked,
      message: message.value.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      const key = "onion-head.inquiries";
      const existing = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
      localStorage.setItem(key, JSON.stringify([inquiry, ...existing].slice(0, 50)));
    } catch {
      // Local storage may be unavailable.
    }
    status.textContent = `Queued locally for ${product.name}. No request was sent — this is a mock workspace.`;
    status.className = "inquiry-status ok";
    submit.disabled = true;
    toast("Inquiry stored locally (mock).");
  });

  card.append(form, status);
  return card;
}

function priceAtMoq(supplier: ProSupplier, moq: number): number {
  const sorted = [...supplier.tiers].sort((a, b) => a.qty - b.qty);
  const eligible = sorted.filter((tier) => tier.qty <= moq);
  return (eligible[eligible.length - 1] ?? sorted[0])?.price ?? 0;
}

function lockIcon(): HTMLElement {
  const node = el("span", { class: "lock-icon" });
  node.innerHTML =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  return node;
}

function toast(message: string): void {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
  window.setTimeout(() => {
    node.hidden = true;
  }, 3200);
}

interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
}

function el<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props: ElProps = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children) node.append(child);
  return node;
}
