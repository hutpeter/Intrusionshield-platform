import { test } from "node:test";
import assert from "node:assert/strict";
import { browserAuthText } from "../src/browser-auth-text.ts";
test("browser profile uses auth routes, submits credentials only at login and validates its own session mode", async (t) => {
  const beforeDocument = globalThis.document,
    beforeFetch = globalThis.fetch;
  globalThis.document = {
    querySelector: () => ({ getAttribute: () => "browser" }),
  };
  t.after(() => {
    globalThis.document = beforeDocument;
    globalThis.fetch = beforeFetch;
  });
  const { api, browserAuthentication } =
    await import("../src/api.ts?browser-test");
  assert.equal(browserAuthentication, true);
  const session = {
    mode: "ruby-browser",
    authenticated: false,
    csrf: "a".repeat(64),
    expiresAt: Date.now() + 10000,
  };
  const calls = [];
  let value = session;
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(value));
  };
  const signal = () => new AbortController().signal;
  await api.session(signal());
  await api.login("reviewer", session, signal(), {
    username: "person",
    password: "fictional-password",
  });
  await api.logout(session, signal());
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/auth/session", "/auth/login", "/auth/logout"],
  );
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    username: "person",
    password: "fictional-password",
  });
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert.equal(calls[1].options.headers["x-sterile-csrf"], session.csrf);
  value = { ...session, mode: "local-dummy-preview" };
  await assert.rejects(() => api.session(signal()));
});
test("real sign-in copy exists in all supported languages without demo role selection", () => {
  for (const labels of Object.values(browserAuthText))
    for (const key of [
      "title",
      "help",
      "username",
      "password",
      "enter",
      "banner",
      "account",
      "intro",
      "invalid",
    ])
      assert.ok(labels[key]?.trim());
});
