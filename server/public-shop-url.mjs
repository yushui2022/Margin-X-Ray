export function publicShopUrl(raw, base) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  const u = URL.parse(raw, base);
  if (
    !u ||
    u.protocol !== "https:" ||
    u.port ||
    u.username ||
    u.password ||
    !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(u.hostname) ||
    /\.(?:internal|localhost|local|test|invalid|home|lan|onion|arpa|example)$/i.test(u.hostname)
  )
    return null;
  u.hash = "";
  return u;
}
