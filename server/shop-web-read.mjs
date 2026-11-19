import { publicShopUrl } from "./public-shop-url.mjs";
export { publicShopUrl } from "./public-shop-url.mjs";
import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";

const denied = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  denied.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
])
  denied.addSubnet(ip, bits, "ipv6");

export function isPublicAddress(ip) {
  if (isIP(ip) === 4) return !denied.check(ip, "ipv4");
  return isIP(ip) === 6 && /^[23]/i.test(ip) && !denied.check(ip, "ipv6");
}

async function resolvePublic(host, signal) {
  let addresses = await lookup(host, { all: true });
  // Some local VPNs synthesize RFC 2544 addresses for all public DNS replies.
  // Resolve the real A records and pin one; never connect to the synthetic IP.
  if (addresses.length && addresses.every((row) => /^198\.(?:18|19)\./.test(row.address))) {
    const url = new URL("https://dns.google/resolve");
    url.search = new URLSearchParams({ name: host, type: "A" }).toString();
    const res = await fetch(url, { redirect: "error", signal });
    if (!res.ok) throw new Error("DNS unavailable");
    const answer = await res.json();
    addresses = (answer.Answer ?? [])
      .filter((row) => row.type === 1)
      .map((row) => ({ address: row.data, family: 4 }));
  }
  signal.throwIfAborted();
  if (!addresses.length || !addresses.every((row) => isPublicAddress(row.address)))
    throw new Error("Unsupported store address");
  return addresses.find((row) => row.family === 4) ?? addresses[0];
}

async function readOne(url, signal) {
  const addr = await resolvePublic(url.hostname, signal);
  return new Promise((resolve, reject) => {
    // TLS still verifies the original hostname. No second DNS resolution occurs.
    const req = get(
      url,
      {
        signal,
        agent: false,
        family: addr.family,
        autoSelectFamily: false,
        lookup: (_host, options, cb) => (options.all ? cb(null, [addr]) : cb(null, addr.address, addr.family)),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OnionHead/1.0; public product price check)",
          Accept:
            "text/html, application/xhtml+xml, application/json, application/rss+xml, application/xml, text/xml",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.destroy();
          resolve({ location: res.headers.location, status });
          return;
        }
        const type = String(res.headers["content-type"] ?? "").toLowerCase();
        if (
          status !== 200 ||
          !/(?:html|json|xml)/.test(type) ||
          Number(res.headers["content-length"]) > 3 * 1024 * 1024
        ) {
          res.destroy();
          reject(new Error("Public source unavailable"));
          return;
        }
        const chunks = [];
        let length = 0;
        res.on("data", (chunk) => {
          length += chunk.length;
          if (length > 3 * 1024 * 1024) {
            res.destroy(new Error("Page too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => resolve({ url: url.href, text: Buffer.concat(chunks).toString("utf8"), type }));
      },
    );
    req.on("error", reject);
  });
}

export async function readPublicShopPage(raw, { signal } = {}) {
  let url = publicShopUrl(raw);
  const timeout = AbortSignal.timeout(7000);
  const budget = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let redirects = 0; url && redirects <= 3; redirects++) {
    const page = await readOne(url, budget);
    if (page.text !== undefined) return page;
    url = publicShopUrl(page.location, url.href);
  }
  throw new Error("Unsupported public store link");
}
