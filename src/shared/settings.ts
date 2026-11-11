import type {
  Lead,
  ScanHistoryItem,
  Settings,
} from "./types";

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: "http://localhost:8787",
  apiToken: "",
  demoMode: true,
  autoOpen: false,
  maxScanHistory: 20,
};

export const STORAGE_KEYS = {
  settings: "settings",
  scanHistory: "scanHistory",
  leads: "leads",
} as const;

function normalizeSettings(input: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    apiBaseUrl: String(merged.apiBaseUrl ?? "").trim().replace(/\/+$/, ""),
    apiToken: String(merged.apiToken ?? "").trim(),
    demoMode: Boolean(merged.demoMode),
    autoOpen: Boolean(merged.autoOpen),
    maxScanHistory: Math.min(
      100,
      Math.max(1, Number(merged.maxScanHistory) || DEFAULT_SETTINGS.maxScanHistory),
    ),
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(stored[STORAGE_KEYS.settings] as Partial<Settings> | undefined);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.scanHistory);
  const value = stored[STORAGE_KEYS.scanHistory];
  return Array.isArray(value) ? (value as ScanHistoryItem[]) : [];
}

export async function addScanHistory(item: ScanHistoryItem): Promise<void> {
  const settings = await getSettings();
  const history = await getScanHistory();
  const next = [item, ...history.filter((entry) => entry.scanId !== item.scanId)].slice(
    0,
    settings.maxScanHistory,
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.scanHistory]: next });
}

export async function clearScanHistory(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.scanHistory]: [] });
}

export async function getLeads(): Promise<Lead[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.leads);
  const value = stored[STORAGE_KEYS.leads];
  return Array.isArray(value) ? (value as Lead[]) : [];
}

export async function addLead(lead: Lead): Promise<void> {
  const leads = await getLeads();
  const next = [lead, ...leads].slice(0, 200);
  await chrome.storage.local.set({ [STORAGE_KEYS.leads]: next });
}

export async function clearLeads(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.leads]: [] });
}

export async function clearAllLocalData(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.scanHistory, STORAGE_KEYS.leads]);
}
