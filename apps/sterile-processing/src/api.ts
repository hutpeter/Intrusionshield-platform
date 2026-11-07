import type {
  TraceReport,
  LoanerRecord,
  LoanerSummary,
  LoanerInput,
  LoanerReturnInput,
  ServicePolicyInput,
  ServiceUsage,
  OperationalDashboard,
  DashboardQueuePage,
  DashboardQueueId,
  TraceMatch,
  TraceRootKind,
  ProcessingEpisode,
  InspectInput,
  SterilePackage,
  PackageSummary,
  PackageInput,
  SterilizationLoad,
  LoadReview,
  ReviewSummary,
  ReviewQueueItem,
  ReviewInput,
  ReturnRecord,
  ReturnSummary,
  ReturnInput,
  ScannedReturnInput,
  PartialReturnInput,
  ReturnRecoveryInput,
  ReturnScanResult,
  ReturnDispositionInput,
  RecallClearanceInput,
  RecallAdmissionInput,
  RecallAdmissionPlan,
  RecallImpact,
  RecallExtensionInput,
  RecallRecord,
  RecallSummary,
  RecallInput,
  DistributionRecord,
  DistributionSummary,
  StoreInput,
  IssueInput,
  LoadSummary,
  LoadInput,
  CycleResultInput,
  ReceiveInput,
  ScannedReceiveInput,
  StartCleaningInput,
  FinishCleaningInput,
  Instrument,
  InstrumentType,
  SterileAuditEvent,
  TrayDefinition,
  TrayAssembly,
  AssemblyView,
  TrayDefinitionInput,
  TrayDefinitionRevisionInput,
} from "@intrusionshield/sterile-processing";
export interface Session {
  mode: "local-dummy-preview";
  authenticated: boolean;
  csrf: string;
  expiresAt: number;
  role?: "operator" | "viewer" | "reviewer";
  tenantId?: string;
  actorId?: string;
  facilityId?: string;
  facilityName?: string;
  timeZone?: string;
  actors?: Record<string, "operator" | "viewer" | "reviewer">;
  canWrite?: boolean;
  canReview?: boolean;
  canRecall?: boolean;
  canClearRecall?: boolean;
  canAdmitRecall?: boolean;
  canRecover?: boolean;
  canReturn?: boolean;
  canDisposeReturn?: boolean;
}
export interface Page<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export async function call<T>(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  csrf?: string,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "x-sterile-csrf": csrf ?? "" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    let code = "SERVICE_UNAVAILABLE";
    try {
      const value = await response.json();
      if (typeof value.error === "string") code = value.error;
    } catch {
      /* No unsafe server body is displayed. */
    }
    throw new ApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}
