import type { ProgressStep } from "./types";

export interface ScanStepDef {
  id: string;
  label: string;
  message: string;
  percent: number;
}

export const SCAN_STEP_DEFS: ScanStepDef[] = [
  {
    id: "capture",
    label: "Capture page context",
    message: "Captured the page context you clicked on.",
    percent: 8,
  },
  {
    id: "resolve",
    label: "Resolve product & price",
    message: "Resolved the product title, image and listed price.",
    percent: 22,
  },
  {
    id: "image",
    label: "Isolate product image",
    message: "Prepared a clean product image for visual search.",
    percent: 38,
  },
  {
    id: "market",
    label: "Check marketplace price",
    message: "Checked the marketplace price and sales signal.",
    percent: 55,
  },
  {
    id: "supply",
    label: "Search 1688 & filter",
    message: "Searched 1688 and filtered listing noise.",
    percent: 72,
  },
  {
    id: "verify",
    label: "Verify factory signals",
    message: "Checked registry, scale and risk signals.",
    percent: 88,
  },
  {
    id: "price",
    label: "Build cost waterfall",
    message: "Built an editable landed-cost model.",
    percent: 100,
  },
];

export function initialSteps(): ProgressStep[] {
  return SCAN_STEP_DEFS.map((step) => ({
    id: step.id,
    label: step.label,
    status: "pending",
  }));
}
