import { test } from "node:test";
import assert from "node:assert/strict";
import { api, call, ApiError } from "../src/api.ts";
import { texts } from "../src/text.ts";
const session = {
  mode: "local-dummy-preview",
  authenticated: true,
  csrf: "a".repeat(64),
  expiresAt: Date.now() + 30000,
  tenantId: "tenant",
  facilityId: "facility",
  actorId: "actor",
  role: "operator",
  canWrite: true,
};
const signal = () => new AbortController().signal;
function fake(t, fn) {
  const old = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => (globalThis.fetch = old));
}
const response = (value) => new Response(JSON.stringify(value));
test("uses cookie credentials and no-store, attaches CSRF only to writes, and never supplies bearer tokens", async (t) => {
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response(session);
  });
  await api.session(signal());
  await api.login("operator", session, signal());
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[1].options.headers["x-sterile-csrf"], session.csrf);
  assert.equal(calls[1].options.headers.authorization, undefined);
});
test("rejects malformed or oversized lists and cross-tenant/facility response data", async (t) => {
  let value = { items: [], page: 1, hasMore: false };
  fake(t, async () => response(value));
  for (const bad of [
    { items: [], page: 2, hasMore: false },
    { items: Array(51).fill({}), page: 1, hasMore: false },
    {
      items: [{ tenantId: "foreign", facilityId: "facility" }],
      page: 1,
      hasMore: false,
    },
    {
      items: [{ tenantId: "tenant", facilityId: "foreign" }],
      page: 1,
      hasMore: false,
    },
  ]) {
    value = bad;
    await assert.rejects(api.instruments(session, 1, signal()), {
      status: 503,
    });
  }
  value = { items: [], page: 1, hasMore: false };
  assert.equal((await api.instruments(session, 1, signal())).items.length, 0);
});
test("preserves explicit error codes without exposing arbitrary server text and supports cancellation", async (t) => {
  fake(
    t,
    async () =>
      new Response(JSON.stringify({ error: "CONFLICT", details: "PRIVATE" }), {
        status: 409,
      }),
  );
  await assert.rejects(
    call("/api/v1/sterile/test", signal()),
    (e) =>
      e instanceof ApiError &&
      e.status === 409 &&
      e.code === "CONFLICT" &&
      !e.message.includes("PRIVATE"),
  );
  fake(t, async () => new Response("private stack", { status: 503 }));
  await assert.rejects(call("/api/v1/sterile/test", signal()), {
    code: "SERVICE_UNAVAILABLE",
  });
  fake(t, async (_path, options) => {
    options.signal.throwIfAborted();
    return response({});
  });
  const c = new AbortController();
  c.abort();
  await assert.rejects(call("/preview/session", c.signal), {
    name: "AbortError",
  });
});
test("validates session metadata and provides complete Spanish, English and French screen labels", async (t) => {
  fake(t, async () => response({ ...session, mode: "untrusted" }));
  await assert.rejects(api.session(signal()), { status: 503 });
  const keys = Object.keys(texts.es).sort();
  for (const locale of Object.values(texts)) {
    assert.deepEqual(Object.keys(locale).sort(), keys);
    assert.ok(
      Object.values(locale).every((v) => typeof v === "string" && v.trim()),
    );
  }
});