function base(session: Session) {
  if (!session.authenticated || !session.facilityId)
    throw new ApiError(401, "UNAUTHENTICATED");
  return "/api/v1/sterile/facilities/" + encodeURIComponent(session.facilityId);
}
async function page<T>(
  path: string,
  n: number,
  signal: AbortSignal,
): Promise<Page<T>> {
  const value = await call<Page<T>>(path + "?page=" + n, signal);
  if (
    !value ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    value.page !== n ||
    typeof value.hasMore !== "boolean"
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return value;
}
async function checkedSession(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  csrf?: string,
): Promise<Session> {
  const value = await call<Session>(path, signal, body, csrf);
  if (
    !value ||
    value.mode !== "local-dummy-preview" ||
    typeof value.authenticated !== "boolean" ||
    typeof value.csrf !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.csrf) ||
    !Number.isFinite(value.expiresAt) ||
    (value.authenticated &&
      (!value.tenantId ||
        !value.facilityId ||
        !value.actorId ||
        !["operator", "viewer", "reviewer"].includes(value.role ?? "") ||
        typeof value.canWrite !== "boolean" ||
        (value.role === "reviewer" &&
          (value.canReview !== true || value.canWrite !== false))))
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return value;
}
async function scoped<T extends { tenantId: string; facilityId: string }>(
  s: Session,
  promise: Promise<T>,
): Promise<T> {
  const value = await promise;
  if (
    !value ||
    value.tenantId !== s.tenantId ||
    value.facilityId !== s.facilityId
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return value;
}
async function scopedPage<T extends { tenantId: string; facilityId: string }>(
  s: Session,
  path: string,
  n: number,
  signal: AbortSignal,
): Promise<Page<T>> {
  const value = await page<T>(path, n, signal);
  if (
    value.items.some(
      (item) =>
        !item ||
        item.tenantId !== s.tenantId ||
        item.facilityId !== s.facilityId,
    )
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return value;
}
async function checkedPackage(s: Session, promise: Promise<SterilePackage>) {
  const x = await scoped(s, promise);
  if (
    !x.assemblySnapshot ||
    x.assemblySnapshot.tenantId !== s.tenantId ||
    x.assemblySnapshot.facilityId !== s.facilityId ||
    x.assemblySnapshot.id !== x.assemblyId ||
    x.assemblySnapshot.version !== x.assemblyVersion ||
    !Array.isArray(x.inspectionProofs)
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return x;
}
async function checkedReview(s: Session, promise: Promise<LoadReview>) {
  const r = await scoped(s, promise);
  if (
    !r.loadSnapshot ||
    r.loadSnapshot.tenantId !== s.tenantId ||
    r.loadSnapshot.facilityId !== s.facilityId ||
    r.loadSnapshot.id !== r.loadId ||
    r.loadSnapshot.version !== r.loadVersion ||
    !Array.isArray(r.decisions)
  )
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return r;
}
async function checkedMovement(
  s: Session,
  promise: Promise<DistributionRecord>,
) {
  const r = await scoped(s, promise);
  if (!Array.isArray(r.events) || !r.events.length || r.events.length > 200)
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  return r;
}
export interface DistributionScanResult {
  tenantId: string;
  facilityId: string;
  package: PackageSummary;
  distribution: DistributionRecord | null;
}
export const api = {
  prepareDashboardPaging: (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<{ tenantId: string; facilityId: string; created: number }>(
        "/preview/dashboard-paging-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  loaners: (s: Session, page: number, signal: AbortSignal) =>
    scopedPage<LoanerSummary>(s, base(s) + "/loaners", page, signal),
  loaner: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    scoped(
      s,
      call<LoanerRecord>(
        base(s) +
          "/loaners/" +
          id +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  loanerHistory: (s: Session, id: string, page: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/loaners/" + id + "/history",
      page,
      signal,
    ),
  receiveLoaner: (s: Session, body: LoanerInput, signal: AbortSignal) =>
    scoped(s, call<LoanerRecord>(base(s) + "/loaners", signal, body, s.csrf)),
  returnLoaner: (
    s: Session,
    id: string,
    body: LoanerReturnInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<LoanerRecord>(
        base(s) + "/loaners/" + id + "/return",
        signal,
        body,
        s.csrf,
      ),
    ),
  prepareLoaner: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<InstrumentType>(
        "/preview/loaner-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  dashboardQueue: async (
    s: Session,
    id: DashboardQueueId,
    page: number,
    signal: AbortSignal,
  ) => {
    const r = await scoped(
      s,
      call<DashboardQueuePage>(
        base(s) + "/dashboard/queues/" + id + "?page=" + page,
        signal,
      ),
    );
    const workspaces = {
      cleaning: "processing",
      inspection: "processing",
      assembly: "trays",
      loading: "packaging",
      release: "reviews",
      returns: "returns",
      recall: "recalls",
      maintenance: "instruments",
    };
    const q = r.queue;
    if (
      r.page !== page ||
      r.limit !== 12 ||
      !Number.isFinite(Date.parse(r.generatedAt)) ||
      !q ||
      q.id !== id ||
      q.workspace !== workspaces[id] ||
      q.access !== "allowed" ||
      !Number.isSafeInteger(q.total) ||
      q.total < 0 ||
      !Array.isArray(q.items) ||
      q.items.length > 12 ||
      (q.items.length > 0 && (page - 1) * 12 + q.items.length > q.total) ||
      q.items.some(
        (i) =>
          typeof i.id !== "string" ||
          typeof i.code !== "string" ||
          !Number.isFinite(Date.parse(i.updatedAt)),
      )
    )
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    return r;
  },
  dashboard: async (s: Session, signal: AbortSignal) => {
    const r = await scoped(
      s,
      call<OperationalDashboard>(base(s) + "/dashboard", signal),
    );
    const ids = [
      "cleaning",
      "inspection",
      "assembly",
      "loading",
      "release",
      "returns",
      "recall",
      "maintenance",
    ];
    const workspaces = {
      cleaning: "processing",
      inspection: "processing",
      assembly: "trays",
      loading: "packaging",
      release: "reviews",
      returns: "returns",
      recall: "recalls",
      maintenance: "instruments",
    };
    if (
      r.limit !== 12 ||
      !Number.isFinite(Date.parse(r.generatedAt)) ||
      !Array.isArray(r.queues) ||
      r.queues.length !== 8 ||
      new Set(r.queues.map((q) => q.id)).size !== 8 ||
      r.queues.some(
        (q) =>
          !ids.includes(q.id) ||
          q.workspace !== workspaces[q.id] ||
          !Array.isArray(q.items) ||
          q.items.length > 12 ||
          (q.access === "restricted"
            ? q.total !== null || q.items.length !== 0
            : q.access !== "allowed" ||
              !Number.isSafeInteger(q.total) ||
              q.total! < 0 ||
              q.total! < q.items.length) ||
          q.items.some(
            (i) =>
              typeof i.id !== "string" ||
              typeof i.code !== "string" ||
              !Number.isFinite(Date.parse(i.updatedAt)),
          ),
      )
    )
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    return r;
  },

  scanReturn: async (s: Session, identifier: string, signal: AbortSignal) => {
    const r = await scoped(
      s,
      call<ReturnScanResult>(
        base(s) + "/returns/scan?identifier=" + encodeURIComponent(identifier),
        signal,
      ),
    );
    await scoped(s, Promise.resolve(r.issue));
    return r;
  },
  createPartialReturn: (
    s: Session,
    body: PartialReturnInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ReturnRecord>(base(s) + "/returns/partial", signal, body, s.csrf),
    ),
  recoverMissingReturn: (
    s: Session,
    id: string,
    body: ReturnRecoveryInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ReturnRecord>(
        base(s) + "/returns/" + id + "/receive-missing",
        signal,
        body,
        s.csrf,
      ),
    ),
  createScannedReturn: (
    s: Session,
    body: ScannedReturnInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ReturnRecord>(base(s) + "/returns/scanned", signal, body, s.csrf),
    ),
  prepareReturnScan: async (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) => {
    const r = await scoped(
      s,
      call<ReturnScanResult>(
        "/preview/return-scan-example",
        signal,
        { requestId },
        s.csrf,
      ),
    );
    await scoped(s, Promise.resolve(r.issue));
    return r;
  },

  scanDistribution: async (
    s: Session,
    identifier: string,
    signal: AbortSignal,
  ) => {
    const r = await scoped(
      s,
      call<DistributionScanResult>(
        base(s) +
          "/distribution-scan?identifier=" +
          encodeURIComponent(identifier),
        signal,
      ),
    );
    await scoped(s, Promise.resolve(r.package));
    if (r.distribution) await scoped(s, Promise.resolve(r.distribution));
    return r;
  },
  prepareDistributionScan: (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilePackage>(
        "/preview/distribution-scan-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),

  prepareLoadScan: async (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) => {
    const r = await call<{ load: SterilizationLoad; package: SterilePackage }>(
      "/preview/load-scan-example",
      signal,
      { requestId },
      s.csrf,
    );
    await scoped(s, Promise.resolve(r.load));
    await scoped(s, Promise.resolve(r.package));
    return r;
  },

  scanPackage: (s: Session, identifier: string, signal: AbortSignal) =>
    scoped(
      s,
      call<SterilePackage>(
        base(s) + "/package-scan?identifier=" + encodeURIComponent(identifier),
        signal,
      ),
    ),
  addLoadScan: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      identifier: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) + "/loads/" + encodeURIComponent(id) + "/scan",
        signal,
        body,
        s.csrf,
      ),
    ),

  prepareReceivingScan: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<Instrument>(
        "/preview/receiving-scan-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),

  receiveScanned: (
    s: Session,
    body: ScannedReceiveInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        base(s) + "/processing/scanned-receipts",
        signal,
        body,
        s.csrf,
      ),
    ),

  prepareTrayScan: async (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) => {
    const r = await call<{ assembly: TrayAssembly; instrument: Instrument }>(
      "/preview/tray-scan-example",
      signal,
      { requestId },
      s.csrf,
    );
    await scoped(s, Promise.resolve(r.assembly));
    await scoped(s, Promise.resolve(r.instrument));
    return r;
  },

  addTrayScan: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      identifier: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayAssembly>(
        base(s) + "/tray-assemblies/" + encodeURIComponent(id) + "/scan",
        signal,
        body,
        s.csrf,
      ),
    ),

  prepareScan: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<Instrument>("/preview/scan-example", signal, { requestId }, s.csrf),
    ),

  scanInstrument: (s: Session, identifier: string, signal: AbortSignal) =>
    scoped(
      s,
      call<Instrument>(
        base(s) +
          "/instrument-scan?identifier=" +
          encodeURIComponent(identifier),
        signal,
      ),
    ),

  servicePolicy: (
    s: Session,
    id: string,
    body: ServicePolicyInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ServiceUsage>(
        base(s) + "/instruments/" + id + "/service-policy",
        signal,
        body,
        s.csrf,
      ),
    ),
  prepareServiceThreshold: (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<Instrument>(
        "/preview/service-threshold-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  prepareMaintenance: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<Instrument>(
        "/preview/maintenance-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),

  maintenance: (
    s: Session,
    id: string,
    step: "report" | "assess" | "repair" | "authorize",
    body: Record<string, unknown>,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<Instrument>(
        base(s) +
          "/instruments/" +
          encodeURIComponent(id) +
          "/maintenance/" +
          step,
        signal,
        body,
        s.csrf,
      ),
    ),

  traceSearch: (s: Session, code: string, signal: AbortSignal) =>
    scoped(
      s,
      call<{ tenantId: string; facilityId: string; matches: TraceMatch[] }>(
        base(s) + "/traceability?code=" + encodeURIComponent(code),
        signal,
      ),
    ),
  traceReport: (
    s: Session,
    kind: TraceRootKind,
    id: string,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TraceReport>(
        base(s) +
          "/traceability/" +
          encodeURIComponent(kind) +
          "/" +
          encodeURIComponent(id),
        signal,
      ),
    ),

  returns: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<ReturnSummary>(s, base(s) + "/returns", n, signal),
  returned: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    scoped(
      s,
      call<ReturnRecord>(
        base(s) +
          "/returns/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  createReturn: (s: Session, body: ReturnInput, signal: AbortSignal) =>
    scoped(s, call<ReturnRecord>(base(s) + "/returns", signal, body, s.csrf)),
  disposeReturn: (
    s: Session,
    id: string,
    body: ReturnDispositionInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ReturnRecord>(
        base(s) + "/returns/" + encodeURIComponent(id) + "/dispose",
        signal,
        body,
        s.csrf,
      ),
    ),
  returnHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/returns/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  returnExample: (s: Session, requestId: string, signal: AbortSignal) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        "/preview/return-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  async allDistribution(s: Session, signal: AbortSignal) {
    const rows: DistributionSummary[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.distribution(s, n, signal);
      rows.push(...p.items);
      if (!p.hasMore) return rows;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  clearRecall: (
    s: Session,
    id: string,
    body: RecallClearanceInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/clear",
        signal,
        body,
        s.csrf,
      ),
    ),
  recallAdmissionPlan: (s: Session, id: string, signal: AbortSignal) =>
    scoped(
      s,
      call<RecallAdmissionPlan>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/admission-plan",
        signal,
      ),
    ),
  admitRecall: (
    s: Session,
    id: string,
    body: RecallAdmissionInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/admit",
        signal,
        body,
        s.csrf,
      ),
    ),
  recallClearanceExample: (
    s: Session,
    requestId: string,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        "/preview/recall-clearance-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  recallImpact: (
    s: Session,
    sourceKind: "load" | "package",
    sourceId: string,
    sourceVersion: number,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallImpact>(
        base(s) +
          "/recalls/impact?sourceKind=" +
          sourceKind +
          "&sourceId=" +
          encodeURIComponent(sourceId) +
          "&sourceVersion=" +
          sourceVersion,
        signal,
      ),
    ),
  recallCaseImpact: (s: Session, id: string, signal: AbortSignal) =>
    scoped(
      s,
      call<RecallImpact>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/impact",
        signal,
      ),
    ),
  extendRecall: (
    s: Session,
    id: string,
    body: RecallExtensionInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/extend",
        signal,
        body,
        s.csrf,
      ),
    ),
  lineageRecallExample: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<{
        tenantId: string;
        facilityId: string;
        sourcePackage: { id: string; code: string; version: number };
        descendantPackage: { id: string; code: string; version: number };
      }>("/preview/lineage-recall-example", signal, { requestId }, s.csrf),
    ),
  recalls: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<RecallSummary>(s, base(s) + "/recalls", n, signal),
  recall: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) +
          "/recalls/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  createRecall: (s: Session, body: RecallInput, signal: AbortSignal) =>
    scoped(s, call<RecallRecord>(base(s) + "/recalls", signal, body, s.csrf)),
  recoverRecall: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      packageId: string;
      location: string;
      reference: string;
      note: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/recover",
        signal,
        body,
        s.csrf,
      ),
    ),
  disposeRecall: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      packageId: string;
      action: "quarantine" | "reprocess_required" | "discard_recorded";
      reason: string;
      reference: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<RecallRecord>(
        base(s) + "/recalls/" + encodeURIComponent(id) + "/dispose",
        signal,
        body,
        s.csrf,
      ),
    ),
  recallHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/recalls/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  recallExample: (s: Session, requestId: string, signal: AbortSignal) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        "/preview/recall-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  async allLoads(s: Session, signal: AbortSignal) {
    const rows: LoadSummary[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.loads(s, n, signal);
      rows.push(...p.items);
      if (!p.hasMore) return rows;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  distribution: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<DistributionSummary>(s, base(s) + "/distribution", n, signal),
  movement: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        base(s) +
          "/distribution/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  storePackage: (s: Session, body: StoreInput, signal: AbortSignal) =>
    checkedMovement(
      s,
      call<DistributionRecord>(base(s) + "/distribution", signal, body, s.csrf),
    ),
  transferPackage: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      location: string;
      reference: string;
      reason: string;
      integrityChecked: boolean;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        base(s) + "/distribution/" + encodeURIComponent(id) + "/transfer",
        signal,
        body,
        s.csrf,
      ),
    ),
  issuePackage: (
    s: Session,
    id: string,
    body: IssueInput,
    signal: AbortSignal,
  ) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        base(s) + "/distribution/" + encodeURIComponent(id) + "/issue",
        signal,
        body,
        s.csrf,
      ),
    ),
  movementHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/distribution/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  distributionExample: (s: Session, requestId: string, signal: AbortSignal) =>
    checkedMovement(
      s,
      call<DistributionRecord>(
        "/preview/distribution-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  reviewQueue: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<ReviewQueueItem>(s, base(s) + "/reviews/queue", n, signal),
  reviews: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<ReviewSummary>(s, base(s) + "/reviews", n, signal),
  review: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    checkedReview(
      s,
      call<LoadReview>(
        base(s) +
          "/reviews/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  decideReview: (s: Session, body: ReviewInput, signal: AbortSignal) =>
    checkedReview(
      s,
      call<LoadReview>(base(s) + "/reviews", signal, body, s.csrf),
    ),
  reviewHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/reviews/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  reviewExample: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<SterilizationLoad>(
        "/preview/review-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  loads: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<LoadSummary>(s, base(s) + "/loads", n, signal),
  load: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) +
          "/loads/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  createLoad: (s: Session, body: LoadInput, signal: AbortSignal) =>
    scoped(
      s,
      call<SterilizationLoad>(base(s) + "/loads", signal, body, s.csrf),
    ),
  loadContents: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      packageIds: string[];
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) + "/loads/" + encodeURIComponent(id) + "/contents",
        signal,
        body,
        s.csrf,
      ),
    ),
  startCycle: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      cycleReference: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) + "/loads/" + encodeURIComponent(id) + "/start",
        signal,
        body,
        s.csrf,
      ),
    ),
  finishCycle: (
    s: Session,
    id: string,
    body: CycleResultInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) + "/loads/" + encodeURIComponent(id) + "/finish",
        signal,
        body,
        s.csrf,
      ),
    ),
  cancelLoad: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      reason: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<SterilizationLoad>(
        base(s) + "/loads/" + encodeURIComponent(id) + "/cancel",
        signal,
        body,
        s.csrf,
      ),
    ),
  loadHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/loads/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  cycleExample: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<SterilizationLoad>(
        "/preview/cycle-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  async allPackages(s: Session, signal: AbortSignal) {
    const rows: PackageSummary[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.packages(s, n, signal);
      rows.push(...p.items);
      if (!p.hasMore) return rows;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  packages: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<PackageSummary>(s, base(s) + "/packages", n, signal),
  package: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    checkedPackage(
      s,
      call<SterilePackage>(
        base(s) +
          "/packages/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  pack: (s: Session, body: PackageInput, signal: AbortSignal) =>
    checkedPackage(
      s,
      call<SterilePackage>(base(s) + "/packages", signal, body, s.csrf),
    ),
  voidPackage: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      reason: string;
      confirmed: boolean;
    },
    signal: AbortSignal,
  ) =>
    checkedPackage(
      s,
      call<SterilePackage>(
        base(s) + "/packages/" + encodeURIComponent(id) + "/void",
        signal,
        body,
        s.csrf,
      ),
    ),
  packageHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/packages/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  packagingExample: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<TrayAssembly>(
        "/preview/packaging-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  async allAssemblies(s: Session, signal: AbortSignal) {
    const all: TrayAssembly[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.assemblies(s, n, signal);
      all.push(...p.items);
      if (!p.hasMore) return all;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  inspectionExample: (s: Session, requestId: string, signal: AbortSignal) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        "/preview/inspection-example",
        signal,
        { requestId },
        s.csrf,
      ),
    ),
  inspectEpisode: (
    s: Session,
    id: string,
    body: InspectInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        base(s) + "/processing/" + encodeURIComponent(id) + "/inspect",
        signal,
        body,
        s.csrf,
      ),
    ),
  processing: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<ProcessingEpisode>(s, base(s) + "/processing", n, signal),
  episode: (s: Session, id: string, signal: AbortSignal, version?: number) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        base(s) +
          "/processing/" +
          encodeURIComponent(id) +
          (version === undefined ? "" : "/versions/" + version),
        signal,
      ),
    ),
  receive: (s: Session, body: ReceiveInput, signal: AbortSignal) =>
    scoped(
      s,
      call<ProcessingEpisode>(base(s) + "/processing", signal, body, s.csrf),
    ),
  startCleaning: (
    s: Session,
    id: string,
    body: StartCleaningInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        base(s) + "/processing/" + encodeURIComponent(id) + "/start",
        signal,
        body,
        s.csrf,
      ),
    ),
  finishCleaning: (
    s: Session,
    id: string,
    body: FinishCleaningInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<ProcessingEpisode>(
        base(s) + "/processing/" + encodeURIComponent(id) + "/finish",
        signal,
        body,
        s.csrf,
      ),
    ),
  processingHistory: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/processing/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  session: (signal: AbortSignal) => checkedSession("/preview/session", signal),
  login: (
    role: "operator" | "viewer" | "reviewer",
    s: Session,
    signal: AbortSignal,
  ) => checkedSession("/preview/login", signal, { role }, s.csrf),
  logout: (s: Session, signal: AbortSignal) =>
    checkedSession("/preview/logout", signal, {}, s.csrf),
  types: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<InstrumentType>(s, base(s) + "/instrument-types", n, signal),
  instruments: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<Instrument>(s, base(s) + "/instruments", n, signal),
  instrument: (s: Session, id: string, signal: AbortSignal) =>
    scoped(
      s,
      call<Instrument>(
        base(s) + "/instruments/" + encodeURIComponent(id),
        signal,
      ),
    ),
  history: (s: Session, id: string, n: number, signal: AbortSignal) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) + "/instruments/" + encodeURIComponent(id) + "/history",
      n,
      signal,
    ),
  createType: (
    s: Session,
    body: {
      requestId: string;
      code: string;
      name: string;
      manufacturer: string;
      model: string;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<InstrumentType>(base(s) + "/instrument-types", signal, body, s.csrf),
    ),
  register: (
    s: Session,
    body: {
      requestId: string;
      instrumentTypeId: string;
      code: string;
      serialNumber: string;
    },
    signal: AbortSignal,
  ) =>
    scoped(s, call<Instrument>(base(s) + "/instruments", signal, body, s.csrf)),
  retire: (
    s: Session,
    id: string,
    body: { requestId: string; version: number; reason: string },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<Instrument>(
        base(s) + "/instruments/" + encodeURIComponent(id) + "/retire",
        signal,
        body,
        s.csrf,
      ),
    ),
  definitions: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<TrayDefinition>(s, base(s) + "/tray-definitions", n, signal),
  definition: (
    s: Session,
    id: string,
    signal: AbortSignal,
    revision?: number,
  ) =>
    scoped(
      s,
      call<TrayDefinition>(
        base(s) +
          "/tray-definitions/" +
          encodeURIComponent(id) +
          (revision ? "/revisions/" + revision : ""),
        signal,
      ),
    ),
  createDefinition: (
    s: Session,
    body: TrayDefinitionInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayDefinition>(base(s) + "/tray-definitions", signal, body, s.csrf),
    ),
  reviseDefinition: (
    s: Session,
    id: string,
    body: TrayDefinitionRevisionInput,
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayDefinition>(
        base(s) + "/tray-definitions/" + encodeURIComponent(id) + "/revise",
        signal,
        body,
        s.csrf,
      ),
    ),
  assemblies: (s: Session, n: number, signal: AbortSignal) =>
    scopedPage<TrayAssembly>(s, base(s) + "/tray-assemblies", n, signal),
  async assembly(
    s: Session,
    id: string,
    signal: AbortSignal,
    version?: number,
  ) {
    const v = await call<AssemblyView>(
      base(s) +
        "/tray-assemblies/" +
        encodeURIComponent(id) +
        (version ? "/versions/" + version : ""),
      signal,
    );
    if (
      !v?.assembly ||
      v.assembly.tenantId !== s.tenantId ||
      v.assembly.facilityId !== s.facilityId ||
      !v.assessment ||
      !Array.isArray(v.assessment.rows)
    )
      throw new ApiError(503, "SERVICE_UNAVAILABLE");
    return v;
  },
  createAssembly: (
    s: Session,
    body: {
      requestId: string;
      code: string;
      definitionId: string;
      definitionVersion: number;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayAssembly>(base(s) + "/tray-assemblies", signal, body, s.csrf),
    ),
  saveContents: (
    s: Session,
    id: string,
    body: { requestId: string; version: number; instrumentIds: string[] },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayAssembly>(
        base(s) + "/tray-assemblies/" + encodeURIComponent(id) + "/contents",
        signal,
        body,
        s.csrf,
      ),
    ),
  assemblyAction: (
    s: Session,
    id: string,
    body: {
      requestId: string;
      version: number;
      action: "complete" | "disassemble";
      confirmed: true;
      reason: string;
    },
    signal: AbortSignal,
  ) =>
    scoped(
      s,
      call<TrayAssembly>(
        base(s) + "/tray-assemblies/" + encodeURIComponent(id) + "/action",
        signal,
        body,
        s.csrf,
      ),
    ),
  trayHistory: (
    s: Session,
    id: string,
    kind: "definition" | "assembly",
    n: number,
    signal: AbortSignal,
  ) =>
    scopedPage<SterileAuditEvent>(
      s,
      base(s) +
        (kind === "definition" ? "/tray-definitions/" : "/tray-assemblies/") +
        encodeURIComponent(id) +
        "/history",
      n,
      signal,
    ),
  async allDefinitions(s: Session, signal: AbortSignal) {
    const all: TrayDefinition[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.definitions(s, n, signal);
      all.push(...p.items);
      if (!p.hasMore) return all;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  async allInstruments(s: Session, signal: AbortSignal) {
    const all: Instrument[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.instruments(s, n, signal);
      all.push(...p.items);
      if (!p.hasMore) return all;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
  async allTypes(s: Session, signal: AbortSignal) {
    const items: InstrumentType[] = [];
    for (let n = 1; n <= 20; n++) {
      const p = await api.types(s, n, signal);
      items.push(...p.items);
      if (!p.hasMore) return items;
    }
    throw new ApiError(503, "SERVICE_UNAVAILABLE");
  },
};
