import { publicUrl, shoppingDestination, tiktokListing } from "../shared/shopping-links";

export interface JobSelection { productId: string; skuId: string }
export interface JobInput { url?: string; query?: string; market: string; selection?: JobSelection }
export interface JobSnapshot<R> {
  id: string; status: "queued" | "running" | "ready" | "failed"; stage?: string; input?: JobInput;
  report?: R; error?: string; retryAfterMs?: number; retryable?: boolean;
}

export function tikTokCheckRoute(value: string, creatorOnly = false) {
  let raw = value.trim();
  if (creatorOnly && /^[a-z0-9_][\w.]{0,23}$/i.test(raw) && !raw.endsWith(".")) raw = "@" + raw;
  const dest = shoppingDestination(raw);
  if (dest?.startsWith("#shop/profile?")) return dest;
  if (creatorOnly) return null;
  if (dest?.startsWith("#shop/video?")) return dest;
  const url = publicUrl(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  if (url && tiktokListing(url)) return "#shop/site?" + new URLSearchParams({url:url.href});
  return null;
}

export function withJob(route: string, market: string, id?: string) {
  const [path, query] = route.split("?");
  const params = new URLSearchParams(query);
  if (market === "GB") params.set("market", "GB"); else params.delete("market");
  if (id) params.set("job", id); else params.delete("job");
  return path + "?" + params.toString();
}

export function rememberJob(route: string) {
  try { sessionStorage.setItem("onion-head:last-shopping-job", route); } catch { /* The address itself always identifies the check. */ }
}
export function lastShoppingJob() {
  try {
    const route = sessionStorage.getItem("onion-head:last-shopping-job");
    if (route && route.length <= 4096 && /^#shop\/(?:profile|video|site)\?/.test(route) && new URLSearchParams(route.split("?")[1]).has("job")) return route;
  } catch { /* Storage may be restricted. */ }
  return null;
}

export class JobRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function validJobId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

async function jobRequest<R>(body: JobInput, id: string | undefined, signal: AbortSignal) {
  const options: RequestInit = { signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store" };
  if (!id) Object.assign(options, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await fetch(id ? "/api/shopping-jobs/" + encodeURIComponent(id) : "/api/shopping-jobs", options);
  const row = await response.json();
  if (!response.ok) throw new JobRequestError(typeof row.error === "string" ? row.error : "The shopping check is unavailable.", response.status);
  if (!validJobId(row.id) || !["queued","running","ready","failed"].includes(row.status)) throw new JobRequestError("The server returned an unreadable job status.", 502);
  return row as JobSnapshot<R>;
}

function delay(ms: number, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Submit once. Polling, reconnection and reopened reports use the same read-only resource. */
export async function followJob<R>(body: JobInput, id: string | undefined, signal: AbortSignal,
  onUpdate: (snapshot: JobSnapshot<R>) => void, onReconnect: () => void) {
  if (id && !validJobId(id)) throw new JobRequestError("This saved check address is incomplete.", 404);
  let failures = 0;
  for (;;) {
    signal.throwIfAborted();
    let snapshot: JobSnapshot<R>;
    try {
      snapshot = await jobRequest<R>(body, id, signal);
    } catch (error) {
      signal.throwIfAborted();
      if (!id || ++failures > 3 || (error instanceof JobRequestError && error.status < 500 && error.status !== 429)) throw error;
      onReconnect();
      await delay(failures * 1000, signal);
      continue;
    }
    signal.throwIfAborted();
    failures = 0;
    onUpdate(snapshot);
    if (snapshot.status === "failed" || snapshot.status === "ready") return snapshot;
    id = snapshot.id;
    await delay(snapshot.status === "queued" ? 1100 : 1600, signal);
  }
}
