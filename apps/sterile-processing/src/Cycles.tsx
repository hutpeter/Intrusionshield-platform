import { returnLabels } from "./return-text";
import { recallLabels } from "./recall-text";
import { reviewLabels } from "./review-text";
import { useEffect, useRef, useState } from "react";
import type {
  SterilizationLoad,
  LoadSummary,
  PackageSummary,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { cycleLabels } from "./cycle-text";
type Form = {
  kind: "create" | "contents" | "start" | "finish" | "cancel";
  requestId: string;
  version?: number;
};
const empty = () => ({
  code: "",
  sterilizer: "",
  method: "steam" as "steam" | "low_temperature" | "other",
  profile: "",
  profileVersion: "",
  packageIds: [] as string[],
  pick: "",
  cycleReference: "",
  outcome: "" as "" | "passed" | "failed" | "aborted",
  cycleEvidence: "",
  indicatorEvidence: "",
  note: "",
  reason: "",
  confirmed: false,
});
export function CycleWorkspace({
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
    p = cycleLabels(language),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<LoadSummary> | null>(null),
    [detail, setDetail] = useState<SterilizationLoad | null>(null),
    [past, setPast] = useState<SterilizationLoad | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [options, setOptions] = useState<PackageSummary[]>([]),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<Form | null>(null),
    [fields, setFields] = useState(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null),
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
  useEffect(
    () => () => {
      pending.current?.abort();
      inspection.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setRows(null);
    setDetail(null);
    setPast(null);
    setHistory(null);
    setError(null);
    inspection.current?.abort();
    void (async () => {
      try {
        const packages = await api.allPackages(session, c.signal);
        if (!c.signal.aborted) setOptions(packages);
        if (selected) {
          const [d, h] = await Promise.all([
            api.load(session, selected, c.signal),
            api.loadHistory(session, selected, historyPage, c.signal),
          ]);
          if (!c.signal.aborted) {
            setDetail(d);
            setHistory(h);
          }
        } else {
          const r = await api.loads(session, page, c.signal);
          if (!c.signal.aborted) setRows(r);
        }
      } catch (e) {
        if (!c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    })();
    return () => c.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  const patch = (v: Partial<ReturnType<typeof empty>>) =>
    setFields((x) => ({ ...x, ...v }));
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
  function begin(kind: Form["kind"]) {
    guard(() => {
      setError(null);
      setNotice(false);
      setPast(null);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version,
      });
      setFields({
        ...empty(),
        packageIds:
          kind === "contents" && detail ? detail.packages.map((i) => i.id) : [],
      });
    });
  }
  async function save() {
    if (!form || busy || !session.canWrite || !fields.confirmed) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      let x: SterilizationLoad;
      if (form.kind === "create") {
        x = await api.createLoad(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            sterilizer: fields.sterilizer,
            method: fields.method,
            profile: fields.profile,
            profileVersion: fields.profileVersion,
            packageIds: fields.packageIds,
            confirmed: true,
          },
          c.signal,
        );
      } else {
        if (!selected || !form.version) return;
        const command = {
          requestId: form.requestId,
          version: form.version,
          confirmed: true,
        };
        if (form.kind === "contents")
          x = await api.loadContents(
            session,
            selected,
            { ...command, packageIds: fields.packageIds },
            c.signal,
          );
        else if (form.kind === "start")
          x = await api.startCycle(
            session,
            selected,
            { ...command, cycleReference: fields.cycleReference },
            c.signal,
          );
        else if (form.kind === "cancel")
          x = await api.cancelLoad(
            session,
            selected,
            { ...command, reason: fields.reason },
            c.signal,
          );
        else {
          if (!fields.outcome) return;
          x = await api.finishCycle(
            session,
            selected,
            {
              ...command,
              outcome: fields.outcome,
              cycleEvidence: fields.cycleEvidence,
              indicatorEvidence: fields.indicatorEvidence,
              note: fields.note,
            },
            c.signal,
          );
        }
      }
      if (c.signal.aborted) return;
      clear();
      setSelected(x.id);
      setHistoryPage(1);
      setNotice(true);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!c.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function example() {
    if (
      busy ||
      form ||
      !session.canWrite ||
      session.mode !== "local-dummy-preview"
    )
      return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      const l = await api.cycleExample(session, exampleKey.current, c.signal);
      if (c.signal.aborted) return;
      exampleKey.current = crypto.randomUUID();
      setSelected(l.id);
      setHistoryPage(1);
      setForm({
        kind: "finish",
        requestId: crypto.randomUUID(),
        version: l.version,
      });
      setFields({
        ...empty(),
        cycleEvidence: "SIMULATED-CYCLE-EVIDENCE",
        indicatorEvidence: "SIMULATED-INDICATORS",
        note: "Fictional demonstration only",
      });
      setNonce((n) => n + 1);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!c.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function inspect(version: number) {
    if (!selected || busy || form) return;
    inspection.current?.abort();
    const c = new AbortController();
    inspection.current = c;
    try {
      const x = await api.load(session, selected, c.signal, version);
      if (!c.signal.aborted) setPast(x);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  const date = (at: string) =>
    new Intl.DateTimeFormat(language === "es" ? "es-PE" : language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  const actor = (id: string) =>
    session.actors?.[id] === "operator"
      ? t.operator
      : session.actors?.[id] === "viewer"
        ? t.viewer
        : id;
  const actionTitle = (kind: Form["kind"]) =>
    kind === "create"
      ? p.newLoad
      : kind === "contents"
        ? p.edit
        : kind === "start"
          ? p.start
          : kind === "finish"
            ? p.finish
            : p.cancel;
  const events: Record<string, string> = {
    "load-created": p.created,
    "load-contents-updated": p.changed,
    "cycle-started": p.started,
    "cycle-recorded": p.recorded,
    "load-cancelled": p.cancelledAction,
  };
  const record = (d: SterilizationLoad) => (
    <>
      <section className="panel">
        {d.returnBlocked && (
          <p className="alert">{returnLabels(language).blocked}</p>
        )}
        {d.recallBlocked && (
          <p className="alert">{recallLabels(language).blocked}</p>
        )}
        <span
          className={
            "badge " +
            (["failed", "aborted", "cancelled"].includes(d.state)
              ? "retired"
              : "")
          }
        >
          {d.review ? reviewLabels(language)[d.review.state] : p[d.state]}
        </span>
        <dl className="details-grid">
          <div>
            <dt>{p.sterilizer}</dt>
            <dd>{d.sterilizer}</dd>
          </div>
          <div>
            <dt>{p.method}</dt>
            <dd>{p[d.method]}</dd>
          </div>
          <div>
            <dt>{p.profile}</dt>
            <dd>
              {d.profile} · {d.profileVersion}
            </dd>
          </div>
          <div>
            <dt>{p.cycleReference}</dt>
            <dd>{d.cycleReference || "—"}</dd>
          </div>
          <div>
            <dt>{p.version}</dt>
            <dd>{d.version}</dd>
          </div>
          {d.startedAt && (
            <div>
              <dt>{p.startedOn}</dt>
              <dd>
                {date(d.startedAt)} · {actor(d.startedBy!)}
              </dd>
            </div>
          )}
          {d.finishedAt && (
            <div>
              <dt>{p.finishedOn}</dt>
              <dd>
                {date(d.finishedAt)} · {actor(d.finishedBy!)}
              </dd>
            </div>
          )}
          {d.cycleEvidence && (
            <div>
              <dt>{p.cycleEvidence}</dt>
              <dd>{d.cycleEvidence}</dd>
            </div>
          )}
          {d.indicatorEvidence && (
            <div>
              <dt>{p.indicatorEvidence}</dt>
              <dd>{d.indicatorEvidence}</dd>
            </div>
          )}
          {d.note && (
            <div>
              <dt>{p.note}</dt>
              <dd>{d.note}</dd>
            </div>
          )}
          {d.cancelReason && (
            <div>
              <dt>{p.reason}</dt>
              <dd>{d.cancelReason}</dd>
            </div>
          )}
        </dl>
        {d.review?.state !== "released" &&
          ["awaiting_review", "failed", "aborted"].includes(d.state) && (
            <p className="readonly-note">{p.held}</p>
          )}
      </section>
      <section className="panel">
        <h2>{p.packages}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.code}</th>
                <th>{p.packageVersion}</th>
                <th>{t.assemblyCode}</th>
                <th>{t.instruments}</th>
              </tr>
            </thead>
            <tbody>
              {d.packages.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.version}</td>
                  <td>
                    {row.assemblyCode ?? row.assemblyId} · {row.assemblyVersion}
                  </td>
                  <td>{row.instrumentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
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
          {session.canWrite && !selected && (
            <button
              className="primary"
              disabled={busy || loading || !!form}
              onClick={() => begin("create")}
            >
              {p.newLoad}
            </button>
          )}
          {session.canWrite && detail && !past && (
            <>
              {detail.state === "draft" && (
                <>
                  {(["contents", "start", "cancel"] as const).map((kind) => (
                    <button
                      key={kind}
                      disabled={busy || loading || !!form}
                      onClick={() => begin(kind)}
                    >
                      {actionTitle(kind)}
                    </button>
                  ))}
                </>
              )}
              {detail.state === "running" && (
                <button
                  className="primary"
                  disabled={busy || loading || !!form}
                  onClick={() => begin("finish")}
                >
                  {p.finish}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="readonly-note">{p.boundary}</p>
      {session.canWrite &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <section className="demo-example">
            <button disabled={busy || loading} onClick={() => void example()}>
              {p.example}
            </button>
            <small>{p.exampleHelp}</small>
          </section>
        )}
      {notice && (
        <p role="status" className="success">
          {p.notice}
        </p>
      )}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof typeof t]
            : t.error}
          <span className="error-help">{t.error}</span>
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
      {form && session.canWrite && (
        <form
          className="panel edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h2>{actionTitle(form.kind)}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            {form.kind === "create" && (
              <div className="form-grid">
                {(
                  ["code", "sterilizer", "profile", "profileVersion"] as const
                ).map((key) => (
                  <label key={key}>
                    {p[key]}
                    <input
                      required
                      maxLength={key === "profile" ? 200 : 100}
                      pattern={
                        key === "code" || key === "sterilizer"
                          ? "[A-Za-z0-9][A-Za-z0-9._-]*"
                          : undefined
                      }
                      value={fields[key]}
                      onChange={(e) => patch({ [key]: e.target.value })}
                    />
                  </label>
                ))}
                <label>
                  {p.method}
                  <select
                    aria-label={p.method}
                    value={fields.method}
                    onChange={(e) =>
                      patch({ method: e.target.value as typeof fields.method })
                    }
                  >
                    {(["steam", "low_temperature", "other"] as const).map(
                      (key) => (
                        <option key={key} value={key}>
                          {p[key]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            )}
            {["create", "contents"].includes(form.kind) && (
              <>
                <div className="instrument-picker">
                  <label>
                    {p.packages}
                    <select
                      aria-label={p.packages}
                      value={fields.pick}
                      onChange={(e) => patch({ pick: e.target.value })}
                    >
                      <option value="">{p.choose}</option>
                      {options.map((row) => (
                        <option
                          key={row.id}
                          value={row.id}
                          disabled={
                            row.state !== "packaged" ||
                            fields.packageIds.includes(row.id) ||
                            !!(
                              row.activeLoad &&
                              row.activeLoad.loadId !== selected
                            )
                          }
                        >
                          {row.code}
                          {row.activeLoad
                            ? " · " + row.activeLoad.loadCode
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!fields.pick || fields.packageIds.length >= 100}
                    onClick={() =>
                      patch({
                        packageIds: [...fields.packageIds, fields.pick],
                        pick: "",
                      })
                    }
                  >
                    {p.add}
                  </button>
                </div>
                <ul className="selected-instruments">
                  {fields.packageIds.map((id) => (
                    <li key={id}>
                      <strong>
                        {options.find((row) => row.id === id)?.code ??
                          detail?.packages.find((row) => row.id === id)?.code}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            packageIds: fields.packageIds.filter(
                              (x) => x !== id,
                            ),
                          })
                        }
                      >
                        {p.remove}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {form.kind === "start" && (
              <label>
                {p.cycleReference}
                <input
                  required
                  maxLength={100}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                  value={fields.cycleReference}
                  onChange={(e) => patch({ cycleReference: e.target.value })}
                />
              </label>
            )}
            {form.kind === "finish" && (
              <div className="form-grid">
                <label>
                  {p.outcome}
                  <select
                    aria-label={p.outcome}
                    required
                    value={fields.outcome}
                    onChange={(e) =>
                      patch({
                        outcome: e.target.value as typeof fields.outcome,
                      })
                    }
                  >
                    <option value="">{p.selectResult}</option>
                    <option value="passed">{p.passed}</option>
                    <option value="failed">{p.failedOutcome}</option>
                    <option value="aborted">{p.abortedOutcome}</option>
                  </select>
                </label>
                {(["cycleEvidence", "indicatorEvidence", "note"] as const).map(
                  (key) => (
                    <label key={key}>
                      {p[key]}
                      <input
                        required={
                          key === "cycleEvidence" ||
                          (key === "indicatorEvidence" &&
                            fields.outcome === "passed") ||
                          (key === "note" &&
                            fields.outcome !== "" &&
                            fields.outcome !== "passed")
                        }
                        maxLength={500}
                        value={fields[key]}
                        onChange={(e) => patch({ [key]: e.target.value })}
                      />
                    </label>
                  ),
                )}
              </div>
            )}
            {form.kind === "cancel" && (
              <label>
                {p.reason}
                <input
                  required
                  maxLength={500}
                  value={fields.reason}
                  onChange={(e) => patch({ reason: e.target.value })}
                />
              </label>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {form.kind === "start"
                ? p.confirmStart
                : form.kind === "finish"
                  ? p.confirmFinish
                  : form.kind === "cancel"
                    ? p.confirmCancel
                    : p.confirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className={form.kind === "cancel" ? "danger" : "primary"}
              disabled={
                busy ||
                !fields.confirmed ||
                (["create", "contents"].includes(form.kind) &&
                  !fields.packageIds.length)
              }
            >
              {busy
                ? t.saving
                : form.kind === "create"
                  ? p.create
                  : form.kind === "contents"
                    ? p.saveContents
                    : form.kind === "start"
                      ? p.start
                      : form.kind === "finish"
                        ? p.saveResult
                        : p.saveCancel}
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p className="loading" role="status">
          {t.loading}
        </p>
      )}
      {!loading && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{p.code}</th>
                  <th>{p.sterilizer}</th>
                  <th>{p.packageCount}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td>{d.sterilizer}</td>
                    <td>{d.packageCount}</td>
                    <td>
                      {d.review
                        ? reviewLabels(language)[d.review.state]
                        : p[d.state]}
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          guard(() => {
                            setSelected(d.id);
                            setHistoryPage(1);
                            setNotice(false);
                          })
                        }
                      >
                        {t.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.items.length && <p>{p.empty}</p>}
          <div className="pagination">
            <button
              disabled={busy || page === 1}
              onClick={() => guard(() => setPage((n) => n - 1))}
            >
              {t.previous}
            </button>
            <span>
              {t.page} {page}
            </span>
            <button
              disabled={busy || !rows.hasMore}
              onClick={() => guard(() => setPage((n) => n + 1))}
            >
              {t.next}
            </button>
          </div>
        </section>
      )}
      {!loading && detail && (
        <>
          {past ? (
            <>
              <section className="panel historical">
                <h2>
                  {p.past} · {past.version}
                </h2>
                <button onClick={() => setPast(null)}>{p.current}</button>
              </section>
              {record(past)}
            </>
          ) : (
            record(detail)
          )}
          {history && (
            <section className="panel history">
              <h2>{p.history}</h2>
              <ol>
                {history.items.map((h) => (
                  <li key={h.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{events[h.action] ?? h.action}</strong>
                      <time dateTime={h.at}>{date(h.at)}</time>
                      <small>
                        {p.version} {h.version} · {actor(h.actorId)}
                      </small>
                      {h.reason && <p>{h.reason}</p>}
                      <button
                        className="text-button"
                        disabled={busy || !!form}
                        onClick={() => void inspect(h.version)}
                      >
                        {p.viewVersion} {h.version}
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="pagination">
                <button
                  disabled={busy || !!form || historyPage === 1}
                  onClick={() => setHistoryPage((n) => n - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {t.page} {historyPage}
                </span>
                <button
                  disabled={busy || !!form || !history.hasMore}
                  onClick={() => setHistoryPage((n) => n + 1)}
                >
                  {t.next}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
