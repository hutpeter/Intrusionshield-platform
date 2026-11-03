import type {
  ProcessingEpisode,
  ReceiveInput,
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
  role?: "operator" | "viewer";
  tenantId?: string;
  actorId?: string;
  facilityId?: string;
  facilityName?: string;
  timeZone?: string;
  actors?: Record<string, "operator" | "viewer">;
  canWrite?: boolean;
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
        !["operator", "viewer"].includes(value.role ?? "") ||
        typeof value.canWrite !== "boolean"))
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
export const api = {
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
  login: (role: "operator" | "viewer", s: Session, signal: AbortSignal) =>
    checkedSession("/preview/login", signal, { role }, s.csrf),
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
