export interface ParsedPrice {
  amount: number;
  currency: string;
  raw: string;
}

const CURRENCY_CODE_RE = /\b(USD|EUR|GBP|CNY|RMB|CAD|AUD|JPY|HKD|SGD)\b/i;

const SYMBOL_TO_CURRENCY: Array<{ re: RegExp; currency: string }> = [
  { re: /CA\$|C\$/i, currency: "CAD" },
  { re: /AU\$|A\$/i, currency: "AUD" },
  { re: /US\$/i, currency: "USD" },
  { re: /£/, currency: "GBP" },
  { re: /€/, currency: "EUR" },
  { re: /¥|￥/, currency: "CNY" },
  { re: /\$/, currency: "USD" },
];

/**
 * Best-effort price parser for page text. It intentionally returns null when
 * the string does not look like a price, instead of guessing.
 */
export function parsePriceText(
  text: string | null | undefined,
  defaultCurrency = "USD",
): ParsedPrice | null {
  if (!text) return null;
  const raw = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (!raw || raw.length > 240) return null;

  const codeMatch = raw.match(CURRENCY_CODE_RE);
  let currency = codeMatch?.[1]?.toUpperCase() ?? "";
  let hasCurrency = Boolean(currency);

  if (!currency) {
    for (const entry of SYMBOL_TO_CURRENCY) {
      if (entry.re.test(raw)) {
        currency = entry.currency;
        hasCurrency = true;
        break;
      }
    }
  }

  if (currency === "CNY" && /(JPY|円)/i.test(raw)) {
    currency = "JPY";
  }
  if (!currency) currency = defaultCurrency;

  if (!hasCurrency && /%|save|off|discount|shipping|free/i.test(raw)) {
    return null;
  }

  const numberMatch =
    raw.match(
      /(?:US\$|CA\$|AU\$|C\$|A\$|\$|£|€|¥|￥)\s*([\d][\d\s.,]*)/,
    ) ??
    raw.match(
      /([\d][\d\s.,]*)\s*(?:USD|EUR|GBP|CNY|RMB|CAD|AUD|JPY|HKD|SGD|\$|£|€|¥|￥)/i,
    ) ??
    raw.match(/([\d][\d\s.,]*)/);

  if (!numberMatch?.[1]) return null;

  const numberText = numberMatch[1].trim();
  if (!numberText || /%$/.test(numberText)) return null;

  const afterMatch = raw
    .slice((numberMatch.index ?? 0) + numberMatch[0].length)
    .trimStart();
  if (!hasCurrency && afterMatch.startsWith("%")) return null;

  const amount = parseNumber(numberText);
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1_000_000_000) {
    return null;
  }

  return { amount, currency, raw };
}

export function parseNumber(value: string): number {
  let text = value.replace(/[^\d.,-]/g, "").trim();
  if (!text) return NaN;

  const negative = text.startsWith("-");
  text = text.replace(/^-/, "");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    text = text.split(thousandsSep).join("");
    if (decimalSep === ",") text = text.replace(",", ".");
  } else if (lastComma !== -1) {
    const parts = text.split(",");
    const decimals = parts[parts.length - 1]?.length ?? 0;
    if (parts.length === 2 && decimals > 0 && decimals <= 2) {
      text = text.replace(",", ".");
    } else {
      text = text.split(",").join("");
    }
  } else if (lastDot !== -1) {
    const parts = text.split(".");
    if (parts.length > 2) {
      const decimals = parts[parts.length - 1]?.length ?? 0;
      if (decimals === 2) {
        text = `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`;
      } else {
        text = parts.join("");
      }
    }
  }

  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return NaN;
  return negative ? -parsed : parsed;
}

export function formatUsd(
  amount: number | null | undefined,
  options: { compact?: boolean; digits?: number } = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  const digits = options.digits ?? 2;
  if (options.compact) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatMoney(
  amount: number | null | undefined,
  currency = "USD",
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  if (currency === "USD") return formatUsd(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatPct(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function safeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 2_000_000) return undefined;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);/i.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function truncate(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function slugFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 60) : parsed.hostname;
  } catch {
    return "page";
  }
}
