import { consumableWithdrawLabels } from "./consumable-withdraw-text";
import { incidentLabels } from "./incident-text";
import { RecallClearancePanel } from "./RecallClearance";
import { clearanceLabels } from "./clearance-text";
import { useEffect, useRef, useState } from "react";
import type {
  RecallImpact,
  RecallRecord,
  RecallSummary,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { recallLabels } from "./recall-text";
type Source = { id: string; code: string; version: number };
const empty = () => ({
  code: "",
  sourceKind: "load" as "load" | "package",
  sourceId: "",
  packageId: "",
  reason: "",
  reference: "",
  location: "",
  note: "",
  action: "quarantine" as
    "quarantine" | "reprocess_required" | "discard_recorded",
  confirmed: false,
});
export function RecallWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
  initialRecordId,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  initialRecordId?: string;
}) {
  const t = labels(language),
    p = recallLabels(language),
    [selected, setSelected] = useState<string | null>(initialRecordId ?? null),
    [rows, setRows] = useState<Page<RecallSummary> | null>(null),
    [detail, setDetail] = useState<RecallRecord | null>(null),
    [past, setPast] = useState<RecallRecord | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [loads, setLoads] = useState<Source[]>([]),
    [packages, setPackages] = useState<Source[]>([]),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<{
      kind: "create" | "recover" | "dispose" | "extend";
      requestId: string;
      version?: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [childDirty, setChildDirty] = useState(false),
    [childBusy, setChildBusy] = useState(false),
    [childReset, setChildReset] = useState(0),
    [impact, setImpact] = useState<RecallImpact | null>(null),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null),
    exampleKey = useRef(crypto.randomUUID()),
    busy = blocked || saving || childBusy;
  useEffect(() => {
    onDirty(!!form || childDirty);
    return () => onDirty(false);
  }, [form, childDirty, onDirty]);
  useEffect(() => {
    onBusy(saving || childBusy);
    return () => onBusy(false);
  }, [saving, childBusy, onBusy]);
  useEffect(
    () => () => {
      pending.current?.abort();
      inspection.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setRows(null);
    setDetail(null);
    setPast(null);
    setHistory(null);
    inspection.current?.abort();
    void (async () => {
      try {
        if (selected) {
          const [r, h] = await Promise.all([
            api.recall(session, selected, ac.signal),
            api.recallHistory(session, selected, historyPage, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setDetail(r);
            setHistory(h);
          }
        } else {
          const [r, l, p] = await Promise.all([
            api.recalls(session, page, ac.signal),
            api.allLoads(session, ac.signal),
            api.allPackages(session, ac.signal),
          ]);
          if (!ac.signal.aborted) {
            setRows(r);
            setLoads(l);
            setPackages(p);
          }
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(e);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [session, selected, page, historyPage, nonce, onExpired]);
  const patch = (v: Partial<ReturnType<typeof empty>>) => {
    if ("sourceId" in v || "sourceKind" in v) {
      setImpact(null);
      setFields((x) => ({ ...x, ...v, confirmed: false }));
    } else setFields((x) => ({ ...x, ...v }));
  };
  function clear() {
    setChildReset((n) => n + 1);
    setChildDirty(false);
    setImpact(null);
    setForm(null);
    setFields(empty());
    setDiscard(null);
  }
  function guard(action: () => void) {
    if (busy) return;
    if (form || childDirty)
      setDiscard(() => () => {
        clear();
        action();
      });
    else {
      clear();
      action();
    }
  }
  function begin(
    kind: "create" | "recover" | "dispose" | "extend",
    packageId = "",
  ) {
    guard(() => {
      setNotice(false);
      setError(null);
      setPast(null);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version,
      });
      setFields({ ...empty(), packageId });
    });
  }
  async function save() {
    if (
      !form ||
      busy ||
      !fields.confirmed ||
      ((form.kind === "create" || form.kind === "extend") && !impact) ||
      (form.kind === "recover" ? !session.canRecover : !session.canRecall)
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      let r: RecallRecord;
      if (form.kind === "create") {
        const source = (fields.sourceKind === "load" ? loads : packages).find(
          (x) => x.id === fields.sourceId,
        );
        if (!source) return;
        r = await api.createRecall(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            sourceKind: fields.sourceKind,
            sourceId: source.id,
            sourceVersion: source.version,
            reason: fields.reason,
            reference: fields.reference,
            confirmed: true,
            impactHash: impact!.impactHash,
          },
          ac.signal,
        );
      } else if (form.kind === "extend") {
        if (!selected || !form.version || !impact) return;
        r = await api.extendRecall(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            impactHash: impact.impactHash,
            reason: fields.reason,
            reference: fields.reference,
            confirmed: true,
          },
          ac.signal,
        );
      } else {
        if (!selected || !form.version) return;
        const command = {
          requestId: form.requestId,
          version: form.version,
          packageId: fields.packageId,
          reference: fields.reference,
          confirmed: true,
        };
        if (form.kind === "recover")
          r = await api.recoverRecall(
            session,
            selected,
            { ...command, location: fields.location, note: fields.note },
            ac.signal,
          );
        else
          r = await api.disposeRecall(
            session,
            selected,
            { ...command, action: fields.action, reason: fields.reason },
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
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function example(lineage = false) {
    if (
      busy ||
      form ||
      !session.canRecall ||
      session.mode !== "local-dummy-preview"
    )
      return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      let source: Source;
      if (lineage) {
        const e = await api.lineageRecallExample(
          session,
          exampleKey.current,
          ac.signal,
        );
        source = e.sourcePackage;
      } else {
        const d = await api.recallExample(
          session,
          exampleKey.current,
          ac.signal,
        );
        source = {
          id: d.packageId,
          code: d.packageCode,
          version: d.packageVersion,
        };
      }
      const plan = await api.recallImpact(
        session,
        "package",
        source.id,
        source.version,
        ac.signal,
      );
      if (ac.signal.aborted) return;
      setPackages((x) => [source, ...x.filter((p) => p.id !== source.id)]);
      setForm({ kind: "create", requestId: crypto.randomUUID() });
      setFields({
        ...empty(),
        code: "RECALL-DEMO-" + exampleKey.current,
        sourceKind: "package",
        sourceId: source.id,
        reason: lineage
          ? "SIMULATED recall after reprocessing"
          : "SIMULATED recall demonstration",
        reference: "SIMULATED-RECALL",
      });
      setImpact(plan);
      exampleKey.current = crypto.randomUUID();
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function previewImpact() {
    if (busy || !form) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    setImpact(null);
    setFields((x) => ({ ...x, confirmed: false }));
    try {
      let r: RecallImpact;
      if (form.kind === "extend") {
        if (!selected) return;
        r = await api.recallCaseImpact(session, selected, ac.signal);
      } else {
        const source = (fields.sourceKind === "load" ? loads : packages).find(
          (x) => x.id === fields.sourceId,
        );
        if (!source) return;
        r = await api.recallImpact(
          session,
          fields.sourceKind,
          source.id,
          source.version,
          ac.signal,
        );
      }
      if (!ac.signal.aborted) setImpact(r);
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function clearanceExample() {
    if (busy || form) return;
    const ac = new AbortController();
    pending.current = ac;
    setSaving(true);
    setError(null);
    try {
      const r = await api.recallClearanceExample(
        session,
        exampleKey.current,
        ac.signal,
      );
      if (ac.signal.aborted) return;
      clear();
      setSelected(r.id);
      setHistoryPage(1);
      setNotice(false);
      setNonce((n) => n + 1);
      exampleKey.current = crypto.randomUUID();
    } catch (e) {
      if (!ac.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      if (!ac.signal.aborted) setSaving(false);
      pending.current = null;
    }
  }
  async function inspect(version: number) {
    if (!selected || busy || form) return;
    inspection.current?.abort();
    const ac = new AbortController();
    inspection.current = ac;
    try {
      const r = await api.recall(session, selected, ac.signal, version);
      if (!ac.signal.aborted) setPast(r);
    } catch (e) {
      if (!ac.signal.aborted) {
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
      : session.actors?.[id] === "reviewer"
        ? t.reviewer
        : session.actors?.[id] === "viewer"
          ? t.viewer
          : id;
  const shown = past ?? detail;
  const actionTitle =
    form?.kind === "recover"
      ? p.recovery
      : form?.kind === "dispose"
        ? p.dispose
        : form?.kind === "extend"
          ? p.extend
          : p.create;
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
          {session.canRecall && !selected && (
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
      <p>{p.permanent}</p>
      <small>{p.reviewerOnly}</small>
      {session.canRecall &&
        !selected &&
        !form &&
        session.mode === "local-dummy-preview" && (
          <section className="demo-example">
            <button disabled={busy || loading} onClick={() => void example()}>
              {p.example}
            </button>
            <button
              disabled={busy || loading}
              onClick={() => void example(true)}
            >
              {p.lineageExample}
            </button>
            {session.canClearRecall && (
              <button
                disabled={busy || loading}
                onClick={() => void clearanceExample()}
              >
                {clearanceLabels(language).example}
              </button>
            )}
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
      {form && (
        <form
          className="panel edit-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="panel-heading">
            <h2>{actionTitle}</h2>
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
              {form.kind === "create" && (
                <>
                  <label>
                    {p.code}
                    <input
                      required
                      maxLength={100}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                      value={fields.code}
                      onChange={(e) => patch({ code: e.target.value })}
                    />
                  </label>
                  <label>
                    {p.sourceKind}
                    <select
                      aria-label={p.sourceKind}
                      value={fields.sourceKind}
                      onChange={(e) =>
                        patch({
                          sourceKind: e.target.value as "load" | "package",
                          sourceId: "",
                        })
                      }
                    >
                      <option value="load">{p.load}</option>
                      <option value="package">{p.package}</option>
                    </select>
                  </label>
                  <label>
                    {p.source}
                    <select
                      aria-label={p.source}
                      required
                      value={fields.sourceId}
                      onChange={(e) => patch({ sourceId: e.target.value })}
                    >
                      <option value="">{p.choose}</option>
                      {(fields.sourceKind === "load" ? loads : packages).map(
                        (row) => (
                          <option key={row.id} value={row.id}>
                            {row.code} · {row.version}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
              {form.kind === "dispose" && (
                <label>
                  {p.action}
                  <select
                    aria-label={p.action}
                    value={fields.action}
                    onChange={(e) =>
                      patch({ action: e.target.value as typeof fields.action })
                    }
                  >
                    {(
                      [
                        "quarantine",
                        "reprocess_required",
                        "discard_recorded",
                      ] as const
                    ).map((key) => (
                      <option key={key} value={key}>
                        {p[key]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(form.kind === "recover"
                ? (["location", "reference", "note"] as const)
                : (["reason", "reference"] as const)
              ).map((key) => (
                <label key={key}>
                  {p[key]}
                  <input
                    required={key !== "note"}
                    maxLength={key === "note" || key === "reason" ? 500 : 200}
                    value={fields[key]}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            {(form.kind === "create" || form.kind === "extend") && (
              <>
                <button
                  type="button"
                  disabled={
                    busy || (form.kind === "create" && !fields.sourceId)
                  }
                  onClick={() => void previewImpact()}
                >
                  {p.preview}
                </button>
                {impact && (
                  <section className="readonly-note">
                    <h3>
                      {p.impact}: {impact.items.length}
                    </h3>
                    <p>
                      {p.instrumentsPreview}:{" "}
                      {impact.instruments.map((i) => i.code).join(", ")}
                    </p>
                    <p>{p.lineageNotice}</p>
                    <ul>
                      {impact.items.map((i) => (
                        <li key={i.packageId}>
                          {i.packageCode} · {p[i.origin ?? "direct"]}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {form.kind === "recover"
                ? p.confirmRecovery
                : form.kind === "dispose"
                  ? p.confirmDisposition
                  : form.kind === "extend"
                    ? p.confirmExtension
                    : p.confirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className="primary"
              disabled={
                busy ||
                loading ||
                !fields.confirmed ||
                ((form.kind === "create" || form.kind === "extend") &&
                  !impact) ||
                (form.kind === "extend" &&
                  !!detail?.lineage &&
                  !!impact &&
                  !impact.items.some(
                    (p) =>
                      !detail.items.some((i) => i.packageId === p.packageId),
                  ))
              }
            >
              {busy
                ? t.saving
                : form.kind === "recover"
                  ? p.saveRecovery
                  : form.kind === "dispose"
                    ? p.saveDisposition
                    : form.kind === "extend"
                      ? p.saveExtension
                      : p.save}
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
                  <th>{p.source}</th>
                  <th>{p.items}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.sourceCode}</td>
                    <td>{row.packageCount}</td>
                    <td>{p[row.state]}</td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          guard(() => {
                            setSelected(row.id);
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
      {!loading && shown?.equipmentIncident && (
        <section className="panel">
          <h2>{incidentLabels(language).title}</h2>
          <p>
            {shown.equipmentIncident.code} ·{" "}
            {shown.equipmentIncident.equipmentCode}
          </p>
          <p>
            {shown.equipmentIncident.from} — {shown.equipmentIncident.to}
          </p>
        </section>
      )}
      {!loading && shown && (
        <>
          {past && (
            <section className="panel historical">
              <h2>
                {p.past} · {past.version}
              </h2>
              <button onClick={() => setPast(null)}>{p.current}</button>
            </section>
          )}
          <section className="panel">
            <span className="badge retired">{p[shown.state]}</span>
            {session.canRecall && !past && !form && !shown.clearance && (
              <button disabled={busy} onClick={() => begin("extend")}>
                {p.extend}
              </button>
            )}
            {shown.lineage && (
              <p className="readonly-note">
                {p.lineageNotice}
                {!shown.clearance && (
                  <>
                    {" "}
                    · {p.instruments}: {shown.lineage.instrumentIds.length}
                  </>
                )}
              </p>
            )}
            {shown.consumableLot && (
              <p className="readonly-note">
                {consumableWithdrawLabels(language).title}:{" "}
                {shown.consumableLot.code} · {shown.consumableLot.lotNumber} ·{" "}
                {shown.consumableLot.supplier} · {shown.consumableLot.reference}
              </p>
            )}
            <dl className="details-grid">
              <div>
                <dt>{p.source}</dt>
                <dd>
                  {shown.sourceCode} · {shown.sourceVersion}
                </dd>
              </div>
              <div>
                <dt>{p.reason}</dt>
                <dd>{shown.reason}</dd>
              </div>
              <div>
                <dt>{p.reference}</dt>
                <dd>{shown.reference}</dd>
              </div>
              <div>
                <dt>{p.actor}</dt>
                <dd>
                  {actor(shown.createdBy)} · {date(shown.createdAt)}
                </dd>
              </div>
              <div>
                <dt>{p.version}</dt>
                <dd>{shown.version}</dd>
              </div>
            </dl>
          </section>
          {!past && !form && detail && (
            <RecallClearancePanel
              key={childReset}
              record={detail}
              session={session}
              language={language}
              blocked={blocked || saving || loading}
              onExpired={onExpired}
              onDirty={setChildDirty}
              onBusy={setChildBusy}
              onSaved={() => {
                setNotice(true);
                setNonce((n) => n + 1);
              }}
            />
          )}
          <section className="panel">
            <h2>{p.items}</h2>
            {shown.items.map((item) => (
              <article className="cleaning-attempt" key={item.packageId}>
                <p>{p[item.origin ?? "direct"]}</p>
                {item.previousReturn && (
                  <p>
                    {p.previousReturn}: {item.previousReturn.code} ·{" "}
                    {item.previousReturn.episodeCode ?? "—"}
                  </p>
                )}
                <div className="panel-heading">
                  <div>
                    <h3>{item.packageCode}</h3>
                    <span className="badge retired">{p[item.status]}</span>
                  </div>
                  {!past && detail?.state === "open" && (
                    <div className="buttons">
                      {session.canRecover && item.status === "outstanding" && (
                        <button
                          disabled={busy || !!form}
                          onClick={() => begin("recover", item.packageId)}
                        >
                          {p.recovery}
                        </button>
                      )}
                      {session.canRecall && item.status === "recovered" && (
                        <button
                          disabled={busy || !!form}
                          onClick={() => begin("dispose", item.packageId)}
                        >
                          {p.dispose}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <dl className="details-grid">
                  <div>
                    <dt>{item.previousReturn ? p.whereHistorical : p.where}</dt>
                    <dd>
                      {item.atRecall
                        ? (item.atRecall.location ??
                          item.atRecall.destination ??
                          p.unrecorded)
                        : p.unrecorded}
                    </dd>
                  </div>
                  {item.atRecall?.recipient && (
                    <div>
                      <dt>{p.recipient}</dt>
                      <dd>{item.atRecall.recipient}</dd>
                    </div>
                  )}
                  {item.recovery && (
                    <>
                      <div>
                        <dt>{p.location}</dt>
                        <dd>{item.recovery.location}</dd>
                      </div>
                      <div>
                        <dt>{p.recovery}</dt>
                        <dd>
                          {item.recovery.reference} ·{" "}
                          {actor(item.recovery.actorId)} ·{" "}
                          {date(item.recovery.at)}
                        </dd>
                      </div>
                    </>
                  )}
                  {item.disposition && (
                    <div>
                      <dt>{p.action}</dt>
                      <dd>
                        {p[item.disposition.action]} · {item.disposition.reason}
                        <small>
                          {item.disposition.reference} ·{" "}
                          {actor(item.disposition.actorId)} ·{" "}
                          {date(item.disposition.at)}
                        </small>
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </section>
          {history && (
            <section className="panel history">
              <h2>{p.history}</h2>
              <ol>
                {history.items.map((h) => (
                  <li key={h.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>
                        {h.action === "recall-created"
                          ? p.created
                          : h.action === "recall-recovered"
                            ? p.recoveryEvent
                            : h.action === "recall-cleared-for-reprocessing"
                              ? clearanceLabels(language).clearanceEvent
                              : h.action === "recall-reprocessing-admitted"
                                ? clearanceLabels(language).admissionEvent
                                : h.action === "recall-expanded"
                                  ? p.expanded
                                  : p.dispositionEvent}
                      </strong>
                      <time dateTime={h.at}>{date(h.at)}</time>
                      <small>
                        {actor(h.actorId)} · {h.version}
                      </small>
                      <p>{h.reason}</p>
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
