import { useEffect, useRef, useState } from "react";
import type {
  TrayDefinition,
  TrayAssembly,
  AssemblyView,
  Instrument,
  InstrumentType,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
type Text = ReturnType<typeof labels>;
type Selection = { kind: "definition" | "assembly"; id: string };
type Form =
  | { kind: "definition"; requestId: string; definition?: TrayDefinition }
  | { kind: "assembly"; requestId: string }
  | { kind: "contents"; requestId: string; assembly: TrayAssembly }
  | {
      kind: "action";
      requestId: string;
      assembly: TrayAssembly;
      action: "complete" | "disassemble";
    };
const empty = () => ({
  code: "",
  name: "",
  definitionId: "",
  reason: "",
  confirmed: false,
  requirements: [{ instrumentTypeId: "", quantity: "1" }],
  instrumentIds: [] as string[],
  pick: "",
});
export function TrayWorkspace({
  session,
  language,
  t,
  blocked,
  onExpired,
  onDirty,
  onBusy,
}: {
  session: Session;
  language: Language;
  t: Text;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
}) {
  const [tab, setTab] = useState<"definitions" | "assemblies">("definitions"),
    [selected, setSelected] = useState<Selection | null>(null),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0);
  const [typeOptions, setTypeOptions] = useState<InstrumentType[]>([]),
    [definitionOptions, setDefinitionOptions] = useState<TrayDefinition[]>([]),
    [instrumentOptions, setInstrumentOptions] = useState<Instrument[]>([]);
  const [definitions, setDefinitions] = useState<Page<TrayDefinition> | null>(
      null,
    ),
    [assemblies, setAssemblies] = useState<Page<TrayAssembly> | null>(null),
    [definition, setDefinition] = useState<TrayDefinition | null>(null),
    [view, setView] = useState<AssemblyView | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [historical, setHistorical] = useState<
      AssemblyView | TrayDefinition | null
    >(null);
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState<keyof Text | null>(null),
    [form, setForm] = useState<Form | null>(null),
    [fields, setFields] = useState(empty),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const pending = useRef<AbortController | null>(null),
    inspection = useRef<AbortController | null>(null);
  const busy = saving || blocked;
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
    setError(null);
    setDefinitions(null);
    setAssemblies(null);
    setDefinition(null);
    setView(null);
    setHistory(null);
    setHistorical(null);
    inspection.current?.abort();
    void (async () => {
      try {
        const [types, defs, instruments] = await Promise.all([
          api.allTypes(session, c.signal),
          api.allDefinitions(session, c.signal),
          api.allInstruments(session, c.signal),
        ]);
        if (c.signal.aborted) return;
        setTypeOptions(types);
        setDefinitionOptions(defs);
        setInstrumentOptions(instruments);
        if (selected) {
          const events = api.trayHistory(
            session,
            selected.id,
            selected.kind,
            historyPage,
            c.signal,
          );
          if (selected.kind === "definition") {
            const [d, h] = await Promise.all([
              api.definition(session, selected.id, c.signal),
              events,
            ]);
            if (!c.signal.aborted) {
              setDefinition(d);
              setHistory(h);
            }
          } else {
            const [a, h] = await Promise.all([
              api.assembly(session, selected.id, c.signal),
              events,
            ]);
            if (!c.signal.aborted) {
              setView(a);
              setHistory(h);
            }
          }
        } else if (tab === "definitions") {
          const p = await api.definitions(session, page, c.signal);
          if (!c.signal.aborted) setDefinitions(p);
        } else {
          const p = await api.assemblies(session, page, c.signal);
          if (!c.signal.aborted) setAssemblies(p);
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
  }, [session, selected, tab, page, historyPage, nonce, onExpired]);
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
  function navigate(target: typeof tab) {
    guard(() => {
      setTab(target);
      setSelected(null);
      setPage(1);
      setNotice(null);
    });
  }
  function begin(
    kind: Form["kind"],
    action?: "complete" | "disassemble",
    revision?: TrayDefinition,
  ) {
    guard(() => {
      const requestId = crypto.randomUUID();
      setError(null);
      setNotice(null);
      setHistorical(null);
      if (kind === "definition") {
        setForm({ kind, requestId, definition: revision });
        setFields(
          revision
            ? {
                ...empty(),
                code: revision.code,
                name: revision.name,
                requirements: revision.requirements.map((r) => ({
                  instrumentTypeId: r.instrumentTypeId,
                  quantity: String(r.quantity),
                })),
              }
            : empty(),
        );
      } else if (kind === "assembly") {
        setForm({ kind, requestId });
        setFields({ ...empty(), definitionId: definition?.id ?? "" });
      } else if (view) {
        setForm(
          kind === "contents"
            ? { kind, requestId, assembly: view.assembly }
            : {
                kind: "action",
                requestId,
                assembly: view.assembly,
                action: action!,
              },
        );
        setFields({
          ...empty(),
          instrumentIds: view.assembly.instruments.map((i) => i.id),
        });
      }
    });
  }
  async function save() {
    if (!form || pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      let id: string, kind: Selection["kind"];
      if (form.kind === "definition") {
        const requirements = fields.requirements.map((r) => ({
          instrumentTypeId: r.instrumentTypeId,
          quantity: Number(r.quantity),
        }));
        const item = form.definition
          ? await api.reviseDefinition(
              session,
              form.definition.id,
              {
                requestId: form.requestId,
                version: form.definition.version,
                name: fields.name,
                requirements,
                reason: fields.reason,
              },
              c.signal,
            )
          : await api.createDefinition(
              session,
              {
                requestId: form.requestId,
                code: fields.code,
                name: fields.name,
                requirements,
              },
              c.signal,
            );
        id = item.id;
        kind = "definition";
        setNotice(form.definition ? "definitionRevised" : "newDefinitionSaved");
      } else if (form.kind === "assembly") {
        const d = definitionOptions.find((d) => d.id === fields.definitionId);
        if (!d) return;
        const item = await api.createAssembly(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            definitionId: d.id,
            definitionVersion: d.version,
          },
          c.signal,
        );
        id = item.id;
        kind = "assembly";
        setNotice("assemblySaved");
      } else if (form.kind === "contents") {
        const item = await api.saveContents(
          session,
          form.assembly.id,
          {
            requestId: form.requestId,
            version: form.assembly.version,
            instrumentIds: fields.instrumentIds,
          },
          c.signal,
        );
        id = item.id;
        kind = "assembly";
        setNotice("contentsSaved");
      } else {
        if (!fields.confirmed) return;
        const item = await api.assemblyAction(
          session,
          form.assembly.id,
          {
            requestId: form.requestId,
            version: form.assembly.version,
            action: form.action,
            confirmed: true,
            reason: fields.reason,
          },
          c.signal,
        );
        id = item.id;
        kind = "assembly";
        setNotice("actionSaved");
      }
      if (c.signal.aborted) return;
      clear();
      setSelected({ kind, id });
      setTab(kind === "definition" ? "definitions" : "assemblies");
      setHistoryPage(1);
      setNonce((n) => n + 1);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!c.signal.aborted) setSaving(false);
    }
  }
  async function inspect(version: number) {
    if (!selected || busy) return;
    inspection.current?.abort();
    const c = new AbortController();
    inspection.current = c;
    setError(null);
    try {
      const item =
        selected.kind === "assembly"
          ? await api.assembly(session, selected.id, c.signal, version)
          : await api.definition(session, selected.id, c.signal, version);
      if (!c.signal.aborted) setHistorical(item);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  const patch = (v: Partial<typeof fields>) =>
    setFields((f) => ({ ...f, ...v }));
  const state = (a: TrayAssembly) =>
    a.state === "draft"
      ? t.draft
      : a.state === "complete"
        ? t.assemblyComplete
        : t.disassembled;
  const date = (at: string) =>
    new Intl.DateTimeFormat(
      language === "es" ? "es-PE" : language === "fr" ? "fr-FR" : "en-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone ?? "America/Lima",
      },
    ).format(new Date(at));
  const pagination = (
    n: number,
    more: boolean,
    change: (v: number) => void,
  ) => (
    <div className="pagination">
      <button
        disabled={busy || loading || n <= 1}
        onClick={() => guard(() => change(n - 1))}
      >
        {t.previous}
      </button>
      <span>
        {t.page} {n}
      </span>
      <button
        disabled={busy || loading || !more}
        onClick={() => guard(() => change(n + 1))}
      >
        {t.next}
      </button>
    </div>
  );
  const requirementTable = (
    d: TrayDefinition | TrayAssembly["definitionSnapshot"],
  ) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.type}</th>
            <th>{t.quantity}</th>
          </tr>
        </thead>
        <tbody>
          {d.requirements.map((r) => (
            <tr key={r.instrumentTypeId}>
              <td>
                {r.instrumentTypeName}
                <small>{r.instrumentTypeCode}</small>
              </td>
              <td>{r.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const contentsTable = (a: TrayAssembly) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.code}</th>
            <th>{t.type}</th>
            <th>{t.serial}</th>
          </tr>
        </thead>
        <tbody>
          {a.instruments.map((i) => (
            <tr key={i.id}>
              <td className="code">{i.code}</td>
              <td>{i.instrumentTypeName}</td>
              <td>{i.serialNumber || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!a.instruments.length && (
        <p className="muted empty-filter">{t.noContents}</p>
      )}
    </div>
  );
  const assessmentTable = (v: AssemblyView) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t.type}</th>
            <th>{t.required}</th>
            <th>{t.assigned}</th>
            <th>{t.missing}</th>
            <th>{t.excess}</th>
          </tr>
        </thead>
        <tbody>
          {v.assessment.rows.map((r) => (
            <tr key={r.instrumentTypeId}>
              <td>{r.name}</td>
              <td>{r.required}</td>
              <td>{r.assigned}</td>
              <td className={r.missing ? "discrepancy" : ""}>{r.missing}</td>
              <td className={r.excess ? "discrepancy" : ""}>{r.excess}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section className="tray-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t.facility}</p>
          <h1>
            {selected
              ? (definition?.code ?? view?.assembly.code ?? t.trays)
              : t.trays}
          </h1>
          <p>{t.trayIntro}</p>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || loading}
            onClick={() =>
              guard(() => {
                if (selected) setSelected(null);
                else setNonce((n) => n + 1);
                setNotice(null);
              })
            }
          >
            {selected ? t.backTrays : t.reload}
          </button>
          {session.canWrite && !selected && (
            <button
              className="primary"
              disabled={busy || loading || !!form}
              onClick={() =>
                begin(tab === "definitions" ? "definition" : "assembly")
              }
            >
              {tab === "definitions" ? t.newDefinition : t.newAssembly}
            </button>
          )}
        </div>
      </div>
      <div className="tray-tabs" role="group" aria-label={t.trays}>
        <button
          aria-pressed={tab === "definitions"}
          disabled={busy}
          onClick={() => navigate("definitions")}
        >
          {t.definitions}
        </button>
        <button
          aria-pressed={tab === "assemblies"}
          disabled={busy}
          onClick={() => navigate("assemblies")}
        >
          {t.assemblies}
        </button>
      </div>
      <p className="readonly-note">{t.assemblyNotSterile}</p>
      {notice && (
        <p role="status" className="success">
          {t[notice]}
        </p>
      )}
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in t
            ? t[error.code as keyof Text]
            : t.error}
          <span className="error-help">{t.error}</span>
        </p>
      )}
      {discard && (
        <section className="discard" role="alertdialog" aria-label={t.discard}>
          <p>{t.discard}</p>
          <div className="buttons">
            <button className="danger" onClick={() => discard()}>
              {t.discardYes}
            </button>
            <button onClick={() => setDiscard(null)}>{t.keep}</button>
          </div>
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
            <h2>
              {form.kind === "definition"
                ? form.definition
                  ? t.reviseDefinition
                  : t.newDefinition
                : form.kind === "assembly"
                  ? t.newAssembly
                  : form.kind === "contents"
                    ? t.editContents
                    : form.action === "complete"
                      ? t.completeAssembly
                      : t.disassemble}
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            {form.kind === "definition" && (
              <>
                <div className="form-grid">
                  <label>
                    {t.definitionCode}
                    <input
                      required
                      disabled={!!form.definition}
                      maxLength={100}
                      pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                      value={fields.code}
                      onChange={(e) => patch({ code: e.target.value })}
                    />
                  </label>
                  <label>
                    {t.definitionName}
                    <input
                      required
                      maxLength={200}
                      value={fields.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                </div>
                <h3>{t.requirements}</h3>
                {fields.requirements.map((r, n) => (
                  <div className="requirement-row" key={n}>
                    <label>
                      {t.type}
                      <select
                        required
                        aria-label={t.type + " " + (n + 1)}
                        value={r.instrumentTypeId}
                        onChange={(e) =>
                          patch({
                            requirements: fields.requirements.map((x, i) =>
                              i === n
                                ? { ...x, instrumentTypeId: e.target.value }
                                : x,
                            ),
                          })
                        }
                      >
                        <option value="">{t.chooseType}</option>
                        {typeOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} · {o.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t.quantity}
                      <input
                        aria-label={t.quantity + " " + (n + 1)}
                        type="number"
                        required
                        min={1}
                        max={500}
                        step={1}
                        value={r.quantity}
                        onChange={(e) =>
                          patch({
                            requirements: fields.requirements.map((x, i) =>
                              i === n ? { ...x, quantity: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={fields.requirements.length <= 1}
                      onClick={() =>
                        patch({
                          requirements: fields.requirements.filter(
                            (_, i) => i !== n,
                          ),
                        })
                      }
                    >
                      {t.removeLine}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={fields.requirements.length >= 50}
                  onClick={() =>
                    patch({
                      requirements: [
                        ...fields.requirements,
                        { instrumentTypeId: "", quantity: "1" },
                      ],
                    })
                  }
                >
                  {t.addRequirement}
                </button>
                {!typeOptions.length && <p>{t.firstType}</p>}
                {form.definition && (
                  <label className="spaced">
                    {t.revisionReason}
                    <textarea
                      required
                      maxLength={500}
                      value={fields.reason}
                      onChange={(e) => patch({ reason: e.target.value })}
                    />
                  </label>
                )}
              </>
            )}
            {form.kind === "assembly" && (
              <div className="form-grid">
                <label>
                  {t.assemblyCode}
                  <input
                    required
                    maxLength={100}
                    pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                    value={fields.code}
                    onChange={(e) => patch({ code: e.target.value })}
                  />
                </label>
                <label>
                  {t.definition}
                  <select
                    aria-label={t.definition}
                    required
                    value={fields.definitionId}
                    onChange={(e) => patch({ definitionId: e.target.value })}
                  >
                    <option value="">{t.selectDefinition}</option>
                    {definitionOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.code} · {t.revision} {d.revision}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {form.kind === "contents" && (
              <>
                <div className="instrument-picker">
                  <label>
                    {t.chooseInstrument}
                    <select
                      aria-label={t.chooseInstrument}
                      value={fields.pick}
                      onChange={(e) => patch({ pick: e.target.value })}
                    >
                      <option value="">{t.chooseInstrument}</option>
                      {instrumentOptions.map((i) => (
                        <option
                          key={i.id}
                          value={i.id}
                          disabled={
                            i.state === "retired" ||
                            !!i.processingHold ||
                            fields.instrumentIds.includes(i.id) ||
                            !!(
                              i.activeAssembly &&
                              i.activeAssembly.assemblyId !== form.assembly.id
                            )
                          }
                        >
                          {i.code} ·{" "}
                          {typeOptions.find((x) => x.id === i.instrumentTypeId)
                            ?.name ?? ""}
                          {i.activeAssembly &&
                          i.activeAssembly.assemblyId !== form.assembly.id
                            ? " · " + t.reservedElsewhere
                            : ""}
                          {i.processingHold
                            ? " · " + i.processingHold.episodeCode
                            : ""}
                          {i.state === "retired" ? " · " + t.retired : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={
                      !fields.pick ||
                      fields.instrumentIds.includes(fields.pick) ||
                      fields.instrumentIds.length >= 1000
                    }
                    onClick={() =>
                      patch({
                        instrumentIds: [...fields.instrumentIds, fields.pick],
                        pick: "",
                      })
                    }
                  >
                    {t.addInstrument}
                  </button>
                </div>
                <ul className="selected-instruments">
                  {fields.instrumentIds.map((id) => {
                    const i = instrumentOptions.find((i) => i.id === id);
                    return (
                      <li key={id}>
                        <span>
                          <strong>
                            {i?.code ??
                              form.assembly.instruments.find((i) => i.id === id)
                                ?.code}
                          </strong>
                          <small>
                            {
                              typeOptions.find(
                                (t) => t.id === i?.instrumentTypeId,
                              )?.name
                            }
                          </small>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            patch({
                              instrumentIds: fields.instrumentIds.filter(
                                (x) => x !== id,
                              ),
                            })
                          }
                        >
                          {t.removeLine}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!fields.instrumentIds.length && (
                  <p className="muted">{t.noContents}</p>
                )}
              </>
            )}
            {form.kind === "action" && (
              <>
                {form.action === "disassemble" && (
                  <label>
                    {t.disassemblyReason}
                    <textarea
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
                  {form.action === "complete"
                    ? t.confirmComposition
                    : t.confirmDisassemble}
                </label>
              </>
            )}
          </fieldset>
          <div className="form-footer">
            <button
              className={
                form.kind === "action" && form.action === "disassemble"
                  ? "danger"
                  : "primary"
              }
              disabled={
                busy ||
                (form.kind === "action" && !fields.confirmed) ||
                (form.kind === "definition" && !typeOptions.length) ||
                (form.kind === "assembly" && !definitionOptions.length)
              }
            >
              {busy
                ? t.saving
                : form.kind === "definition"
                  ? form.definition
                    ? t.saveRevision
                    : t.saveDefinition
                  : form.kind === "assembly"
                    ? t.newAssembly
                    : form.kind === "contents"
                      ? t.saveContents
                      : t.confirmAction}
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p role="status" className="loading">
          {t.loading}
        </p>
      )}
      {!loading && !selected && (
        <section className="panel list-panel">
          <div className="list-toolbar">
            <h2>{tab === "definitions" ? t.definitions : t.assemblies}</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.code}</th>
                  <th>{t.name}</th>
                  <th>{tab === "definitions" ? t.revision : t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {tab === "definitions"
                  ? definitions?.items.map((d) => (
                      <tr key={d.id}>
                        <td className="code">{d.code}</td>
                        <td>{d.name}</td>
                        <td>{d.revision}</td>
                        <td>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              guard(() => {
                                setSelected({ kind: "definition", id: d.id });
                                setHistoryPage(1);
                              })
                            }
                          >
                            {t.details}
                          </button>
                        </td>
                      </tr>
                    ))
                  : assemblies?.items.map((a) => (
                      <tr key={a.id}>
                        <td className="code">{a.code}</td>
                        <td>{a.definitionSnapshot.name}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (a.state === "disassembled" ? "retired" : "")
                            }
                          >
                            {state(a)}
                          </span>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() =>
                              guard(() => {
                                setSelected({ kind: "assembly", id: a.id });
                                setHistoryPage(1);
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
          {!(tab === "definitions"
            ? definitions?.items.length
            : assemblies?.items.length) && (
            <div className="empty">
              <h3>
                {tab === "definitions" ? t.noDefinitions : t.noAssemblies}
              </h3>
              <p>{tab === "definitions" ? t.definitionHelp : t.assemblyHelp}</p>
            </div>
          )}
          {pagination(
            page,
            (tab === "definitions" ? definitions : assemblies)?.hasMore ??
              false,
            setPage,
          )}
        </section>
      )}
      {!loading && definition && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{definition.name}</h2>
              <p>
                {definition.code} · {t.revision} {definition.revision}
              </p>
            </div>
            {session.canWrite && (
              <div className="buttons">
                <button
                  disabled={busy || !!form}
                  onClick={() => begin("definition", undefined, definition)}
                >
                  {t.reviseDefinition}
                </button>
                <button
                  className="primary"
                  disabled={busy || !!form}
                  onClick={() => begin("assembly")}
                >
                  {t.newAssembly}
                </button>
              </div>
            )}
          </div>
          {requirementTable(definition)}
        </section>
      )}
      {!loading && view && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span
                  className={
                    "badge " +
                    (view.assembly.state === "disassembled" ? "retired" : "")
                  }
                >
                  {state(view.assembly)}
                </span>
                <h2>{view.assembly.definitionSnapshot.name}</h2>
                <p>
                  {view.assembly.definitionSnapshot.code} · {t.revision}{" "}
                  {view.assembly.definitionRevision} · {t.version}{" "}
                  {view.assembly.version}
                </p>
              </div>
              {session.canWrite && view.assembly.state !== "disassembled" && (
                <div className="buttons">
                  {view.assembly.state === "draft" && (
                    <>
                      <button
                        disabled={busy || !!form}
                        onClick={() => begin("contents")}
                      >
                        {t.editContents}
                      </button>
                      <button
                        className="primary"
                        disabled={busy || !!form || !view.assessment.complete}
                        onClick={() => begin("action", "complete")}
                      >
                        {t.completeAssembly}
                      </button>
                    </>
                  )}
                  <button
                    disabled={busy || !!form}
                    onClick={() => begin("action", "disassemble")}
                  >
                    {t.disassemble}
                  </button>
                </div>
              )}
            </div>
            {view.assembly.state === "disassembled" && (
              <p className="muted">{t.closedAssembly}</p>
            )}
            {assessmentTable(view)}
          </section>
          <section className="panel">
            <h2>{t.contents}</h2>
            {contentsTable(view.assembly)}
          </section>
        </>
      )}
      {historical && (
        <section className="panel historical">
          <div className="panel-heading">
            <h2>
              {t.historicalContent} · {t.version}{" "}
              {"assembly" in historical
                ? historical.assembly.version
                : historical.revision}
            </h2>
            <button disabled={busy} onClick={() => setHistorical(null)}>
              {t.backCurrent}
            </button>
          </div>
          {"assembly" in historical ? (
            <>
              {assessmentTable(historical)}
              {contentsTable(historical.assembly)}
            </>
          ) : (
            requirementTable(historical)
          )}
        </section>
      )}
      {!loading && history && (
        <section className="panel history">
          <h2>{t.trayHistory}</h2>
          <ol>
            {history.items.map((h) => (
              <li key={h.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {h.action in t ? t[h.action as keyof Text] : h.action}
                  </strong>
                  <time dateTime={h.at}>{date(h.at)}</time>
                  <small>
                    {t.version} {h.version} ·{" "}
                    {session.actors?.[h.actorId] === "operator"
                      ? t.operator
                      : session.actors?.[h.actorId] === "viewer"
                        ? t.viewer
                        : h.actorId}
                  </small>
                  {h.reason && <p>{h.reason}</p>}
                  <button
                    className="text-button"
                    disabled={busy || !!form}
                    onClick={() => void inspect(h.version)}
                  >
                    {t.viewVersion} {h.version}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {pagination(historyPage, history.hasMore, setHistoryPage)}
        </section>
      )}
    </section>
  );
}
