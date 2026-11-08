import { useState, useEffect, useRef } from "react";
import type {
  ProcedureRevision,
  ProcedureDraftInput,
  ProcedureStage,
  InstrumentType,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { procedureLabels } from "./procedure-text";
const empty = () => ({
  code: "",
  title: "",
  stage: "cleaning" as ProcedureStage,
  method: "manual",
  instructions: "",
  source: "",
  instrumentTypeIds: [] as string[],
});
const methods = {
  cleaning: ["manual", "mechanical"],
  inspection: ["inspection"],
  sterilization: ["steam", "low_temperature", "other"],
};
export function ProcedureWorkspace({
  session,
  language,
  blocked,
  onBusy,
  onDirty,
  onExpired,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  onExpired: () => void;
}) {
  const t = procedureLabels(language),
    c = labels(language),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<ProcedureRevision> | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [detail, setDetail] = useState<ProcedureRevision | null>(null),
    [page, setPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [form, setForm] = useState<{
      kind: "draft" | "publish" | "withdraw";
      requestId: string;
      version: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [types, setTypes] = useState<InstrumentType[]>([]),
    pending = useRef<AbortController | null>(null),
    exampleKey = useRef(crypto.randomUUID());
  const busy = blocked || saving;
  const failed = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onExpired();
    else setError(e);
  };
  useEffect(() => {
    onDirty(!!form);
    return () => onDirty(false);
  }, [form, onDirty]);
  useEffect(() => {
    onBusy(saving);
    return () => onBusy(false);
  }, [saving, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    setRows(null);
    void (async () => {
      try {
        const types = await api.allTypes(session, a.signal);
        if (!a.signal.aborted) setTypes(types);
        if (selected) {
          const [r, h] = await Promise.all([
            api.procedure(session, selected, a.signal),
            api.procedureHistory(session, selected, 1, a.signal),
          ]);
          if (!a.signal.aborted) {
            setDetail(r);
            setHistory(h);
          }
        } else {
          const r = await api.procedures(session, page, a.signal);
          if (!a.signal.aborted) setRows(r);
        }
      } catch (e) {
        if (!a.signal.aborted) failed(e);
      } finally {
        if (!a.signal.aborted) setLoading(false);
      }
    })();
    return () => a.abort();
  }, [session, selected, page, nonce, onExpired]);
  function begin(kind: "draft" | "publish" | "withdraw") {
    if (busy || loading) return;
    setConfirmed(false);
    setNotice(false);
    setReason(
      detail?.code.startsWith("PROC-DEMO-")
        ? "SIMULATED reviewer decision — fictional data only"
        : "",
    );
    setFields(
      detail
        ? {
            code: detail.code,
            title: detail.title,
            stage: detail.stage,
            method: detail.method,
            instructions: detail.instructions,
            source: detail.source,
            instrumentTypeIds: detail.instrumentTypeIds,
          }
        : empty(),
    );
    setForm({
      kind,
      requestId: crypto.randomUUID(),
      version: detail?.version ?? 0,
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy || !confirmed) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      const r =
        form.kind === "draft"
          ? await api.draftProcedure(
              session,
              {
                ...fields,
                requestId: form.requestId,
                confirmed: true,
              } satisfies ProcedureDraftInput,
              a.signal,
            )
          : await api.transitionProcedure(
              session,
              selected!,
              form.kind,
              {
                requestId: form.requestId,
                version: form.version,
                reason,
                confirmed: true,
              },
              a.signal,
            );
      if (!a.signal.aborted) {
        setForm(null);
        setSelected(r.id);
        setNotice(true);
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!a.signal.aborted) failed(e);
    } finally {
      if (!a.signal.aborted) setSaving(false);
    }
  }
  async function example() {
    if (busy || form) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    try {
      const r = await api.procedureExample(
        session,
        exampleKey.current,
        a.signal,
      );
      if (!a.signal.aborted) {
        setSelected(r.revision.id);
        setNonce((n) => n + 1);
        exampleKey.current = crypto.randomUUID();
      }
    } catch (e) {
      if (!a.signal.aborted) failed(e);
    } finally {
      if (!a.signal.aborted) setSaving(false);
    }
  }
  const date = (d: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(d));
  const status = (r: ProcedureRevision) =>
    r.state === "draft" ? t.draftState : t[r.state];
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{session.facilityName}</p>
          <h1>{t.title}</h1>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || !!form || loading}
            onClick={() => {
              setSelected(null);
              setNotice(false);
              setNonce((n) => n + 1);
            }}
          >
            {selected ? t.back : c.reload}
          </button>
          {(session.canWrite || session.canReview) && !form && (
            <button disabled={busy || loading} onClick={() => begin("draft")}>
              {t.draft}
            </button>
          )}
        </div>
      </div>
      <p className="readonly-note">{t.help}</p>
      {session.canReview &&
        session.mode === "local-dummy-preview" &&
        !selected &&
        !form && (
          <button disabled={busy || loading} onClick={() => void example()}>
            {t.example}
          </button>
        )}
      {notice && (
        <p className="success" role="status">
          {t.saved}
        </p>
      )}
      {!!error && (
        <p className="alert" role="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {form && (
        <form className="panel edit-panel" onSubmit={save}>
          <div className="panel-heading">
            <h2>{t[form.kind]}</h2>
            <button type="button" disabled={busy} onClick={() => setForm(null)}>
              {c.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            <p>{t.newRevision}</p>
            {form.kind === "draft" ? (
              <>
                <div className="form-grid">
                  {(["code", "title", "source"] as const).map((k) => (
                    <label key={k}>
                      {k === "title" ? t.name : t[k]}
                      <input
                        required
                        maxLength={
                          k === "code" ? 100 : k === "source" ? 500 : 200
                        }
                        value={fields[k]}
                        onChange={(e) => {
                          setFields((f) => ({ ...f, [k]: e.target.value }));
                          setConfirmed(false);
                        }}
                      />
                    </label>
                  ))}
                  <label>
                    {t.stage}
                    <select
                      value={fields.stage}
                      onChange={(e) => {
                        const stage = e.target.value as ProcedureStage;
                        setFields((f) => ({
                          ...f,
                          stage,
                          method: methods[stage][0],
                        }));
                        setConfirmed(false);
                      }}
                    >
                      {(
                        ["cleaning", "inspection", "sterilization"] as const
                      ).map((s) => (
                        <option key={s} value={s}>
                          {t[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.method}
                    <select
                      value={fields.method}
                      onChange={(e) => {
                        setFields((f) => ({ ...f, method: e.target.value }));
                        setConfirmed(false);
                      }}
                    >
                      {methods[fields.stage].map((m) => (
                        <option key={m} value={m}>
                          {m === "manual"
                            ? t.manualMethod
                            : (t[m as keyof typeof t] ?? m)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  {t.instructions}
                  <textarea
                    required
                    maxLength={16000}
                    rows={8}
                    value={fields.instructions}
                    onChange={(e) => {
                      setFields((f) => ({
                        ...f,
                        instructions: e.target.value,
                      }));
                      setConfirmed(false);
                    }}
                  />
                </label>
                <h3>{t.types}</h3>
                {types.map((type) => (
                  <label className="check" key={type.id}>
                    <input
                      type="checkbox"
                      checked={fields.instrumentTypeIds.includes(type.id)}
                      onChange={(e) => {
                        setFields((f) => ({
                          ...f,
                          instrumentTypeIds: e.target.checked
                            ? [...f.instrumentTypeIds, type.id]
                            : f.instrumentTypeIds.filter(
                                (id) => id !== type.id,
                              ),
                        }));
                        setConfirmed(false);
                      }}
                    />
                    {type.name} · {type.code}
                  </label>
                ))}
              </>
            ) : (
              <label>
                {t.reason}
                <input
                  required
                  maxLength={500}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setConfirmed(false);
                  }}
                />
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t.confirm}
            </label>
            <button
              className="primary"
              disabled={
                busy ||
                !confirmed ||
                (form.kind === "draft" && !fields.instrumentTypeIds.length)
              }
            >
              {saving
                ? c.saving
                : form.kind === "draft"
                  ? t.save
                  : t[form.kind]}
            </button>
          </fieldset>
        </form>
      )}
      {loading && <p role="status">{c.loading}</p>}
      {!form && detail && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {detail.code} · {t.revision} {detail.revision}
            </h2>
            <span className="badge">{status(detail)}</span>
            {session.canReview && detail.state !== "withdrawn" && (
              <button
                disabled={busy}
                onClick={() =>
                  begin(detail.state === "draft" ? "publish" : "withdraw")
                }
              >
                {detail.state === "draft" ? t.publish : t.withdraw}
              </button>
            )}
          </div>
          <p>
            {detail.title} · {t[detail.stage]} ·{" "}
            {detail.method === "manual"
              ? t.manualMethod
              : (t[detail.method as keyof typeof t] ?? detail.method)}
          </p>
          <p>
            {t.source}: {detail.source}
          </p>
          <h3>{t.types}</h3>
          <ul>
            {detail.instrumentTypeIds.map((id) => (
              <li key={id}>
                {types.find((type) => type.id === id)?.name ?? id}
              </li>
            ))}
          </ul>
          <h3>{t.instructions}</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
            {detail.instructions}
          </pre>
          <p>
            {c.version} {detail.version} · {date(detail.createdAt)} ·{" "}
            {detail.createdBy}
          </p>
          {detail.publishedAt && (
            <p>
              {t.published}: {date(detail.publishedAt)} · {detail.publishedBy}
            </p>
          )}
          <h3>{t.history}</h3>
          {history?.items.map((e) => (
            <p key={e.id}>
              {e.action === "procedure-drafted"
                ? t.draft
                : e.action === "procedure-published"
                  ? t.publish
                  : t.withdraw}{" "}
              · {date(e.at)} · {e.actorId} · {e.reason}
            </p>
          ))}
          {detail.withdrawnAt && (
            <p>
              {t.withdrawn}: {date(detail.withdrawnAt)} · {detail.withdrawnBy}
            </p>
          )}
        </section>
      )}
      {!form && !selected && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.code}</th>
                  <th>{t.revision}</th>
                  <th>{t.stage}</th>
                  <th>{c.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setSelected(r.id)}
                      >
                        {r.code}
                      </button>
                    </td>
                    <td>{r.revision}</td>
                    <td>{t[r.stage]}</td>
                    <td>{status(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.items.length && <p>{t.empty}</p>}
          </div>
          <div className="pagination">
            <button
              disabled={busy || page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              {c.previous}
            </button>
            <span>
              {c.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              {c.next}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
