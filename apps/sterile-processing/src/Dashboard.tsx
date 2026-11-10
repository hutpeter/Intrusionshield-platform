import { reviewQueueLabels } from "./review-queue-text";
import { stockLabels } from "./stock-text";
import { consumableAlertLabels } from "./consumable-alert-text";
import { useEffect, useRef, useState } from "react";
import type {
  OperationalDashboard,
  DashboardWorkspace,
  DashboardQueueId,
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
  onOpen: (workspace: DashboardWorkspace, id: string, countId?: string) => void;
  onModule: (workspace: DashboardWorkspace) => void;
}) {
  const t = dashboardLabels(language),
    [value, setValue] = useState<OperationalDashboard | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [nonce, setNonce] = useState(0),
    [pages, setPages] = useState<Partial<Record<DashboardQueueId, number>>>({}),
    [snapshots, setSnapshots] = useState<
      Partial<Record<DashboardQueueId, string>>
    >({}),
    reviewFixtureKey = useRef(crypto.randomUUID()),
    fixtureKey = useRef<string | null>(null),
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
    setPages({});
    setSnapshots({});
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
    return () => {
      c.abort();
      pending.current?.abort();
    };
  }, [session, nonce, onExpired]);
  const prepareExample = async () => {
    if (blocked || loading) return;
    const c = new AbortController();
    pending.current = c;
    setLoading(true);
    setError(false);
    fixtureKey.current ??= crypto.randomUUID();
    try {
      await api.prepareDashboardPaging(session, fixtureKey.current, c.signal);
      if (!c.signal.aborted) {
        fixtureKey.current = null;
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else {
          setError(true);
          setValue(null);
        }
      }
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  };
  const browse = async (id: DashboardQueueId, page: number) => {
    if (blocked || loading) return;
    const c = new AbortController();
    pending.current = c;
    setLoading(true);
    setError(false);
    try {
      const r = await api.dashboardQueue(session, id, page, c.signal);
      if (c.signal.aborted) return;
      setValue((v) =>
        v
          ? { ...v, queues: v.queues.map((q) => (q.id === id ? r.queue : q)) }
          : null,
      );
      setPages((v) => ({ ...v, [id]: page }));
      setSnapshots((v) => ({ ...v, [id]: r.generatedAt }));
    } catch (e) {
      if (!c.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else {
          setError(true);
          setValue(null);
        }
      }
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  };
  async function prepareReviewExample() {
    if (loading || blocked) return;
    const a = new AbortController();
    pending.current = a;
    setLoading(true);
    setError(false);
    try {
      await api.reviewQueueExample(session, reviewFixtureKey.current, a.signal);
      if (!a.signal.aborted) {
        reviewFixtureKey.current = crypto.randomUUID();
        setNonce((n) => n + 1);
      }
    } catch (e) {
      if (!a.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) onExpired();
        else setError(true);
      }
    } finally {
      if (!a.signal.aborted) setLoading(false);
    }
  }
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
      {session.mode === "local-dummy-preview" &&
        session.role === "operator" && (
          <div>
            <button
              disabled={blocked || loading}
              onClick={() => void prepareExample()}
            >
              {t.example}
            </button>
            <p className="muted">{t.exampleNote}</p>
          </div>
        )}

      {session.mode === "local-dummy-preview" && session.canRecall && (
        <div>
          <button
            disabled={blocked || loading}
            onClick={() => void prepareReviewExample()}
          >
            {reviewQueueLabels(language).example}
          </button>
          <p className="muted">{reviewQueueLabels(language).exampleNote}</p>
        </div>
      )}
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
                  <p>
                    {q.id === "stockCountReviews"
                      ? reviewQueueLabels(language).restricted
                      : t.restricted}
                  </p>
                ) : (
                  <>
                    <p className="muted">
                      {t.showing} {q.items.length} {t.of} {q.total} · {t.page}{" "}
                      {pages[q.id] ?? 1}
                    </p>
                    {!q.items.length && <p>{t.empty}</p>}
                    <ul>
                      {q.items.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.code}</strong>
                            {item.stockCountReview && (
                              <>
                                <small>
                                  <strong>
                                    {item.stockCountReview.stale
                                      ? reviewQueueLabels(language).stale
                                      : reviewQueueLabels(language).ready}
                                  </strong>{" "}
                                  · {reviewQueueLabels(language).recorded}:{" "}
                                  {item.stockCountReview.recordedAvailable} ·{" "}
                                  {reviewQueueLabels(language).counted}:{" "}
                                  {item.stockCountReview.countedAvailable} ·{" "}
                                  {reviewQueueLabels(language).difference}:{" "}
                                  {item.stockCountReview.difference} ·{" "}
                                  {reviewQueueLabels(language).current}:{" "}
                                  {item.stockCountReview.currentAvailable ??
                                    "—"}
                                </small>
                                <small>
                                  {reviewQueueLabels(language).reason}:{" "}
                                  {item.stockCountReview.reason} ·{" "}
                                  {reviewQueueLabels(language).reference}:{" "}
                                  {item.stockCountReview.reference}
                                </small>
                              </>
                            )}
                            {item.consumableAlert?.suggestedQuantity !=
                              null && (
                              <small>
                                {consumableAlertLabels(language).targetShort}:{" "}
                                {item.consumableAlert.targetStock} ·{" "}
                                {consumableAlertLabels(language).suggested}:{" "}
                                {item.consumableAlert.suggestedQuantity}
                              </small>
                            )}
                            {item.consumableAlert && (
                              <small>
                                {[
                                  item.consumableAlert.lowStock
                                    ? consumableAlertLabels(language).low
                                    : null,
                                  item.consumableAlert.expiry === "expiring"
                                    ? consumableAlertLabels(language).expiring
                                    : item.consumableAlert.expiry === "expired"
                                      ? consumableAlertLabels(language).expired
                                      : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}{" "}
                                · {consumableAlertLabels(language).available}:{" "}
                                {item.consumableAlert.available} ·{" "}
                                {consumableAlertLabels(language).minimumShort}:{" "}
                                {item.consumableAlert.minimumStock ?? "—"} ·{" "}
                                {consumableAlertLabels(language).expiry}:{" "}
                                {item.consumableAlert.expiresOn}
                              </small>
                            )}
                            <small>
                              {item.consumableAlert &&
                                !item.consumableAlert.stockRecorded && (
                                  <>{stockLabels(language).noReceipt} · </>
                                )}
                              {date(item.updatedAt)}
                              {item.units !== null
                                ? ` · ${t.units}: ${item.units}`
                                : ""}
                            </small>
                          </div>
                          <button
                            disabled={blocked || loading}
                            onClick={() =>
                              onOpen(
                                q.workspace,
                                item.stockCountReview?.lotId ?? item.id,
                                item.stockCountReview?.countId,
                              )
                            }
                          >
                            {t.open}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="muted">
                      {t.asOf}: {date(snapshots[q.id] ?? value.generatedAt)}
                    </p>
                    <div className="pagination">
                      <button
                        disabled={blocked || loading || (pages[q.id] ?? 1) <= 1}
                        onClick={() =>
                          void browse(q.id, (pages[q.id] ?? 1) - 1)
                        }
                      >
                        {t.previous}
                      </button>
                      <span>
                        {t.page} {pages[q.id] ?? 1}
                      </span>
                      <button
                        disabled={
                          blocked ||
                          loading ||
                          (pages[q.id] ?? 1) >= 99999 ||
                          (pages[q.id] ?? 1) * 12 >= q.total!
                        }
                        onClick={() =>
                          void browse(q.id, (pages[q.id] ?? 1) + 1)
                        }
                      >
                        {t.next}
                      </button>
                    </div>
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
