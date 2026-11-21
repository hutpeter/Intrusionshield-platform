import { validAccessView, type AccessView } from "./access-view";
import { useEffect, useRef, useState } from "react";
import { call, ApiError, type Session } from "./api";
import { accessText, permissionLabel } from "./access-text";
interface Event {
  version: number;
  recordedAt: string;
  reason: string;
}
export function AccessWorkspace({
  session,
  language,
  onExpired,
  onDirty,
  onBusy,
}: {
  session: Session;
  language: "en" | "es" | "fr";
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const t = accessText[language],
    [view, setView] = useState<AccessView | null>(null),
    [selected, setSelected] = useState(""),
    [nonce, setNonce] = useState(0),
    [editing, setEditing] = useState(false),
    [permissions, setPermissions] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [history, setHistory] = useState<Event[]>([]),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const user = view?.users.find((u) => u.actorId === selected);
  useEffect(() => {
    onDirty(editing);
    return () => onDirty(false);
  }, [editing, onDirty]);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const c = new AbortController();
    setView(null);
    setError(false);
    void call<AccessView>("/api/v1/sterile/access/users", c.signal)
      .then((v) => {
        if (!validAccessView(v, session.facilityId))
          throw new Error("Invalid response");
        if (!c.signal.aborted) setView(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(true);
        }
      });
    return () => c.abort();
  }, [session.facilityId, nonce, onExpired]);
  useEffect(() => {
    setHistory([]);
    if (!selected) return;
    const c = new AbortController();
    void call<{ events: Event[] }>(
      "/api/v1/sterile/access/users/" +
        encodeURIComponent(selected) +
        "/history",
      c.signal,
    )
      .then((v) => {
        if (!Array.isArray(v.events) || v.events.length > 1000)
          throw new Error("Invalid response");
        if (!c.signal.aborted) setHistory(v.events);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(true);
        }
      });
    return () => c.abort();
  }, [selected, nonce, onExpired]);
  const added = permissions.filter((p) => !user?.permissions.includes(p)),
    removed = user?.permissions.filter((p) => !permissions.includes(p)) ?? [];
  const changed =
    !!user &&
    (enabled !== user.capabilityEnabled || !!added.length || !!removed.length);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{session.facilityName}</p>
          <h1>{t.title}</h1>
          <p>{t.help}</p>
        </div>
        <button
          disabled={busy || editing}
          onClick={() => setNonce((n) => n + 1)}
        >
          {t.reload}
        </button>
      </div>
      {error && (
        <p role="alert" className="alert">
          {t.error}
        </p>
      )}
      {saved && (
        <p role="status" className="success">
          {t.saved}
        </p>
      )}
      <label>
        {t.user}
        <select
          disabled={busy || editing}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setSaved(false);
            setError(false);
          }}
        >
          <option value="">{t.choose}</option>
          {view?.users.map((u) => (
            <option key={u.actorId} value={u.actorId}>
              {u.displayName}
            </option>
          ))}
        </select>
      </label>
      {view && !view.users.length && <p>{t.noUsers}</p>}
      {user && (
        <article className="panel">
          <h2>{user.displayName}</h2>
          <p>
            {t.version}: {user.version}
          </p>
          {user.self && <p>{t.self}</p>}
          {(!user.accountActive || !user.personMapped) && <p>{t.inactive}</p>}
          {!editing ? (
            <>
              <p>
                {t.enabled}: {user.capabilityEnabled ? "✓" : "—"}
              </p>
              <ul>
                {user.permissions.map((p) => (
                  <li key={p}>{permissionLabel(p, language)}</li>
                ))}
              </ul>
              <button
                disabled={
                  busy || user.self || !user.accountActive || !user.personMapped
                }
                onClick={() => {
                  setPermissions([...user.permissions]);
                  setEnabled(user.capabilityEnabled);
                  setReason("");
                  setConfirmed(false);
                  setSaved(false);
                  setEditing(true);
                }}
              >
                {t.title}
              </button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!changed || !confirmed || !reason.trim() || pending.current)
                  return;
                const c = new AbortController();
                pending.current = c;
                setBusy(true);
                setError(false);
                try {
                  await call(
                    "/api/v1/sterile/access/users/" +
                      encodeURIComponent(user.actorId),
                    c.signal,
                    {
                      expectedVersion: user.version,
                      capabilityEnabled: enabled,
                      permissions,
                      reason,
                      confirmed: true,
                    },
                    session.csrf,
                  );
                  if (!c.signal.aborted) {
                    setEditing(false);
                    setSaved(true);
                    setNonce((n) => n + 1);
                  }
                } catch (e) {
                  if (!c.signal.aborted) {
                    if (e instanceof ApiError && e.status === 401) onExpired();
                    else setError(true);
                  }
                } finally {
                  pending.current = null;
                  if (!c.signal.aborted) setBusy(false);
                }
              }}
            >
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={busy}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                {t.enabled}
              </label>
              <fieldset disabled={busy}>
                <legend>{t.title}</legend>
                {view?.permissions.map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={permissions.includes(p)}
                      onChange={(e) =>
                        setPermissions((old) =>
                          e.target.checked
                            ? [...old, p]
                            : old.filter((x) => x !== p),
                        )
                      }
                    />
                    {permissionLabel(p, language)}
                  </label>
                ))}
              </fieldset>
              {permissions.includes("access:manage") && (
                <p className="alert">{t.grantAdmin}</p>
              )}
              <p>
                {t.add}:{" "}
                {added.length
                  ? added.map((p) => permissionLabel(p, language)).join("; ")
                  : t.none}
              </p>
              <p>
                {t.remove}:{" "}
                {removed.length
                  ? removed.map((p) => permissionLabel(p, language)).join("; ")
                  : t.none}
              </p>
              <label>
                {t.reason}
                <input
                  value={reason}
                  maxLength={400}
                  required
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t.confirm}
              </label>
              <div className="form-actions">
                <button
                  className="primary"
                  disabled={busy || !changed || !reason.trim() || !confirmed}
                >
                  {t.save}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError(false);
                  }}
                >
                  {t.cancel}
                </button>
              </div>
            </form>
          )}
          <details>
            <summary>{t.history}</summary>
            {history.map((e) => (
              <p key={e.version}>
                {t.version} {e.version} · {e.recordedAt} · {e.reason}
              </p>
            ))}
          </details>
        </article>
      )}
    </section>
  );
}
