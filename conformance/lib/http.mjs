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
  const res = await fetch(cfg.baseUrl + path, { method, headers: h, body: payload, redirect: "manual" });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}
