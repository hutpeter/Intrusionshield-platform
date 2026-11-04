import { useState, useEffect, useRef } from "react";
import type {
  ReturnRecord,
  ReturnSummary,
  DistributionSummary,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { returnLabels } from "./return-text";
const empty = () => ({
  code: "",
  distributionId: "",
  condition: "used" as ReturnRecord["condition"],
  location: "",
  custodian: "",
  reference: "",
  note: "",
  contentsChecked: false,
  confirmed: false,
  action: "quarantine" as "quarantine" | "reprocess",
  reason: "",
  episodeCode: "",
});
export function ReturnWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const t = labels(language),
    p = returnLabels(language),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<ReturnSummary> | null>(null),
    [detail, setDetail] = useState<ReturnRecord | null>(null),
    [past, setPast] = useState<ReturnRecord | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [sources, setSources] = useState<DistributionSummary[]>([]),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [form, setForm] = useState<{
      kind: "create" | "dispose";
      requestId: string;
      version: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    exampleKey = useRef(crypto.randomUUID()),
    busy = blocked || saving;
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  function failed(e: unknown) {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  }
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    setPast(null);
    setRows(null);
    setHistory(null);
    void (async () => {
      try {
        if (selected) {
          const [r, h] = await Promise.all([
            api.returned(session, selected, ac.signal),
            api.returnHistory(session, selected, historyPage, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setDetail(r);
            setHistory(h);
          }
        } else {
          const [r, s] = await Promise.all([
            api.returns(session, page, ac.signal),
            api.allDistribution(session, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setRows(r);
            setSources(s.filter((x) => x.state === "issued" && !x.returned));
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) failed(e);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  function clear() {
    setForm(null);
    setFields(empty());
    setDiscard(null);
  }
  function guard(action: () => void) {
    if (busy) return;
    if (form)
      setDiscard(() => () => {
        clear();
        action();
      });
    else {
      clear();
      action();
    }
  }
  function begin(kind: "create" | "dispose") {
    guard(() => {
      setPast(null);
      setNotice(false);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version ?? 0,
      });
      setFields(empty());
    });
  }
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({ ...x, ...v }));
  async function example() {
    if (busy || form) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    setNotice(false);
    try {
      const d = await api.returnExample(session, exampleKey.current, ac.signal);
      if (ac.signal.aborted) return;
      setSources((x) => [d, ...x.filter((r) => r.id !== d.id)]);
      setFields({
        ...empty(),
        code: "RETURN-DEMO-" + crypto.randomUUID().toUpperCase(),
        distributionId: d.id,
        location: "DEMO-RETURN-QUARANTINE",
        custodian: "DEMO-RETURNER",
        reference: "SIMULATED-RETURN",
        note: "Fictional return demonstration only",
      });
      setForm({ kind: "create", requestId: crypto.randomUUID(), version: 0 });
      exampleKey.current = crypto.randomUUID();
    } catch (e) {
      if (!ac.signal.aborted) failed(e);
    } finally {
      if (!ac.signal.aborted) setSaving(false);
    }
  }
  async function save() {
    if (!form || busy || !fields.confirmed) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      let r: ReturnRecord;
      if (form.kind === "create") {
        if (!session.canReturn || !fields.contentsChecked) return;
        const d = sources.find((x) => x.id === fields.distributionId);
        if (!d) return;
        r = await api.createReturn(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            distributionId: d.id,
            distributionVersion: d.version,
            condition: fields.condition,
            location: fields.location,
            custodian: fields.custodian,
            reference: fields.reference,
            note: fields.note,
            contentsChecked: true,
            confirmed: true,
          },
          ac.signal,
        );
      } else {
        if (!session.canDisposeReturn || !selected) return;
        r = await api.disposeReturn(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            action: fields.action,
            reason: fields.reason,
            reference: fields.reference,
            episodeCode:
              fields.action === "reprocess" ? fields.episodeCode : "",
            confirmed: true,
          },
          ac.signal,
        );
      }
      if (ac.signal.aborted) return;
      clear();
      setSelected(r.id);
      setHistoryPage(1);
      setNotice(true);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!ac.signal.aborted) failed(e);
    } finally {
      if (!ac.signal.aborted) setSaving(false);
    }
  }
  async function version(n: number) {
    if (!selected || busy || form) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const r = await api.returned(session, selected, ac.signal, n);
      if (!ac.signal.aborted) setPast(r);
    } catch (e) {
      if (!ac.signal.aborted) failed(e);
    } finally {
      if (!ac.signal.aborted) setSaving(false);
    }
  }
  const date = (at: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  const r = past ?? detail,
    actor = (id: string) =>
      session.actors?.[id] === "reviewer"
        ? t.reviewer
        : session.actors?.[id] === "operator"
          ? t.operator
          : id;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>{selected ? (detail?.code ?? p.title) : p.title}</h1>
          <p>{p.intro}</p>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || loading}
            onClick={() =>
              guard(() => {
                setNotice(false);
                if (selected) setSelected(null);
                else setNonce((n) => n + 1);
              })
            }
          >
            {selected ? p.back : t.reload}
          </button>
          {session.canReturn && !selected && (
            <button
              className="primary"
              disabled={busy || loading || !!form}
              onClick={() => begin("create")}
            >
              {p.create}
            </button>
          )}
        </div>
      </div>
      <p className="readonly-note">{p.boundary}</p>
      <small>{p.roles}</small>
      {session.canReturn &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <section className="demo-example">
            <button disabled={busy || loading} onClick={() => void example()}>
              {p.example}
            </button>
          </section>
        )}
      {notice && (
        <p role="status" className="success">
          {p.saved}
        </p>
      )}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof typeof t]
            : t.error}
        </p>
      )}
      {discard && (
        <section className="discard" role="alertdialog" aria-label={t.discard}>
          <p>{t.discard}</p>
          <button className="danger" onClick={() => discard()}>
            {t.discardYes}
          </button>
          <button onClick={() => setDiscard(null)}>{t.keep}</button>
        </section>
      )}
      {form && (
        <form
          className="panel edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h2>{form.kind === "create" ? p.create : p.dispose}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {form.kind === "create" ? (
                <>
                  <label>
                    {p.code}
                    <input
                      required
                      maxLength={100}
                      value={fields.code}
                      onChange={(e) => patch({ code: e.target.value })}
                    />
                  </label>
                  <label>
                    {p.source}
                    <select
                      required
                      aria-label={p.source}
                      value={fields.distributionId}
                      onChange={(e) =>
                        patch({ distributionId: e.target.value })
                      }
                    >
                      <option value="">—</option>
                      {sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.packageCode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {p.condition}
                    <select
                      aria-label={p.condition}
                      value={fields.condition}
                      onChange={(e) =>
                        patch({
                          condition: e.target
                            .value as ReturnRecord["condition"],
                        })
                      }
                    >
                      {(["unopened", "opened", "used", "damaged"] as const).map(
                        (v) => (
                          <option key={v} value={v}>
                            {p[v]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {(
                    ["location", "custodian", "reference", "note"] as const
                  ).map((k) => (
                    <label key={k}>
                      {p[k]}
                      <input
                        required={k !== "note"}
                        maxLength={k === "note" ? 500 : 200}
                        value={fields[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                </>
              ) : (
                <>
                  <p>{p.reprocessHelp}</p>
                  <label>
                    {p.action}
                    <select
                      aria-label={p.action}
                      value={fields.action}
                      onChange={(e) =>
                        patch({
                          action: e.target.value as "quarantine" | "reprocess",
                        })
                      }
                    >
                      <option value="quarantine">{p.quarantine}</option>
                      <option
                        value="reprocess"
                        disabled={detail?.condition === "damaged"}
                      >
                        {p.reprocess}
                      </option>
                    </select>
                  </label>
                  {(["reason", "reference"] as const).map((k) => (
                    <label key={k}>
                      {p[k]}
                      <input
                        required
                        maxLength={k === "reason" ? 500 : 200}
                        value={fields[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  {fields.action === "reprocess" && (
                    <label>
                      {p.episodeCode}
                      <input
                        required
                        maxLength={100}
                        value={fields.episodeCode}
                        onChange={(e) => patch({ episodeCode: e.target.value })}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
            {form.kind === "create" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={fields.contentsChecked}
                  onChange={(e) => patch({ contentsChecked: e.target.checked })}
                />
                {p.contents}
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {form.kind === "create" ? p.confirm : p.confirmDisposition}
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                !fields.confirmed ||
                (form.kind === "create" && !fields.contentsChecked)
              }
            >
              {saving
                ? t.saving
                : form.kind === "create"
                  ? p.save
                  : p.saveDisposition}
            </button>
          </fieldset>
        </form>
      )}
      {loading && <p role="status">{t.loading}</p>}
      {!form && r && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <span className="badge">{p[r.state]}</span>
              {session.canDisposeReturn && !past && r.state === "returned" && (
                <button disabled={busy} onClick={() => begin("dispose")}>
                  {p.dispose}
                </button>
              )}
              {past && (
                <button disabled={busy} onClick={() => setPast(null)}>
                  {p.current}
                </button>
              )}
            </div>
            {past && <p>{p.historical}</p>}
            <h2>{r.packageCode}</h2>
            <dl className="details-grid">
              {(
                [
                  ["condition", p[r.condition]],
                  ["location", r.location],
                  ["custodian", r.custodian],
                  ["reference", r.reference],
                  ["note", r.note],
                  ["version", r.version],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt>{p[k]}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <p>
              {actor(r.receivedBy)} · {date(r.createdAt)}
            </p>
            {r.disposition && (
              <p>
                {p.action}: {p[r.disposition.action]} · {r.disposition.reason} ·{" "}
                {r.disposition.reference} · {actor(r.disposition.actorId)}
              </p>
            )}
            {r.episodeId && (
              <>
                <h3>{p.episode}</h3>
                <p>{r.episodeCode}</p>
                <p>{p.link}</p>
              </>
            )}
          </section>
          <section className="panel">
            <h2>{p.origin}</h2>
            <dl className="details-grid">
              <div>
                <dt>{p.source}</dt>
                <dd>
                  {r.issue.packageCode} · {r.issue.packageVersion}
                </dd>
              </div>
              <div>
                <dt>{t.version}</dt>
                <dd>
                  {r.issue.id} · {r.issue.version}
                </dd>
              </div>
              <div>
                <dt>{p.recipient}</dt>
                <dd>{r.issue.recipient}</dd>
              </div>
              <div>
                <dt>{p.destination}</dt>
                <dd>{r.issue.destination}</dd>
              </div>
            </dl>
            <p>
              {p.load}: {r.issue.loadCode} · {p.review}: {r.issue.reviewId}
            </p>
          </section>
          <section className="panel">
            <h2>{p.history}</h2>
            {history?.items.map((e) => (
              <p key={e.id}>
                {e.action === "package-returned" ? p.create : p.dispose} ·{" "}
                {actor(e.actorId)} · {date(e.at)} · {p.version} {e.version}{" "}
                <button disabled={busy} onClick={() => void version(e.version)}>
                  {p.version} {e.version}
                </button>
              </p>
            ))}
            <div className="pagination">
              <button
                disabled={busy || historyPage === 1}
                onClick={() => setHistoryPage((n) => n - 1)}
              >
                {t.previous}
              </button>
              <span>
                {t.page} {historyPage}
              </span>
              <button
                disabled={busy || !history?.hasMore}
                onClick={() => setHistoryPage((n) => n + 1)}
              >
                {t.next}
              </button>
            </div>
          </section>
        </>
      )}
      {!form && !selected && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{p.code}</th>
                  <th>{p.source}</th>
                  <th>{p.condition}</th>
                  <th>{p.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          guard(() => {
                            setSelected(x.id);
                            setHistoryPage(1);
                            setNotice(false);
                          })
                        }
                      >
                        {x.code}
                      </button>
                    </td>
                    <td>{x.packageCode}</td>
                    <td>{p[x.condition]}</td>
                    <td>{p[x.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.items.length && <p>{p.empty}</p>}
          </div>
          <div className="pagination">
            <button
              disabled={busy || page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              {t.previous}
            </button>
            <span>
              {t.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              {t.next}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
