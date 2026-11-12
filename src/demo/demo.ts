import { Hud } from "../content/ui/hud";
import { createDemoResult } from "../shared/demo";
import { SCAN_STEP_DEFS } from "../shared/steps";
import type {
  PageContext,
  SaveLeadResult,
  ScanProgress,
} from "../shared/types";

const productImage = new URL(
  "./assets/demo-neck-fan.svg",
  window.location.href,
).toString();

const context: PageContext = {
  platform: "tiktok",
  pageType: "product",
  url: window.location.href,
  title: "Portable Neck Fan — Ultra Cooling",
  caption:
    "A bladeless neck fan with a semiconductor cooling plate, three speeds and a 4,000 mAh battery.",
  brand: "Demo Brand",
  price: {
    amount: 59.9,
    currency: "USD",
    source: "demo page",
    raw: "$59.90",
  },
  imageUrl: productImage,
  identifiers: { productId: "demo-neck-fan" },
  extractedBy: "demo-page",
  extractedAt: new Date().toISOString(),
};

let runId = 0;

const hud = new Hud({
  onLauncherClick: () => {
    hud.showCapture(context);
  },
  onAnalyzePage: () => {
    void open();
  },
  onAnalyzeInput: () => {
    void open();
  },
  onNewScan: () => {
    hud.showCapture(context);
  },
  onCancel: () => {
    stop();
  },
  onClose: () => {
    stop();
  },
  onOpenOptions: () => {
    window.alert(
      "Settings live in the extension popup. This page is a standalone preview of the HUD.",
    );
  },
  onRetry: () => {
    void open();
  },
  onSubmitLead: async (): Promise<SaveLeadResult> => {
    await delay(500);
    return {
      ok: true,
      message:
        "Preview only: the lead was not sent anywhere. In the extension it is stored locally or forwarded to the configured API.",
    };
  },
});

hud.mountLauncher();

async function open(): Promise<void> {
  const myRun = ++runId;
  const scanId = `demo-preview-${Date.now()}`;
  hud.openScanning(context);

  for (const step of SCAN_STEP_DEFS) {
    await delay(step.id === "capture" ? 140 : 230);
    if (myRun !== runId) return;
    const progress: ScanProgress = {
      scanId,
      stepId: step.id,
      percent: step.percent,
      message: step.message,
    };
    hud.updateProgress(progress);
  }

  await delay(280);
  if (myRun !== runId) return;
  hud.showResult(createDemoResult(context, scanId));
}

function stop(): void {
  runId += 1;
  hud.close();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

document.getElementById("openHud")?.addEventListener("click", () => {
  void open();
});

document.getElementById("replay")?.addEventListener("click", () => {
  stop();
  void open();
});

window.setTimeout(() => {
  if (!hud.isOpen()) void open();
}, 650);
