export function delay(milliseconds, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
