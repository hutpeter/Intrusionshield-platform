import { useState, type FormEvent } from "react";
export function AccountSetupScreen({ token }: { token: string }) {
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || password !== repeat) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/admin/accounts/complete-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!r.ok)
        throw Error(
          r.status === 429
            ? "Too many attempts. Try again later."
            : r.status === 503
              ? "Password setup is temporarily unavailable."
              : "This setup link is invalid, expired or already used. Ask your administrator for a new link.",
        );
      setPassword("");
      setRepeat("");
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "1rem" }}>
      <h1>Set your Ruby password</h1>
      {done ? (
        <>
          <p role="status">
            Your password is set. You can now sign in with the client identifier
            and username supplied by your administrator.
          </p>
          <a href={window.location.pathname}>Go to sign-in</a>
        </>
      ) : (
        <form onSubmit={submit}>
          <p>
            Choose a private password of 12–128 characters. This link can be
            used once.
          </p>
          {error && <p role="alert">{error}</p>}
          <fieldset disabled={busy}>
            <label>
              New password{" "}
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm password{" "}
              <input
                type="password"
                required
                autoComplete="new-password"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
              />
            </label>
            {repeat && password !== repeat && <p>Passwords do not match.</p>}
            <button disabled={!password || password !== repeat}>
              {busy ? "Saving…" : "Set password"}
            </button>
          </fieldset>
        </form>
      )}
    </main>
  );
}
export function takeAccountSetupToken(): string | null {
  const match = /^#account-setup=([A-Za-z0-9_-]{43})$/.exec(
    window.location.hash,
  );
  if (!match) return null;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  return match[1];
}
