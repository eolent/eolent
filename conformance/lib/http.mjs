// A small HTTP client for the conformance tests.

export async function request(cfg, { method = "GET", path, principal, headers = {}, body, rawBody }) {
  const h = { accept: "application/json, application/problem+json", ...headers };
  if (principal) h.authorization = `Bearer ${cfg.tokens[principal]}`;
  let payload;
  if (rawBody !== undefined) {
    payload = rawBody;
    h["content-type"] ??= "application/json";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h["content-type"] ??= "application/json";
  }
  const res = await fetch(cfg.baseUrl + path, { method, headers: h, body: payload, redirect: "manual", signal: AbortSignal.timeout(cfg.timeoutMs) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}

// Returns every item of a list by following nextCursor (at most maxPages pages).
export async function listAll(cfg, path, principal, { maxPages = 100 } = {}) {
  const items = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const q = `${path}${sep}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await request(cfg, { path: q, principal });
    if (res.status !== 200 || !Array.isArray(res.json?.items)) return { res, items };
    items.push(...res.json.items);
    cursor = res.json.nextCursor;
    if (!cursor) return { res, items };
  }
  return { res: undefined, items, truncated: true };
}
