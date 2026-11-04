import { recallLabels } from "./recall-text";
import { distributionLabels } from "./distribution-text";
import { reviewLabels } from "./review-text";
import { cycleLabels } from "./cycle-text";
import { useEffect, useRef, useState } from "react";
import type {
  SterilePackage,
  PackageSummary,
  TrayAssembly,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import { packagingLabels } from "./packaging-text";
const empty = () => ({
  code: "",
  assemblyId: "",
  material: "",
  materialLot: "",
  procedure: "",
  procedureVersion: "",
  sealChecked: false,
  contentsChecked: false,
  confirmed: false,
  reason: "",
});
export function PackagingWorkspace({
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
    p = packagingLabels(language),
    [selected, setSelected] = useState<string | null>(null),
    [rows, setRows] = useState<Page<PackageSummary> | null>(null),
    [detail, setDetail] = useState<SterilePackage | null>(null),
    [past, setPast] = useState<SterilePackage | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null),
    [options, setOptions] = useState<TrayAssembly[]>([]),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [nonce, setNonce] = useState(0),
    [form, setForm] = useState<{
      kind: "pack" | "void";
      requestId: string;
      version?: number;
    } | null>(null),
    [fields, setFields] = useState(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [label, setLabel] = useState(false),
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
    setLabel(false);
    setHistory(null);
    setError(null);
    inspection.current?.abort();
    void (async () => {
      try {
        if (selected) {
          const [d, h] = await Promise.all([
            api.package(session, selected, c.signal),
            api.packageHistory(session, selected, historyPage, c.signal),
          ]);
          if (!c.signal.aborted) {
            setDetail(d);
            setHistory(h);
          }
        } else {
          const [r, a] = await Promise.all([
            api.packages(session, page, c.signal),
            api.allAssemblies(session, c.signal),
          ]);
          if (!c.signal.aborted) {
            setRows(r);
            setOptions(a.filter((a) => a.state === "complete"));
          }
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
  function begin(kind: "pack" | "void") {
    guard(() => {
      setError(null);
      setNotice(false);
      setPast(null);
      setLabel(false);
      setForm({
        kind,
        requestId: crypto.randomUUID(),
        version: detail?.version,
      });
      setFields(empty());
    });
  }
  async function save() {
    if (!form || busy || !session.canWrite || !fields.confirmed) return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    setError(null);
    try {
      let x: SterilePackage;
      if (form.kind === "pack") {
        const a = options.find((a) => a.id === fields.assemblyId);
        if (!a) return;
        x = await api.pack(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            assemblyId: a.id,
            assemblyVersion: a.version,
            material: fields.material,
            materialLot: fields.materialLot,
            procedure: fields.procedure,
            procedureVersion: fields.procedureVersion,
            sealChecked: fields.sealChecked,
            contentsChecked: fields.contentsChecked,
            confirmed: true,
          },
          c.signal,
        );
      } else {
        if (!selected || !form.version) return;
        x = await api.voidPackage(
          session,
          selected,
          {
            requestId: form.requestId,
            version: form.version,
            reason: fields.reason,
            confirmed: true,
          },
          c.signal,
        );
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
      const a = await api.packagingExample(
        session,
        exampleKey.current,
        c.signal,
      );
      if (c.signal.aborted) return;
      setOptions((x) => [a, ...x.filter((i) => i.id !== a.id)]);
      setForm({ kind: "pack", requestId: crypto.randomUUID() });
      setFields({
        ...empty(),
        assemblyId: a.id,
        code: "PACK-DEMO-" + exampleKey.current,
        material: "DEMO-WRAP",
        materialLot: "DEMO-LOT-1",
        procedure: "PACK-DEMO",
        procedureVersion: "1",
      });
      exampleKey.current = crypto.randomUUID();
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
      const x = await api.package(session, selected, c.signal, version);
      if (!c.signal.aborted) {
        setPast(x);
        setLabel(false);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    }
  }
  async function print() {
    if (
      !detail ||
      past ||
      detail.state !== "packaged" ||
      busy ||
      !label ||
      detail.activeLoad?.review?.state === "released"
    )
      return;
    const c = new AbortController();
    pending.current = c;
    setSaving(true);
    try {
      const current = await api.package(session, detail.id, c.signal);
      if (c.signal.aborted) return;
      if (
        current.recall ||
        current.state !== "packaged" ||
        current.version !== detail.version ||
        current.activeLoad?.review?.state === "released"
      ) {
        setDetail(current);
        setLabel(false);
        throw new ApiError(409, "PACKAGING_BLOCKED");
      }
      window.print();
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
  const record = (d: SterilePackage) => (
    <>
      <section className="panel">
        <span className={"badge " + (d.state === "voided" ? "retired" : "")}>
          {p[d.state]}
        </span>
        <h2>{d.assemblySnapshot.definitionSnapshot.name}</h2>
        {d.activeLoad && (
          <p className="readonly-note">
            {cycleLabels(language).title}: {d.activeLoad.loadCode} ·{" "}
            {d.activeLoad.review
              ? reviewLabels(language)[d.activeLoad.review.state]
              : cycleLabels(language)[d.activeLoad.state]}
          </p>
        )}
        {d.distribution && (
          <p className="readonly-note">
            {distributionLabels(language).title}:{" "}
            {distributionLabels(language)[d.distribution.state]} ·{" "}
            {d.distribution.location ?? d.distribution.destination}
          </p>
        )}
        {d.recall && (
          <p className="alert">
            {recallLabels(language).blocked} · {d.recall.caseCode} ·{" "}
            {d.recall.count}
          </p>
        )}
        <dl className="details-grid">
          <div>
            <dt>{p.assembly}</dt>
            <dd>
              {d.assemblySnapshot.code} · {p.version} {d.assemblyVersion}
            </dd>
          </div>
          <div>
            <dt>{p.material}</dt>
            <dd>
              {d.material} · {d.materialLot}
            </dd>
          </div>
          <div>
            <dt>{p.procedure}</dt>
            <dd>
              {d.procedure} · {d.procedureVersion}
            </dd>
          </div>
          <div>
            <dt>{p.packedOn}</dt>
            <dd>
              {date(d.createdAt)} · {actor(d.packedBy)}
            </dd>
          </div>
          <div>
            <dt>{p.items}</dt>
            <dd>{d.assemblySnapshot.instruments.length}</dd>
          </div>
          <div>
            <dt>{p.version}</dt>
            <dd>{d.version}</dd>
          </div>
          {d.voidReason && (
            <div>
              <dt>{p.reason}</dt>
              <dd>{d.voidReason}</dd>
            </div>
          )}
        </dl>
        {d.state === "voided" && <p>{p.voidHelp}</p>}
      </section>
      <section className="panel">
        <h2>{p.items}</h2>
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
              {d.assemblySnapshot.instruments.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>{i.instrumentTypeName}</td>
                  <td>{i.serialNumber || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>{p.proofs}</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t.code}</th>
                <th>{p.episode}</th>
                <th>{p.inspection}</th>
                <th>{p.evidence}</th>
              </tr>
            </thead>
            <tbody>
              {d.inspectionProofs.map((x) => (
                <tr key={x.instrumentId}>
                  <td>
                    {
                      d.assemblySnapshot.instruments.find(
                        (i) => i.id === x.instrumentId,
                      )?.code
                    }
                  </td>
                  <td>
                    {x.episodeCode} · {p.version} {x.episodeVersion}
                  </td>
                  <td>
                    {x.procedure} · {x.procedureVersion}
                    <small>
                      {date(x.at)} · {actor(x.actorId)}
                    </small>
                  </td>
                  <td>{x.evidence}</td>
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
              onClick={() => begin("pack")}
            >
              {p.newPackage}
            </button>
          )}
          {detail && !past && detail.state === "packaged" && (
            <>
              <button
                disabled={busy || !!form}
                onClick={() => setLabel((x) => !x)}
              >
                {label ? p.closeLabel : p.label}
              </button>
              {session.canWrite && (
                <button
                  disabled={busy || !!form || !!detail.activeLoad}
                  onClick={() => begin("void")}
                >
                  {p.void}
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
            <h2>{form.kind === "pack" ? p.newPackage : p.void}</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => guard(() => {})}
            >
              {t.cancel}
            </button>
          </div>
          <fieldset disabled={busy}>
            {form.kind === "pack" ? (
              <>
                <div className="form-grid">
                  <label>
                    {p.assembly}
                    <select
                      aria-label={p.assembly}
                      required
                      value={fields.assemblyId}
                      onChange={(e) => patch({ assemblyId: e.target.value })}
                    >
                      <option value="">{p.choose}</option>
                      {options.map((a) => (
                        <option value={a.id} key={a.id}>
                          {a.code} · {a.definitionSnapshot.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(
                    [
                      "code",
                      "material",
                      "materialLot",
                      "procedure",
                      "procedureVersion",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {p[key]}
                      <input
                        required
                        maxLength={
                          key === "material" || key === "procedure" ? 200 : 100
                        }
                        pattern={
                          key === "code"
                            ? "[A-Za-z0-9][A-Za-z0-9._-]*"
                            : undefined
                        }
                        value={fields[key]}
                        onChange={(e) => patch({ [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={fields.sealChecked}
                    onChange={(e) => patch({ sealChecked: e.target.checked })}
                  />
                  {p.seal}
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={fields.contentsChecked}
                    onChange={(e) =>
                      patch({ contentsChecked: e.target.checked })
                    }
                  />
                  {p.contents}
                </label>
                {!options.length && <p>{p.noAssemblies}</p>}
              </>
            ) : (
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
              {form.kind === "pack" ? p.confirm : p.confirmVoid}
            </label>
          </fieldset>
          <div className="form-footer">
            <button
              className={form.kind === "void" ? "danger" : "primary"}
              disabled={
                busy ||
                !fields.confirmed ||
                (form.kind === "pack" &&
                  (!fields.sealChecked || !fields.contentsChecked))
              }
            >
              {busy ? t.saving : form.kind === "pack" ? p.save : p.saveVoid}
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
                  <th>{p.tray}</th>
                  <th>{t.status}</th>
                  <th>{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.code}</td>
                    <td>{d.trayName}</td>
                    <td>{p[d.state]}</td>
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
          {label && !past && detail.state === "packaged" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>{p.label}</h2>
                {session.canWrite &&
                  !detail.recall &&
                  detail.activeLoad?.review?.state !== "released" && (
                    <button disabled={busy} onClick={() => void print()}>
                      {p.print}
                    </button>
                  )}
              </div>
              <p className="muted">{p.reconcile}</p>
              <section className="package-label" aria-label={p.internalLabel}>
                <strong className="label-warning">{p.notSterile}</strong>
                <p>Ruby · {p.internalLabel}</p>
                <p>{session.facilityName ?? t.facility}</p>
                <h2>{detail.code}</h2>
                <p>{detail.assemblySnapshot.definitionSnapshot.name}</p>
                <p>
                  {p.assembly}: {detail.assemblySnapshot.code}
                </p>
                <p>
                  {p.items}: {detail.assemblySnapshot.instruments.length}
                </p>
                <p>
                  {p.material}: {detail.material} · {detail.materialLot}
                </p>
                <p>
                  {p.procedure}: {detail.procedure} · {detail.procedureVersion}
                </p>
                <p>
                  {p.packedOn}: {date(detail.createdAt)}
                </p>
                <p>
                  {p.packedBy}: {actor(detail.packedBy)}
                </p>
                <p>
                  {p.identifier}: RSP-PACK-1:{detail.id}
                </p>
                <p>
                  {p.version}: {detail.version}
                </p>
                <small>{p.boundary}</small>
              </section>
            </section>
          )}
          {history && (
            <section className="panel history">
              <h2>{p.history}</h2>
              <ol>
                {history.items.map((h) => (
                  <li key={h.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>
                        {h.action === "package-created"
                          ? p.created
                          : p.voidAction}
                      </strong>
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
