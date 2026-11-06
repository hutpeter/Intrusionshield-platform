import { useEffect, useRef, useState } from "react";
import type {
  OperationalDashboard,
  DashboardWorkspace,
} from "@intrusionshield/sterile-processing";
import { api, ApiError, type Session } from "./api";
import type { Language } from "./text";
import { dashboardLabels } from "./dashboard-text";
export function Dashboard({
  session,
  language,
  blocked,
  onBusy,
  onExpired,
  onOpen,
  onModule,
}: {
  session: Session;
  language: Language;
  blocked: boolean;
  onBusy: (v: boolean) => void;
  onExpired: () => void;
  onOpen: (workspace: DashboardWorkspace, id: string) => void;
  onModule: (workspace: DashboardWorkspace) => void;
}) {
  const t = dashboardLabels(language),
    [value, setValue] = useState<OperationalDashboard | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [nonce, setNonce] = useState(0),
    pending = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusy(loading);
    return () => onBusy(false);
  }, [loading, onBusy]);
  useEffect(() => {
    const c = new AbortController();
    pending.current = c;
    setLoading(true);
    setError(false);
    setValue(null);
    void api
      .dashboard(session, c.signal)
      .then((v) => {
        if (!c.signal.aborted) setValue(v);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          if (e instanceof ApiError && e.status === 401) onExpired();
          else setError(true);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [session, nonce, onExpired]);
  const date = (d: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: session.timeZone,
    }).format(new Date(d));
  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{session.facilityName}</p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <button
          disabled={blocked || loading}
          onClick={() => setNonce((n) => n + 1)}
        >
          {t.refresh}
        </button>
      </div>
      <p className="readonly-note">{t.note}</p>
      {error && (
        <p className="alert" role="alert">
          {t.error}
        </p>
      )}
      {loading && <p role="status">…</p>}
      {value && (
        <>
          <p>
            {t.asOf}:{" "}
            <time dateTime={value.generatedAt}>{date(value.generatedAt)}</time>
          </p>
          <div className="dashboard-grid">
            {value.queues.map((q) => (
              <section
                className="panel dashboard-queue"
                key={q.id}
                aria-label={t[q.id]}
              >
                <div className="panel-heading">
                  <h2>{t[q.id]}</h2>
                  <strong className="queue-total">{q.total ?? "—"}</strong>
                </div>
                {q.access === "restricted" ? (
                  <p>{t.restricted}</p>
                ) : (
                  <>
                    <p className="muted">
                      {t.showing} {q.items.length} {t.of} {q.total}
                    </p>
                    {!q.items.length && <p>{t.empty}</p>}
                    <ul>
                      {q.items.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.code}</strong>
                            <small>
                              {date(item.updatedAt)}
                              {item.units !== null
                                ? ` · ${t.units}: ${item.units}`
                                : ""}
                            </small>
                          </div>
                          <button
                            disabled={blocked || loading}
                            onClick={() => onOpen(q.workspace, item.id)}
                          >
                            {t.open}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button
                      disabled={blocked || loading}
                      onClick={() => onModule(q.workspace)}
                    >
                      {t.module}
                    </button>
                  </>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
