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

// Polls until fn returns a truthy value or the audit wait time (EOLENT_AUDIT_WAIT_MS) has passed.
export async function waitFor(cfg, fn, { intervalMs = 200 } = {}) {
  const deadline = Date.now() + cfg.auditWaitMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() >= deadline) return undefined;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// A W3C traceparent header with a fresh trace id, and that trace id.
export function newTrace() {
  const traceId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { traceId, header: `00-${traceId}-00f067aa0ba902b7-01` };
}
