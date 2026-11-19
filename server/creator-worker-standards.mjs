// The TikHub libraries use recent web standards. Older Workers compatibility
// dates expose the same primitives without these convenience methods.
export function ensureWorkerStandards() {
  if (!URL.parse) Object.defineProperty(URL, "parse", { value(input, base) {
    try { return new URL(input, base); } catch { return null; }
  } });
  if (!AbortSignal.timeout) Object.defineProperty(AbortSignal, "timeout", { value(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), ms);
    return controller.signal;
  } });
  if (!AbortSignal.any) Object.defineProperty(AbortSignal, "any", { value(signals) {
    const controller = new AbortController();
    const stopped = signals.find(s => s.aborted);
    if (stopped) controller.abort(stopped.reason);
    else {
      const abort = evt => {
        for (const s of signals) s.removeEventListener("abort", abort);
        controller.abort(evt.target.reason);
      };
      for (const s of signals) s.addEventListener("abort", abort, { once: true });
    }
    return controller.signal;
  } });
  if (!AbortSignal.prototype.throwIfAborted) Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
    value() { if (this.aborted) throw this.reason || new DOMException("Aborted", "AbortError"); },
  });
}

export async function edgeTikHubFetch(url, options) {
  if (url.origin !== "https://api.tikhub.io") throw new Error("Unknown TikHub origin");
  // workerd supports manual and follow. Reject redirects before reading and
  // never forward the provider credential to a location supplied upstream.
  const response = await fetch(url, { ...options, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("TikHub returned a redirect");
  }
  return response;
}
