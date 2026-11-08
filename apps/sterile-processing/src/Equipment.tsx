import { EquipmentIncidents } from "./EquipmentIncidents";
import { incidentLabels } from "./incident-text";
import { useEffect, useRef, useState } from "react";
import type {
  ProcessingEquipment,
  EquipmentInput,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { equipmentStatus } from "@intrusionshield/sterile-processing/equipment-status";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { equipmentLabels } from "./equipment-text";
const empty = () => ({
  code: "",
  name: "",
  kind: "sterilizer" as ProcessingEquipment["kind"],
  methods: ["steam"] as ProcessingEquipment["methods"],
  manufacturer: "",
  model: "",
  serialNumber: "",
  location: "",
  state: "out_of_service" as ProcessingEquipment["state"],
  lastServicedAt: "",
  serviceDueAt: "",
  serviceReference: "",
  qualificationDueAt: "",
  qualificationReference: "",
  reason: "",
  confirmed: false,
});
export function EquipmentWorkspace({
  session,
  language,
  blocked,
  onExpired,
  onDirty,
  onBusy,
  onRecall,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onExpired: () => void;
  onDirty: (v: boolean) => void;
  onBusy: (v: boolean) => void;
  onRecall: (id: string) => void;
}) {
  const t = equipmentLabels(language),
    c = labels(language),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<ProcessingEquipment | null>(null),
    [past, setPast] = useState<ProcessingEquipment | null>(null),
    [rows, setRows] = useState<Page<ProcessingEquipment> | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState(false),
    [form, setForm] = useState<{
      kind: "register" | "service" | "hold";
      requestId: string;
    } | null>(null),
    [fields, setFields] = useState(empty),
    pending = useRef<AbortController | null>(null);
  const [incidentDirty, setIncidentDirty] = useState(false),
    [incidentBusy, setIncidentBusy] = useState(false),
    [exampleWindow, setExampleWindow] = useState<{
      equipmentId: string;
      from: string;
      to: string;
    } | null>(null);
  const incidentExampleRequest = useRef(crypto.randomUUID());
  const busy = blocked || saving || incidentDirty || incidentBusy,
    canManage = !!session.canReview,
    canHold = session.canWrite || canManage;
  useEffect(() => {
    if (detail && exampleWindow?.equipmentId === detail.id)
      setExampleWindow(null);
  }, [detail, exampleWindow]);
  const fail = (e: unknown) =>
    e instanceof ApiError && e.status === 401 ? onExpired() : setError(e);
  useEffect(() => {
    onDirty(!!form || incidentDirty);
    return () => onDirty(false);
  }, [form, incidentDirty, onDirty]);
  useEffect(() => {
    onBusy(saving || incidentBusy);
    return () => onBusy(false);
  }, [saving, incidentBusy, onBusy]);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    setError(null);
    setPast(null);
    setDetail(null);
    setRows(null);
    setHistory(null);
    void (async () => {
      try {
        if (selected) {
          const [d, h] = await Promise.all([
            api.equipmentRecord(session, selected, a.signal),
            api.equipmentHistory(session, selected, historyPage, a.signal),
          ]);
          if (!a.signal.aborted) {
            setDetail(d);
            setHistory(h);
            setRows(null);
          }
        } else {
          const r = await api.equipment(session, page, a.signal);
          if (!a.signal.aborted) {
            setRows(r);
            setDetail(null);
            setHistory(null);
          }
        }
      } catch (e) {
        if (!a.signal.aborted) fail(e);
      } finally {
        if (!a.signal.aborted) setLoading(false);
      }
    })();
    return () => a.abort();
  }, [session, selected, page, historyPage, nonce]);
  const patch = (v: Partial<typeof fields>) =>
    setFields((x) => ({ ...x, ...v }));
  const date = (at: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(at));
  function begin(kind: "register" | "service" | "hold") {
    setError(null);
    setNotice(false);
    setPast(null);
    setForm({ kind, requestId: crypto.randomUUID() });
    setFields(
      detail
        ? {
            ...detail,
            lastServicedAt: detail.lastServicedAt.slice(0, 16),
            serviceDueAt: detail.serviceDueAt.slice(0, 16),
            qualificationDueAt: detail.qualificationDueAt.slice(0, 16),
            confirmed: false,
          }
        : empty(),
    );
  }
  function example() {
    begin("register");
    const now = Date.now();
    setFields({
      ...empty(),
      code: "EQUIP-DEMO-" + crypto.randomUUID(),
      name: "Fictional demonstration sterilizer",
      manufacturer: "DEMO",
      model: "DEMO",
      serialNumber: "FICTITIOUS-" + crypto.randomUUID(),
      location: "DEMO-STERILE-AREA",
      state: "in_service",
      lastServicedAt: new Date(now - 86400000).toISOString().slice(0, 16),
      serviceDueAt: new Date(now + 30 * 86400000).toISOString().slice(0, 16),
      qualificationDueAt: new Date(now + 365 * 86400000)
        .toISOString()
        .slice(0, 16),
      serviceReference: "SIMULATED-SERVICE-EVIDENCE",
      qualificationReference: "SIMULATED-QUALIFICATION",
      reason: "Fictional equipment demonstration only",
    });
  }
  async function save() {
    if (!form || busy || pending.current || !fields.confirmed) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    setError(null);
    try {
      let item: ProcessingEquipment;
      if (form.kind === "hold") {
        if (!detail) return;
        item = await api.holdEquipment(
          session,
          detail.id,
          {
            requestId: form.requestId,
            version: detail.version,
            reason: fields.reason,
            confirmed: true,
          },
          a.signal,
        );
      } else {
        const values = {
          requestId: form.requestId,
          state: fields.state,
          lastServicedAt: new Date(fields.lastServicedAt + "Z").toISOString(),
          serviceDueAt: new Date(fields.serviceDueAt + "Z").toISOString(),
          serviceReference: fields.serviceReference,
          qualificationDueAt: new Date(
            fields.qualificationDueAt + "Z",
          ).toISOString(),
          qualificationReference: fields.qualificationReference,
          reason: fields.reason,
          confirmed: true,
        };
        if (form.kind === "register") {
          item = await api.registerEquipment(
            session,
            {
              ...values,
              code: fields.code,
              name: fields.name,
              kind: fields.kind,
              methods: fields.methods,
              manufacturer: fields.manufacturer,
              model: fields.model,
              serialNumber: fields.serialNumber,
              location: fields.location,
            } as EquipmentInput,
            a.signal,
          );
        } else {
          if (!detail) return;
          item = await api.serviceEquipment(
            session,
            detail.id,
            { ...values, version: detail.version },
            a.signal,
          );
        }
      }
      if (!a.signal.aborted) {
        setForm(null);
        setSelected(item.id);
        setDetail(item);
        setHistoryPage(1);
        setNotice(true);
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!a.signal.aborted) fail(e);
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  async function inspect(version: number) {
    if (!detail || busy || form) return;
    const a = new AbortController();
    pending.current = a;
    setSaving(true);
    try {
      const r = await api.equipmentRecord(
        session,
        detail.id,
        a.signal,
        version,
      );
      if (!a.signal.aborted) setPast(r);
    } catch (e) {
      if (!a.signal.aborted) fail(e);
    } finally {
      pending.current = null;
      if (!a.signal.aborted) setSaving(false);
    }
  }
  const record = (d: ProcessingEquipment) => (
    <section className="panel">
      <span className="badge">{t[equipmentStatus(d)]}</span>
      <h2>{d.name}</h2>
      <p>
        {d.code} · {c.version} {d.version}
      </p>
      <dl className="details-grid">
        {(
          [
            "kind",
            "manufacturer",
            "model",
            "serialNumber",
            "location",
            "serviceReference",
            "qualificationReference",
            "reason",
          ] as const
        ).map((k) => (
          <div key={k}>
            <dt>{t[k]}</dt>
            <dd>{k === "kind" ? t[d.kind] : d[k]}</dd>
          </div>
        ))}
        {(
          ["lastServicedAt", "serviceDueAt", "qualificationDueAt"] as const
        ).map((k) => (
          <div key={k}>
            <dt>{t[k]}</dt>
            <dd>
              {d[k]} · {date(d[k])}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {t.methods}: {d.methods.map((m) => t[m]).join(", ") || "—"}
      </p>
    </section>
  );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <div className="page-actions">
          <button
            disabled={busy || loading || !!form}
            onClick={() => {
              setSelected(null);
              setNotice(false);
              setNonce((n) => n + 1);
            }}
          >
            {selected ? t.back : c.reload}
          </button>
          {canManage && !selected && (
            <>
              <button
                disabled={busy || loading || !!form}
                onClick={() => begin("register")}
              >
                {t.register}
              </button>
              {session.mode === "local-dummy-preview" && (
                <>
                  <button
                    disabled={busy || loading || !!form}
                    onClick={example}
                  >
                    {t.example}
                  </button>
                  <button
                    disabled={busy || loading || !!form}
                    onClick={async () => {
                      if (pending.current) return;
                      const a = new AbortController();
                      pending.current = a;
                      setSaving(true);
                      setError(null);
                      try {
                        const sample = await api.prepareEquipmentIncident(
                          session,
                          incidentExampleRequest.current,
                          a.signal,
                        );
                        if (!a.signal.aborted) {
                          incidentExampleRequest.current = crypto.randomUUID();
                          setExampleWindow({
                            equipmentId: sample.equipment.id,
                            from: sample.from,
                            to: sample.to,
                          });
                          setSelected(sample.equipment.id);
                          setNonce((n) => n + 1);
                        }
                      } catch (e) {
                        if (!a.signal.aborted) fail(e);
                      } finally {
                        pending.current = null;
                        if (!a.signal.aborted) setSaving(false);
                      }
                    }}
                  >
                    {incidentLabels(language).example}
                  </button>
                </>
              )}
            </>
          )}
          {canManage && detail && !past && (
            <button
              disabled={busy || loading || !!form}
              onClick={() => begin("service")}
            >
              {t.service}
            </button>
          )}
          {canHold && detail?.state === "in_service" && !past && (
            <button
              disabled={busy || loading || !!form}
              onClick={() => begin("hold")}
            >
              {t.hold}
            </button>
          )}
        </div>
      </div>
      <p className="readonly-note">{t.boundary}</p>
      {!!error && (
        <p role="alert" className="alert">
          {error instanceof ApiError && error.code in c
            ? c[error.code as keyof typeof c]
            : c.error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {c.actionSaved}
        </p>
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
            <h2>{t[form.kind]}</h2>
            <button type="button" disabled={busy} onClick={() => setForm(null)}>
              {c.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="form-grid">
              {form.kind === "register" && (
                <>
                  {(
                    [
                      "code",
                      "name",
                      "manufacturer",
                      "model",
                      "serialNumber",
                      "location",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {t[k]}
                      <input
                        required
                        maxLength={
                          k === "code" || k === "serialNumber" ? 100 : 200
                        }
                        value={fields[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  <label>
                    {t.kind}
                    <select
                      aria-label={t.kind}
                      value={fields.kind}
                      onChange={(e) =>
                        patch({
                          kind: e.target.value as typeof fields.kind,
                          methods:
                            e.target.value === "sterilizer" ? ["steam"] : [],
                        })
                      }
                    >
                      <option value="sterilizer">{t.sterilizer}</option>
                      <option value="washer_disinfector">
                        {t.washer_disinfector}
                      </option>
                    </select>
                  </label>
                  {fields.kind === "sterilizer" && (
                    <fieldset>
                      <legend>{t.methods}</legend>
                      {(["steam", "low_temperature", "other"] as const).map(
                        (m) => (
                          <label className="check" key={m}>
                            <input
                              type="checkbox"
                              checked={fields.methods.includes(m)}
                              onChange={(e) =>
                                patch({
                                  methods: e.target.checked
                                    ? [...fields.methods, m]
                                    : fields.methods.filter((x) => x !== m),
                                })
                              }
                            />
                            {t[m]}
                          </label>
                        ),
                      )}
                    </fieldset>
                  )}
                </>
              )}
              {form.kind !== "hold" && (
                <>
                  <label>
                    {t.state}
                    <select
                      aria-label={t.state}
                      value={fields.state}
                      onChange={(e) =>
                        patch({ state: e.target.value as typeof fields.state })
                      }
                    >
                      <option value="out_of_service">{t.out_of_service}</option>
                      <option value="in_service">{t.in_service}</option>
                    </select>
                  </label>
                  {(
                    [
                      "lastServicedAt",
                      "serviceDueAt",
                      "qualificationDueAt",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {t[k]}
                      <input
                        required
                        type="datetime-local"
                        value={fields[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                  {(
                    ["serviceReference", "qualificationReference"] as const
                  ).map((k) => (
                    <label key={k}>
                      {t[k]}
                      <input
                        required
                        maxLength={200}
                        value={fields[k]}
                        onChange={(e) => patch({ [k]: e.target.value })}
                      />
                    </label>
                  ))}
                </>
              )}
              <label>
                {t.reason}
                <input
                  required
                  maxLength={500}
                  value={fields.reason}
                  onChange={(e) => patch({ reason: e.target.value })}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={fields.confirmed}
                onChange={(e) => patch({ confirmed: e.target.checked })}
              />
              {t.confirm}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className="primary"
              disabled={
                busy ||
                !fields.confirmed ||
                (form.kind === "register" &&
                  fields.kind === "sterilizer" &&
                  !fields.methods.length)
              }
            >
              {t.save}
            </button>
          </div>
        </form>
      )}
      {loading && <p role="status">{c.loading}</p>}
      {!loading && rows && (
        <section className="panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.code}</th>
                  <th>{t.kind}</th>
                  <th>{c.status}</th>
                  <th>{c.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((r) => (
                  <tr key={r.id}>
                    <td>{r.code}</td>
                    <td>{t[r.kind]}</td>
                    <td>{t[equipmentStatus(r)]}</td>
                    <td>
                      <button
                        disabled={busy || !!form}
                        onClick={() => {
                          setSelected(r.id);
                          setHistoryPage(1);
                          setNotice(false);
                        }}
                      >
                        {c.details}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              disabled={busy || !!form || page <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              {c.previous}
            </button>
            <span>
              {c.page} {page}
            </span>
            <button
              disabled={busy || !!form || !rows.hasMore}
              onClick={() => setPage((n) => n + 1)}
            >
              {c.next}
            </button>
          </div>
        </section>
      )}
      {!loading && detail && record(past ?? detail)}
      {past && (
        <button disabled={busy} onClick={() => setPast(null)}>
          {c.backCurrent}
        </button>
      )}
      {!loading && detail && !past && (
        <EquipmentIncidents
          key={detail.id}
          equipment={detail}
          session={session}
          language={language}
          blocked={blocked || saving || !!form}
          onExpired={onExpired}
          onDirty={setIncidentDirty}
          onBusy={setIncidentBusy}
          onRecall={onRecall}
          exampleWindow={
            exampleWindow?.equipmentId === detail.id ? exampleWindow : undefined
          }
        />
      )}
      {!loading && history && (
        <section className="panel history">
          <h2>{t.history}</h2>
          <ol>
            {history.items.map((e) => (
              <li key={e.id}>
                <span className="timeline-dot" aria-hidden="true" />
                <div>
                  <strong>
                    {e.action === "equipment-registered"
                      ? t.registered
                      : e.action === "equipment-held"
                        ? t.held
                        : t.serviced}
                  </strong>
                  <time>{date(e.at)}</time>
                  <p>{e.reason}</p>
                  <small>{e.actorId}</small>
                  <button
                    disabled={busy || !!form}
                    onClick={() => void inspect(e.version)}
                  >
                    {c.viewVersion} {e.version}
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="pagination">
            <button
              disabled={busy || !!form || historyPage <= 1}
              onClick={() => setHistoryPage((n) => n - 1)}
            >
              {c.previous}
            </button>
            <span>
              {c.page} {historyPage}
            </span>
            <button
              disabled={busy || !!form || !history.hasMore}
              onClick={() => setHistoryPage((n) => n + 1)}
            >
              {c.next}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
