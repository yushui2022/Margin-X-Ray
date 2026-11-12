import type {
  ApiTestResult,
  Lead,
  LeadInput,
  ScanError,
  ScanProgress,
  ScanRequest,
  ScanResult,
  Settings,
} from "./types";

export type RuntimeMessage =
  | { type: "SCAN_REQUEST"; request: ScanRequest }
  | { type: "SCAN_PROGRESS"; progress: ScanProgress }
  | { type: "SCAN_COMPLETE"; result: ScanResult }
  | { type: "SCAN_ERROR"; scanId: string; error: ScanError }
  | { type: "SCAN_CANCEL"; scanId: string }
  | { type: "OPEN_HUD" }
  | { type: "CAPTURE_AND_SCAN" }
  | { type: "CAPTURE_VISIBLE_TAB" }
  | { type: "OPEN_OPTIONS" }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; settings: Partial<Settings> }
  | { type: "TEST_API"; settings?: Partial<Settings> }
  | { type: "SAVE_LEAD"; lead: LeadInput; result: ScanResult }
  | { type: "CLEAR_DATA" };

export type RuntimeResponse =
  | {
      ok: true;
      settings?: Settings;
      apiTest?: ApiTestResult;
      lead?: Lead;
      captureDataUrl?: string;
    }
  | { ok: false; error: ScanError };

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
