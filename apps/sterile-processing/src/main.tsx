import { DistributionWorkspace } from "./Distribution";
import { distributionLabels } from "./distribution-text";
import { ReviewWorkspace } from "./Reviews";
import { reviewLabels } from "./review-text";
import { CycleWorkspace } from "./Cycles";
import { cycleLabels } from "./cycle-text";
import { PackagingWorkspace } from "./Packaging";
import { packagingLabels } from "./packaging-text";
import { ProcessingWorkspace } from "./Processing";
import { processingLabels } from "./processing-text";
import { TrayWorkspace } from "./Trays";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Instrument,
  InstrumentType,
  SterileAuditEvent,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session, type Page } from "./api";
import { labels, type Language } from "./text";
import "./style.css";

type Text = ReturnType<typeof labels>;
const emptyFields = () => ({
  code: "",
  name: "",
  manufacturer: "",
  model: "",
  instrumentTypeId: "",
  serialNumber: "",
  reason: "",
  confirmed: false,
});
function errorText(error: unknown, t: Text) {
  return error instanceof ApiError && error.code in t
    ? t[error.code as keyof Text]
    : t.error;
}
function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const value = localStorage.getItem("ruby-sterile-language");
      return value === "en" || value === "fr" ? value : "es";
    } catch {
      return "es";
    }
  });
  const t = labels(language),
    [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null),
    [expired, setExpired] = useState(false),
    [role, setRole] = useState<"operator" | "viewer" | "reviewer">("operator");
  const request = useRef<AbortController | null>(null);
  const boot = useCallback(async () => {
    request.current?.abort();
    const c = new AbortController();
    request.current = c;
    setLoading(true);
    setError(null);
    try {
      const value = await api.session(c.signal);
      if (!c.signal.aborted) setSession(value);
    } catch (e) {
      if (!c.signal.aborted) setError(e);
    } finally {
      if (!c.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    void boot();
    return () => request.current?.abort();
  }, [boot]);
  useEffect(() => {
    document.documentElement.lang = language === "es" ? "es-PE" : language;
    document.title = "Ruby · " + t.product;
    try {
      localStorage.setItem("ruby-sterile-language", language);
    } catch {
      /* Language preferences are optional. */
    }
  }, [language, t.product]);
  const end = useCallback(() => {
    setSession(null);
    setExpired(true);
    void boot();
  }, [boot]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      end();
      return;
    }
    const timer = setTimeout(end, remaining);
    return () => clearTimeout(timer);
  }, [session, end]);
  async function authentication(kind: "login" | "logout") {
    if (!session || request.current) return;
    const c = new AbortController();
    request.current = c;
    setLoading(true);
    setError(null);
    try {
      const value =
        kind === "login"
          ? await api.login(role, session, c.signal)
          : await api.logout(session, c.signal);
      if (!c.signal.aborted) {
        setSession(value);
        setExpired(false);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) {
          end();
          return;
        }
        setError(e);
      }
    } finally {
      if (!c.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  }
  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand" aria-label="Ruby">
          <span className="gem" aria-hidden="true">
            ◆
          </span>
          <strong>ruby</strong>
          <span className="brand-rule" />
          <span>{t.product}</span>
        </div>
        <div className="account">
          <label>
            {t.language}
            <select
              aria-label={t.language}
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          {session?.authenticated && (
            <span className="user">
              {t.signedIn}
              <strong>
                {session.role === "operator"
                  ? t.operator
                  : session.role === "reviewer"
                    ? t.reviewer
                    : t.viewer}
              </strong>
            </span>
          )}
        </div>
      </header>
      <div className="demo-banner">
        <span aria-hidden="true">●</span> {t.demo}
      </div>
      {!!error && (
        <p className="alert global-alert" role="alert">
          {errorText(error, t)}{" "}
          <button onClick={() => void boot()}>{t.tryAgain}</button>
        </p>
      )}
      {session?.authenticated ? (
        <Workspace
          key={session.actorId + ":" + session.facilityId}
          session={session}
          language={language}
          t={t}
          onLogout={() => authentication("logout")}
          onExpired={end}
          blocked={loading}
        />
      ) : (
        <main className="welcome">
          <section className="welcome-copy">
            <p className="eyebrow">RUBY · STERILE PROCESSING</p>
            <h1>{t.subtitle}</h1>
            <p>{t.intro}</p>
            <div className="welcome-line" />
            <p className="muted">{t.notReleased}</p>
          </section>
          <section className="login-card">
            <h2>{t.loginTitle}</h2>
            <p>{t.loginText}</p>
            {expired && (
              <p role="status" className="alert">
                {t.expired}
              </p>
            )}
            <div className="roles">
              {(["operator", "viewer", "reviewer"] as const).map((r) => (
                <button
                  className={"role-card " + (role === r ? "chosen" : "")}
                  key={r}
                  aria-pressed={role === r}
                  disabled={loading}
                  onClick={() => setRole(r)}
                >
                  <strong>
                    {r === "operator"
                      ? t.operator
                      : r === "reviewer"
                        ? t.reviewer
                        : t.viewer}
                  </strong>
                  <span>
                    {r === "operator"
                      ? t.operatorHelp
                      : r === "reviewer"
                        ? t.reviewerHelp
                        : t.viewerHelp}
                  </span>
                </button>
              ))}
            </div>
            <button
              className="primary full"
              disabled={loading || !session}
              onClick={() => void authentication("login")}
            >
              {loading ? t.loading : t.enter}
              <span aria-hidden="true">→</span>
            </button>
          </section>
        </main>
      )}
    </div>
  );
}
function Workspace({
  session,
  language,
  t,
  onLogout,
  onExpired,
  blocked,
}: {
  session: Session;
  blocked: boolean;
  language: Language;
  t: Text;
  onLogout: () => Promise<void>;
  onExpired: () => void;
}) {
  const [tab, setTab] = useState<
      | "instruments"
      | "types"
      | "trays"
      | "processing"
      | "packaging"
      | "cycles"
      | "reviews"
      | "distribution"
    >("instruments"),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [nonce, setNonce] = useState(0);
  const [instruments, setInstruments] = useState<Page<Instrument> | null>(null),
    [types, setTypes] = useState<Page<InstrumentType> | null>(null),
    [options, setOptions] = useState<InstrumentType[]>([]),
    [detail, setDetail] = useState<Instrument | null>(null),
    [history, setHistory] = useState<Page<SterileAuditEvent> | null>(null);
  const [loading, setLoading] = useState(true),
    [saving, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [notice, setNotice] = useState<
      "createdType" | "createdInstrument" | "retiredSuccess" | null
    >(null),
    [filter, setFilter] = useState("");
  const [form, setForm] = useState<{
      kind: "type" | "instrument" | "retire";
      requestId: string;
    } | null>(null),
    [fields, setFields] = useState(emptyFields),
    [discard, setDiscard] = useState<(() => void) | null>(null);
  const [trayDirty, setTrayDirty] = useState(false),
    [trayBusy, setTrayBusy] = useState(false),
    [trayReset, setTrayReset] = useState(0);
  const busy = saving || blocked || trayBusy;
  const pending = useRef<AbortController | null>(null),
    read = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
      read.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    read.current = c;
    setLoading(true);
    setInstruments(null);
    setTypes(null);
    setDetail(null);
    setHistory(null);
    setError(null);
    void (async () => {
      try {
        if (
          tab === "trays" ||
          tab === "processing" ||
          tab === "packaging" ||
          tab === "cycles" ||
          tab === "reviews" ||
          tab === "distribution"
        ) {
          setLoading(false);
          return;
        }
        const all = await api.allTypes(session, c.signal);
        if (c.signal.aborted) return;
        setOptions(all);
        if (selected) {
          const [item, events] = await Promise.all([
            api.instrument(session, selected, c.signal),
            api.history(session, selected, historyPage, c.signal),
          ]);
          if (!c.signal.aborted) {
            setDetail(item);
            setHistory(events);
          }
        } else if (tab === "types") {
          const value = await api.types(session, page, c.signal);
          if (!c.signal.aborted) setTypes(value);
        } else {
          const value = await api.instruments(session, page, c.signal);
          if (!c.signal.aborted) setInstruments(value);
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
  }, [session, tab, page, selected, historyPage, nonce, onExpired]);
  const dirty =
    trayDirty ||
    (!!form &&
      (Object.entries(fields).some(
        ([key, value]) => key !== "confirmed" && !!value,
      ) ||
        fields.confirmed));
  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  useEffect(() => {
    if (discard) document.getElementById("discard-keep")?.focus();
  }, [discard]);

  function clear() {
    setTrayDirty(false);
    setTrayReset((n) => n + 1);
    setForm(null);
    setFields(emptyFields());
    setDiscard(null);
  }
  function guard(action: () => void) {
    if (busy) return;
    if (dirty)
      setDiscard(() => () => {
        clear();
        action();
      });
    else {
      clear();
      action();
    }
  }
  function begin(kind: NonNullable<typeof form>["kind"]) {
    guard(() => {
      setForm({ kind, requestId: crypto.randomUUID() });
      setFields(emptyFields());
      setError(null);
      setNotice(null);
    });
  }
  function navigate(
    target:
      | "instruments"
      | "types"
      | "trays"
      | "processing"
      | "packaging"
      | "cycles"
      | "reviews"
      | "distribution",
  ) {
    guard(() => {
      setSelected(null);
      setTab(target);
      setPage(1);
      setFilter("");
      setNotice(null);
    });
  }
  async function save() {
    if (!form || pending.current) return;
    const c = new AbortController();
    pending.current = c;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (form.kind === "type") {
        await api.createType(
          session,
          {
            requestId: form.requestId,
            code: fields.code,
            name: fields.name,
            manufacturer: fields.manufacturer,
            model: fields.model,
          },
          c.signal,
        );
        if (c.signal.aborted) return;
        setNotice("createdType");
        setTab("types");
        setPage(1);
      } else if (form.kind === "instrument") {
        const item = await api.register(
          session,
          {
            requestId: form.requestId,
            instrumentTypeId: fields.instrumentTypeId,
            code: fields.code,
            serialNumber: fields.serialNumber,
          },
          c.signal,
        );
        if (c.signal.aborted) return;
        setNotice("createdInstrument");
        setSelected(item.id);
        setHistoryPage(1);
      } else {
        if (!detail || !fields.confirmed) return;
        await api.retire(
          session,
          detail.id,
          {
            requestId: form.requestId,
            version: detail.version,
            reason: fields.reason,
          },
          c.signal,
        );
        if (c.signal.aborted) return;
        setNotice("retiredSuccess");
        setHistoryPage(1);
      }
      clear();
      setNonce((n) => n + 1);
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(e);
      }
    } finally {
      pending.current = null;
      if (!c.signal.aborted) setBusy(false);
    }
  }
  const patch = (value: Partial<typeof fields>) =>
    setFields((f) => ({ ...f, ...value }));
  const name = (id: string) => options.find((v) => v.id === id)?.name ?? "—";
  const date = (value: string) =>
    new Intl.DateTimeFormat(
      language === "es" ? "es-PE" : language === "fr" ? "fr-FR" : "en-US",
      {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: session.timeZone ?? "America/Lima",
      },
    ).format(new Date(value));
  const query = filter.trim().toLocaleLowerCase();
  const shownInstruments =
    instruments?.items.filter((i) =>
      (i.code + " " + i.serialNumber + " " + name(i.instrumentTypeId))
        .toLocaleLowerCase()
        .includes(query),
    ) ?? [];
  const shownTypes =
    types?.items.filter((i) =>
      (i.code + " " + i.name + " " + i.manufacturer + " " + i.model)
        .toLocaleLowerCase()
        .includes(query),
    ) ?? [];
  const pagination = (
    n: number,
    more: boolean,
    change: (n: number) => void,
  ) => (
    <div className="pagination">
      <button
        disabled={busy || loading || n <= 1}
        onClick={() =>
          guard(() => {
            setFilter("");
            change(n - 1);
          })
        }
      >
        {t.previous}
      </button>
      <span>
        {t.page} {n}
      </span>
      <button
        disabled={busy || loading || !more}
        onClick={() =>
          guard(() => {
            setFilter("");
            change(n + 1);
          })
        }
      >
        {t.next}
      </button>
    </div>
  );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">STERILE PROCESSING</p>
        <nav aria-label={t.product}>
          <button
            aria-current={
              tab === "instruments" && !selected ? "page" : undefined
            }
            disabled={busy}
            onClick={() => navigate("instruments")}
          >
            <span aria-hidden="true">▤</span>
            {t.instruments}
          </button>
          <button
            aria-current={tab === "types" && !selected ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("types")}
          >
            <span aria-hidden="true">▦</span>
            {t.types}
          </button>
          <button
            aria-current={tab === "trays" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("trays")}
          >
            <span aria-hidden="true">▣</span>
            {t.trays}
          </button>
          <button
            aria-current={tab === "processing" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("processing")}
          >
            <span aria-hidden="true">↻</span>
            {processingLabels(language).title}
          </button>
          <button
            aria-current={tab === "packaging" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("packaging")}
          >
            <span aria-hidden="true">▣</span>
            {packagingLabels(language).title}
          </button>
          <button
            aria-current={tab === "cycles" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("cycles")}
          >
            <span aria-hidden="true">◷</span>
            {cycleLabels(language).title}
          </button>
          <button
            aria-current={tab === "reviews" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("reviews")}
          >
            <span aria-hidden="true">✓</span>
            {reviewLabels(language).title}
          </button>
          <button
            aria-current={tab === "distribution" ? "page" : undefined}
            disabled={busy}
            onClick={() => navigate("distribution")}
          >
            <span aria-hidden="true">↗</span>
            {distributionLabels(language).title}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <p>{t.facility}</p>
          <button
            disabled={busy}
            onClick={() =>
              guard(() => {
                void onLogout();
              })
            }
          >
            {t.signOut} <span aria-hidden="true">↗</span>
          </button>
        </div>
      </aside>
      <main className="content">
        {tab !== "trays" &&
          tab !== "processing" &&
          tab !== "packaging" &&
          tab !== "cycles" &&
          tab !== "reviews" &&
          tab !== "distribution" && (
            <div className="page-heading">
              <div>
                <p className="eyebrow">{t.facility}</p>
                <h1>
                  {selected
                    ? (detail?.code ?? t.instruments)
                    : tab === "types"
                      ? t.types
                      : t.instruments}
                </h1>
                <p>
                  {selected
                    ? t.notReleased
                    : tab === "types"
                      ? t.typeHelp
                      : t.instrumentHelp}
                </p>
              </div>
              <div className="page-actions">
                {selected ? (
                  <button
                    aria-label={t.back}
                    disabled={busy}
                    onClick={() =>
                      guard(() => {
                        setSelected(null);
                        setNotice(null);
                      })
                    }
                  >
                    ← {t.back}
                  </button>
                ) : (
                  <button
                    disabled={busy || loading}
                    onClick={() => guard(() => setNonce((n) => n + 1))}
                  >
                    {t.reload}
                  </button>
                )}
                {session.canWrite && !selected && (
                  <button
                    aria-label={tab === "types" ? t.newType : t.newInstrument}
                    className="primary"
                    disabled={busy || loading || !!form}
                    onClick={() =>
                      begin(tab === "types" ? "type" : "instrument")
                    }
                  >
                    ＋ {tab === "types" ? t.newType : t.newInstrument}
                  </button>
                )}
              </div>
            </div>
          )}
        {session.role === "viewer" && (
          <p className="readonly-note">{t.viewerNotice}</p>
        )}
        {notice && (
          <p className="success" role="status">
            ✓ {t[notice]}
          </p>
        )}
        {!!error && (
          <p className="alert" role="alert">
            {errorText(error, t)}
            <span className="error-help">{t.error}</span>
          </p>
        )}
        {discard && (
          <section
            className="discard"
            role="alertdialog"
            aria-modal="false"
            aria-label={t.discard}
          >
            <p>{t.discard}</p>
            <div className="buttons">
              <button className="danger" onClick={() => discard()}>
                {t.discardYes}
              </button>
              <button id="discard-keep" onClick={() => setDiscard(null)}>
                {t.keep}
              </button>
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
                {form.kind === "type"
                  ? t.newType
                  : form.kind === "instrument"
                    ? t.newInstrument
                    : t.retireTitle}
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
              {form.kind === "retire" ? (
                <>
                  <p>{t.retireHelp}</p>
                  <label>
                    {t.retireReason}
                    <textarea
                      required
                      maxLength={500}
                      value={fields.reason}
                      onChange={(e) => patch({ reason: e.target.value })}
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={fields.confirmed}
                      onChange={(e) => patch({ confirmed: e.target.checked })}
                    />
                    {t.retireConfirm}
                  </label>
                </>
              ) : (
                <>
                  <div className="form-grid">
                    <label>
                      {t.code}
                      <input
                        autoFocus
                        required
                        maxLength={100}
                        pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                        autoComplete="off"
                        value={fields.code}
                        onChange={(e) => patch({ code: e.target.value })}
                      />
                      <small>{t.codeHelp}</small>
                    </label>
                    {form.kind === "type" ? (
                      <label>
                        {t.name}
                        <input
                          required
                          maxLength={200}
                          value={fields.name}
                          onChange={(e) => patch({ name: e.target.value })}
                        />
                      </label>
                    ) : (
                      <label>
                        {t.type}
                        <select
                          aria-label={t.type}
                          required
                          value={fields.instrumentTypeId}
                          onChange={(e) =>
                            patch({ instrumentTypeId: e.target.value })
                          }
                        >
                          <option value="">{t.chooseType}</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} · {o.code}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {form.kind === "type" ? (
                      <>
                        <label>
                          {t.manufacturerOptional}
                          <input
                            maxLength={200}
                            value={fields.manufacturer}
                            onChange={(e) =>
                              patch({ manufacturer: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          {t.modelOptional}
                          <input
                            maxLength={200}
                            value={fields.model}
                            onChange={(e) => patch({ model: e.target.value })}
                          />
                        </label>
                      </>
                    ) : (
                      <label>
                        {t.serialOptional}
                        <input
                          maxLength={200}
                          value={fields.serialNumber}
                          onChange={(e) =>
                            patch({ serialNumber: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {form.kind === "instrument" && !options.length && (
                    <p className="muted">
                      {t.firstType}{" "}
                      <button type="button" onClick={() => begin("type")}>
                        {t.newType}
                      </button>
                    </p>
                  )}
                </>
              )}
            </fieldset>
            <div className="form-footer">
              <button
                className={form.kind === "retire" ? "danger" : "primary"}
                disabled={
                  busy ||
                  (form.kind === "retire" &&
                    (!fields.confirmed || !fields.reason.trim())) ||
                  (form.kind === "instrument" && !options.length)
                }
              >
                {busy
                  ? t.saving
                  : form.kind === "type"
                    ? t.saveType
                    : form.kind === "instrument"
                      ? t.saveInstrument
                      : t.confirmRetire}
              </button>
            </div>
          </form>
        )}
        {tab === "distribution" && (
          <DistributionWorkspace
            key={trayReset}
            session={session}
            language={language}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {tab === "reviews" && (
          <ReviewWorkspace
            key={trayReset}
            session={session}
            language={language}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {tab === "cycles" && (
          <CycleWorkspace
            key={trayReset}
            session={session}
            language={language}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {tab === "packaging" && (
          <PackagingWorkspace
            key={trayReset}
            session={session}
            language={language}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {tab === "processing" && (
          <ProcessingWorkspace
            key={trayReset}
            session={session}
            language={language}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {tab === "trays" && (
          <TrayWorkspace
            key={trayReset}
            session={session}
            language={language}
            t={t}
            blocked={blocked}
            onExpired={onExpired}
            onDirty={setTrayDirty}
            onBusy={setTrayBusy}
          />
        )}
        {loading && (
          <p className="loading" role="status">
            {t.loading}
          </p>
        )}
        {!loading && selected && detail && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span
                    className={
                      "badge " + (detail.state === "retired" ? "retired" : "")
                    }
                  >
                    {detail.state === "retired" ? t.retired : t.recorded}
                  </span>
                  <h2>{name(detail.instrumentTypeId)}</h2>
                </div>
                {session.canWrite && detail.state === "registered" && (
                  <button
                    disabled={
                      busy ||
                      !!form ||
                      !!detail.activeAssembly ||
                      !!detail.processingHold
                    }
                    onClick={() => begin("retire")}
                  >
                    {t.retire}
                  </button>
                )}
              </div>
              <dl className="details">
                <div>
                  <dt>{t.code}</dt>
                  <dd>{detail.code}</dd>
                </div>
                <div>
                  <dt>{t.serial}</dt>
                  <dd>{detail.serialNumber || "—"}</dd>
                </div>
                <div>
                  <dt>{t.registeredOn}</dt>
                  <dd>{date(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt>{t.updatedOn}</dt>
                  <dd>{date(detail.updatedAt)}</dd>
                </div>
                {detail.processingHold && (
                  <div>
                    <dt>{processingLabels(language).held}</dt>
                    <dd>{detail.processingHold.episodeCode}</dd>
                  </div>
                )}
                {detail.activeAssembly && (
                  <div>
                    <dt>{t.assignment}</dt>
                    <dd>{detail.activeAssembly.assemblyCode}</dd>
                  </div>
                )}
                {detail.retiredAt && (
                  <>
                    <div>
                      <dt>{t.retiredOn}</dt>
                      <dd>{date(detail.retiredAt)}</dd>
                    </div>
                    <div>
                      <dt>{t.retireReason}</dt>
                      <dd>{detail.retirementReason}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
            <section className="panel history">
              <h2>{t.history}</h2>
              {history?.items.length ? (
                <ol>
                  {history.items.map((event) => (
                    <li key={event.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>
                          {event.action === "instrument-retired"
                            ? t.instrumentRetired
                            : event.action === "type-created"
                              ? t.typeCreated
                              : t.instrumentRegistered}
                        </strong>
                        <time dateTime={event.at}>{date(event.at)}</time>
                        <small>
                          {session.actors?.[event.actorId] === "operator"
                            ? t.operator
                            : session.actors?.[event.actorId] === "viewer"
                              ? t.viewer
                              : event.actorId}
                        </small>
                        {event.reason && <p>{event.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">{t.noHistory}</p>
              )}
              {history &&
                pagination(historyPage, history.hasMore, setHistoryPage)}
            </section>
          </>
        )}
        {!loading && !selected && (types || instruments) && (
          <section className="panel list-panel">
            <div className="list-toolbar">
              <h2>{tab === "types" ? t.types : t.instruments}</h2>
              <label className="filter">
                {t.filter}
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </label>
            </div>
            {(
              tab === "types" ? types?.items.length : instruments?.items.length
            ) ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.code}</th>
                      <th>{tab === "types" ? t.name : t.type}</th>
                      <th>{tab === "types" ? t.manufacturer : t.status}</th>
                      <th>{tab === "types" ? t.model : t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tab === "types"
                      ? shownTypes.map((i) => (
                          <tr key={i.id}>
                            <td className="code">{i.code}</td>
                            <td>{i.name}</td>
                            <td>{i.manufacturer || "—"}</td>
                            <td>{i.model || "—"}</td>
                          </tr>
                        ))
                      : shownInstruments.map((i) => (
                          <tr key={i.id}>
                            <td className="code">{i.code}</td>
                            <td>
                              {name(i.instrumentTypeId)}
                              {i.serialNumber && (
                                <small className="serial">
                                  {i.serialNumber}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                className={
                                  "badge " +
                                  (i.state === "retired" ? "retired" : "")
                                }
                              >
                                {i.state === "retired" ? t.retired : t.recorded}
                              </span>
                            </td>
                            <td>
                              <button
                                className="text-button"
                                disabled={busy}
                                onClick={() =>
                                  guard(() => {
                                    setSelected(i.id);
                                    setHistoryPage(1);
                                    setNotice(null);
                                  })
                                }
                              >
                                {t.details} →
                              </button>
                            </td>
                          </tr>
                        ))}
                  </tbody>
                </table>
                {!(tab === "types"
                  ? shownTypes.length
                  : shownInstruments.length) && (
                  <p className="empty-filter">{t.noMatches}</p>
                )}
              </div>
            ) : (
              <div className="empty">
                <span aria-hidden="true">◇</span>
                <h3>{tab === "types" ? t.noTypes : t.noInstruments}</h3>
                <p>{tab === "types" ? t.firstType : t.firstInstrument}</p>
                {session.canWrite && !form && (
                  <button
                    className="primary"
                    onClick={() =>
                      begin(tab === "types" ? "type" : "instrument")
                    }
                  >
                    {tab === "types" ? t.newType : t.newInstrument}
                  </button>
                )}
              </div>
            )}
            {pagination(
              page,
              (tab === "types" ? types : instruments)?.hasMore ?? false,
              setPage,
            )}
          </section>
        )}
        <footer className="content-footer">
          <span>Ruby · Sterile Processing</span>
          <span>{t.demo}</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
