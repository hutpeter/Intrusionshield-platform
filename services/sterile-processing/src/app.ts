import express from "express";
import {
  ConsumableExpiryReportRegistry,
  StockBalanceReportRegistry,
  StockMovementReportRegistry,
  ReplenishmentRegistry,
  StockReconciliationRegistry,
  ConsumableAlertRegistry,
  ConsumableStockRegistry,
  ConsumableRegistry,
  InstrumentRegistry,
  EquipmentRegistry,
  PerformanceRegistry,
  EquipmentIncidentRegistry,
  LoanerRegistry,
  ProcedureRegistry,
  ServiceUsageRegistry,
  DashboardRegistry,
  dashboardQueueIds,
  type DashboardQueueId,
  MaintenanceRegistry,
  TrayRegistry,
  ProcessingRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  TraceabilityRegistry,
  ReturnRegistry,
  RecallRegistry,
  SterileError,
  sterileUuid,
  type SterileRepository,
  type SterileScope,
} from "@intrusionshield/sterile-processing";
export interface SterilePrincipal {
  tenantId: string;
  actorId: string;
  personId?: string;
  facilityIds: readonly string[];
}
export interface SterileDependencies {
  repository?: SterileRepository;
  /** Verify bearer cryptographically, issuer/audience/lifetime and active membership. No decoded-only JWTs. */
  authenticate?: (bearer: string) => Promise<SterilePrincipal | null>;
  /** Central entitlement + RBAC/ABAC + facility policy; user roles alone are insufficient. */
  authorize?: (
    scope: SterileScope,
    capability: "sterile.core",
    permission:
      | "consumables:reconcile"
      | "consumables:policy"
      | "consumables:withdraw"
      | "consumables:read"
      | "consumables:write"
      | "reports:read"
      | "equipment-incidents:read"
      | "equipment-incidents:write"
      | "equipment:read"
      | "equipment:write"
      | "equipment:hold"
      | "procedures:read"
      | "procedures:write"
      | "procedures:publish"
      | "loaners:read"
      | "loaners:write"
      | "dashboard:read"
      | "traceability:read"
      | "maintenance:authorize"
      | "instruments:read"
      | "instruments:write"
      | "trays:read"
      | "trays:write"
      | "processing:read"
      | "processing:write"
      | "processing:inspect"
      | "processing:cancel"
      | "processing:correct"
      | "packaging:read"
      | "packaging:write"
      | "cycles:read"
      | "cycles:write"
      | "release:read"
      | "release:write"
      | "distribution:read"
      | "distribution:write"
      | "returns:read"
      | "returns:write"
      | "returns:dispose"
      | "recall:clear"
      | "recall:admit"
      | "recall:read"
      | "recall:write"
      | "recall:recover",
  ) => Promise<boolean>;
}
function body(
  value: unknown,
  keys: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (k) => !keys.includes(k) && !optional.includes(k),
    ) ||
    keys.some((k) => !Object.hasOwn(value, k))
  )
    throw new SterileError("INVALID_REQUEST");
  return value as Record<string, unknown>;
}
/** Independent service factory: never opens SQL or installs an implicit demo identity/store. */
export function createSterileApp(
  dependencies: SterileDependencies = {},
): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/health", (_req, res) => {
    res.json({
      service: "sterile-processing",
      status: "ok",
      clinicalUseEnabled: false,
    });
  });
  app.use("/api/v1/sterile", async (req, res, next) => {
    // Bearer-only service boundary. Browser cookie/session/CSRF composition is deliberately not installed here.
    if (req.headers.cookie) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    const token = /^Bearer ([^\s]{1,8192})$/.exec(
      req.headers.authorization ?? "",
    )?.[1];
    if (!token) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (
      !dependencies.authenticate ||
      !dependencies.authorize ||
      !dependencies.repository
    ) {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
      return;
    }
    try {
      const principal = await dependencies.authenticate(token);
      if (!principal) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      res.locals.principal = {
        tenantId: sterileUuid(principal.tenantId),
        actorId: sterileUuid(principal.actorId),
        ...(principal.personId !== undefined
          ? { personId: sterileUuid(principal.personId) }
          : {}),
        facilityIds: principal.facilityIds.map(sterileUuid),
      };
      next();
    } catch {
      res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
    }
  });
  app.use(
    "/api/v1/sterile/facilities/:facilityId/tray-assemblies",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/processing/:id/inspect",
    express.json({ limit: "256kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/processing/scanned-receipts",
    express.json({ limit: "16kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/returns/scanned",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/returns/partial",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/returns/:id/receive-missing",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/loaners",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(
    "/api/v1/sterile/facilities/:facilityId/procedures",
    express.json({ limit: "64kb", strict: true }),
  );
  app.use(express.json({ limit: "8kb", strict: true }));
  const prefix = "/api/v1/sterile/facilities/:facilityId";
  app.use(prefix, async (req, res, next) => {
    try {
      const principal = res.locals.principal as SterilePrincipal;
      const facilityId = sterileUuid(req.params.facilityId);
      if (!principal.facilityIds.includes(facilityId)) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      const scope: SterileScope = {
        tenantId: principal.tenantId,
        actorId: principal.actorId,
        ...(principal.personId !== undefined
          ? { personId: principal.personId }
          : {}),
        facilityId,
      };
      const readOnly = req.method === "GET" || req.method === "HEAD";
      const permission = req.path.startsWith("/consumables")
        ? readOnly
          ? "consumables:read"
          : /\/stock\/counts\/[^/]+\/(approve|reject)$/.test(req.path)
            ? "consumables:reconcile"
            : req.path.endsWith("/alert-policy")
              ? "consumables:policy"
              : req.path.endsWith("/withdraw") ||
                  req.path.endsWith("/recalls") ||
                  /\/stock\/(quarantine|discard|discard_quarantined)$/.test(
                    req.path,
                  )
                ? "consumables:withdraw"
                : "consumables:write"
        : (req.path.endsWith("/maintenance/authorize") ||
              req.path.endsWith("/service-policy")) &&
            !readOnly
          ? "maintenance:authorize"
          : req.path === "/dashboard" || req.path.startsWith("/dashboard/")
            ? "dashboard:read"
            : req.path === "/performance"
              ? "reports:read"
              : req.path.startsWith("/equipment-incidents") ||
                  /^\/equipment\/[^/]+\/(incident-impact|incidents)$/.test(
                    req.path,
                  )
                ? readOnly
                  ? "equipment-incidents:read"
                  : "equipment-incidents:write"
                : req.path.startsWith("/equipment")
                  ? readOnly
                    ? "equipment:read"
                    : req.path.endsWith("/hold")
                      ? "equipment:hold"
                      : "equipment:write"
                  : req.path.startsWith("/procedures")
                    ? readOnly
                      ? "procedures:read"
                      : req.path.endsWith("/publish") ||
                          req.path.endsWith("/withdraw")
                        ? "procedures:publish"
                        : "procedures:write"
                    : req.path.startsWith("/loaners")
                      ? readOnly
                        ? "loaners:read"
                        : "loaners:write"
                      : req.path.startsWith("/traceability")
                        ? "traceability:read"
                        : req.path.startsWith("/returns")
                          ? readOnly
                            ? "returns:read"
                            : req.path.endsWith("/dispose")
                              ? "returns:dispose"
                              : "returns:write"
                          : req.path.startsWith("/recalls")
                            ? readOnly
                              ? "recall:read"
                              : req.path.endsWith("/clear")
                                ? "recall:clear"
                                : req.path.endsWith("/admit")
                                  ? "recall:admit"
                                  : req.path.endsWith("/recover")
                                    ? "recall:recover"
                                    : "recall:write"
                            : req.path.startsWith("/distribution")
                              ? readOnly
                                ? "distribution:read"
                                : "distribution:write"
                              : req.path.startsWith("/reviews")
                                ? readOnly
                                  ? "release:read"
                                  : "release:write"
                                : req.path.startsWith("/loads")
                                  ? readOnly
                                    ? "cycles:read"
                                    : "cycles:write"
                                  : req.path.startsWith("/packages") ||
                                      req.path === "/package-scan"
                                    ? readOnly
                                      ? "packaging:read"
                                      : "packaging:write"
                                    : req.path.startsWith("/processing")
                                      ? readOnly
                                        ? "processing:read"
                                        : /\/[^/]+\/inspect$/.test(req.path)
                                          ? "processing:inspect"
                                          : /\/[^/]+\/cancel-receipt$/.test(
                                                req.path,
                                              )
                                            ? "processing:cancel"
                                            : /\/[^/]+\/correct-receipt$/.test(
                                                  req.path,
                                                )
                                              ? "processing:correct"
                                              : "processing:write"
                                      : req.path.startsWith("/tray-")
                                        ? readOnly
                                          ? "trays:read"
                                          : "trays:write"
                                        : readOnly
                                          ? "instruments:read"
                                          : "instruments:write";
      if (
        (await dependencies.authorize!(scope, "sterile.core", permission)) !==
        true
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      res.locals.scope = scope;
      if (
        !readOnly &&
        /^\/processing\/[^/]+\/(start|finish|inspect|correct-receipt|cancel-receipt)$/.test(
          req.path,
        ) &&
        !principal.personId
      )
        throw new SterileError("INSPECTION_IDENTITY_REQUIRED");
      next();
    } catch (error) {
      next(error);
    }
  });
  const registry = () => new InstrumentRegistry(dependencies.repository!);
  const trays = () => new TrayRegistry(dependencies.repository!);
  const page = (req: express.Request) => {
    if (
      Object.keys(req.query).some((k) => k !== "page") ||
      (req.query.page !== undefined &&
        (typeof req.query.page !== "string" ||
          !/^[1-9]\d{0,4}$/.test(req.query.page)))
    )
      throw new SterileError("INVALID_REQUEST");
    return req.query.page === undefined ? 1 : Number(req.query.page);
  };
  const noQuery = (req: express.Request) => {
    if (Object.keys(req.query).length)
      throw new SterileError("INVALID_REQUEST");
  };
  const dashboardPermissions = {
    cleaning: "processing:read",
    inspection: "processing:read",
    assembly: "trays:read",
    loading: "packaging:read",
    release: "release:read",
    returns: "returns:read",
    recall: "recall:read",
    maintenance: "instruments:read",
    packageAlerts: "packaging:read",
    consumableAlerts: "consumables:read",
    stockCountReviews: "consumables:read",
  } as const;
  app.get(prefix + "/dashboard", async (req, res) => {
    noQuery(req);
    const allowed: DashboardQueueId[] = [];
    for (const id of dashboardQueueIds)
      if (
        (await dependencies.authorize!(
          res.locals.scope,
          "sterile.core",
          dashboardPermissions[id],
        )) === true &&
        (id !== "stockCountReviews" ||
          (await dependencies.authorize!(
            res.locals.scope,
            "sterile.core",
            "consumables:reconcile",
          )) === true)
      )
        allowed.push(id);
    res.json(
      await new DashboardRegistry(dependencies.repository!).get(
        res.locals.scope,
        allowed,
      ),
    );
  });
  app.get(prefix + "/dashboard/queues/:queueId", async (req, res) => {
    const id = req.params.queueId as DashboardQueueId;
    const n = page(req);
    if (!dashboardQueueIds.includes(id))
      throw new SterileError("INVALID_REQUEST");
    if (
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        dashboardPermissions[id],
      )) !== true ||
      (id === "stockCountReviews" &&
        (await dependencies.authorize!(
          res.locals.scope,
          "sterile.core",
          "consumables:reconcile",
        )) !== true)
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    res.json(
      await new DashboardRegistry(dependencies.repository!).queue(
        res.locals.scope,
        id,
        n,
      ),
    );
  });
  app.get(prefix + "/instruments/:id/service-usage", async (req, res) => {
    noQuery(req);
    res.json(
      await new ServiceUsageRegistry(dependencies.repository!).get(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.get(
    prefix + "/instruments/:id/service-usage/history",
    async (req, res) => {
      res.json(
        await new ServiceUsageRegistry(dependencies.repository!).history(
          res.locals.scope,
          sterileUuid(req.params.id),
          page(req),
        ),
      );
    },
  );
  app.get(prefix + "/instruments/:id/service-usage/audit", async (req, res) =>
    res.json(
      await new ServiceUsageRegistry(dependencies.repository!).audit(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/instruments/:id/service-policy", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "interval",
      "warningBefore",
      "reference",
      "confirmed",
    ]);
    res.json(
      await new ServiceUsageRegistry(dependencies.repository!).configure(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ServiceUsageRegistry["configure"]>[2],
      ),
    );
  });
  app.get(prefix + "/performance", async (req, res) => {
    for (const permission of [
      "processing:read",
      "trays:read",
      "packaging:read",
      "cycles:read",
      "release:read",
      "distribution:read",
      "returns:read",
      "equipment:read",
      "instruments:read",
    ] as const)
      if (
        (await dependencies.authorize!(
          res.locals.scope,
          "sterile.core",
          permission,
        )) !== true
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
    if (
      Object.keys(req.query).length !== 2 ||
      typeof req.query.from !== "string" ||
      typeof req.query.to !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new PerformanceRegistry(dependencies.repository!).report(
        res.locals.scope,
        req.query.from,
        req.query.to,
      ),
    );
  });
  const incidents = () =>
    new EquipmentIncidentRegistry(dependencies.repository!);
  async function incidentSources(res: express.Response, recall = false) {
    for (const permission of [
      "equipment:read",
      "processing:read",
      "cycles:read",
      "packaging:read",
      "distribution:read",
      "instruments:read",
      "recall:read",
      ...(recall ? ["recall:write" as const] : []),
    ] as const) {
      if (
        (await dependencies.authorize!(
          res.locals.scope,
          "sterile.core",
          permission,
        )) !== true
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return false;
      }
    }
    return true;
  }
  app.get(prefix + "/equipment/:id/incident-impact", async (req, res) => {
    if (!(await incidentSources(res))) return;
    if (
      Object.keys(req.query).some((k) => !["from", "to"].includes(k)) ||
      typeof req.query.from !== "string" ||
      typeof req.query.to !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await incidents().preview(
        res.locals.scope,
        sterileUuid(req.params.id),
        req.query.from,
        req.query.to,
      ),
    );
  });
  app.get(prefix + "/equipment/:id/incidents", async (req, res) => {
    if (!(await incidentSources(res))) return;
    res.json(
      await incidents().list(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    );
  });
  app.get(prefix + "/equipment-incidents/:id", async (req, res) => {
    noQuery(req);
    if (!(await incidentSources(res))) return;
    res.json(
      await incidents().get(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(
    prefix + "/equipment-incidents/:id/versions/:version",
    async (req, res) => {
      noQuery(req);
      if (!(await incidentSources(res))) return;
      if (!/^[1-9]\d{0,8}$/.test(String(req.params.version)))
        throw new SterileError("INVALID_REQUEST");
      res.json(
        await incidents().get(
          res.locals.scope,
          sterileUuid(req.params.id),
          Number(req.params.version),
        ),
      );
    },
  );
  app.post(prefix + "/equipment-incidents", async (req, res) => {
    noQuery(req);
    if (!(await incidentSources(res))) return;
    const v = body(req.body, [
      "requestId",
      "code",
      "equipmentId",
      "from",
      "to",
      "impactHash",
      "reason",
      "reference",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await incidents().create(
          res.locals.scope,
          v as unknown as Parameters<EquipmentIncidentRegistry["create"]>[1],
        ),
      );
  });
  app.post(prefix + "/equipment-incidents/:id/findings", async (req, res) => {
    noQuery(req);
    if (!(await incidentSources(res, true))) return;
    const v = body(req.body, [
      "requestId",
      "version",
      "finding",
      "reference",
      "instrumentIds",
      "packageIds",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await incidents().recordFinding(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<
            EquipmentIncidentRegistry["recordFinding"]
          >[2],
        ),
      );
  });
  app.post(
    prefix + "/equipment-incidents/:id/instrument-holds",
    async (req, res) => {
      noQuery(req);
      if (!(await incidentSources(res, true))) return;
      const v = body(req.body, [
        "requestId",
        "version",
        "instrumentId",
        "instrumentVersion",
        "reason",
        "confirmed",
      ]);
      res
        .status(201)
        .json(
          await incidents().holdInstrument(
            res.locals.scope,
            sterileUuid(req.params.id),
            v as unknown as Parameters<
              EquipmentIncidentRegistry["holdInstrument"]
            >[2],
          ),
        );
    },
  );
  app.post(
    prefix + "/equipment-incidents/:id/instrument-releases",
    async (req, res) => {
      noQuery(req);
      if (!(await incidentSources(res, true))) return;
      const v = body(req.body, [
        "requestId",
        "version",
        "instrumentId",
        "instrumentVersion",
        "reason",
        "reference",
        "confirmed",
      ]);
      res
        .status(201)
        .json(
          await incidents().releaseInstrument(
            res.locals.scope,
            sterileUuid(req.params.id),
            v as unknown as Parameters<
              EquipmentIncidentRegistry["releaseInstrument"]
            >[2],
          ),
        );
    },
  );
  app.post(prefix + "/equipment-incidents/:id/closure", async (req, res) => {
    noQuery(req);
    if (!(await incidentSources(res, true))) return;
    const v = body(req.body, [
      "requestId",
      "version",
      "reason",
      "reference",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await incidents().close(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<EquipmentIncidentRegistry["close"]>[2],
        ),
      );
  });
  app.get(
    prefix + "/equipment-incidents/:id/recall-impact",
    async (req, res) => {
      if (!(await incidentSources(res))) return;
      if (
        Object.keys(req.query).length !== 1 ||
        typeof req.query.packageId !== "string"
      )
        throw new SterileError("INVALID_REQUEST");
      res.json(
        await incidents().recallPreview(
          res.locals.scope,
          sterileUuid(req.params.id),
          sterileUuid(req.query.packageId),
        ),
      );
    },
  );
  app.post(prefix + "/equipment-incidents/:id/recalls", async (req, res) => {
    noQuery(req);
    if (!(await incidentSources(res, true))) return;
    const v = body(req.body, [
      "requestId",
      "version",
      "packageId",
      "impactHash",
      "code",
      "reason",
      "reference",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await incidents().createRecall(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<
            EquipmentIncidentRegistry["createRecall"]
          >[2],
        ),
      );
  });
  const equipmentRegistry = () =>
    new EquipmentRegistry(dependencies.repository!);
  app.get(prefix + "/equipment", async (req, res) =>
    res.json(await equipmentRegistry().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/equipment/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await equipmentRegistry().get(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.get(prefix + "/equipment/:id/versions/:version", async (req, res) => {
    noQuery(req);
    if (!/^[1-9]\d{0,8}$/.test(String(req.params.version)))
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await equipmentRegistry().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/equipment/:id/history", async (req, res) =>
    res.json(
      await equipmentRegistry().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  const equipmentServiceFields = [
    "requestId",
    "state",
    "lastServicedAt",
    "serviceDueAt",
    "serviceReference",
    "qualificationDueAt",
    "qualificationReference",
    "reason",
    "confirmed",
  ];
  app.post(prefix + "/equipment", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      ...equipmentServiceFields,
      "code",
      "name",
      "kind",
      "methods",
      "manufacturer",
      "model",
      "serialNumber",
      "location",
    ]);
    res
      .status(201)
      .json(
        await equipmentRegistry().register(
          res.locals.scope,
          v as unknown as Parameters<EquipmentRegistry["register"]>[1],
        ),
      );
  });
  app.post(prefix + "/equipment/:id/service", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [...equipmentServiceFields, "version"]);
    res.json(
      await equipmentRegistry().recordService(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<EquipmentRegistry["recordService"]>[2],
      ),
    );
  });
  app.post(prefix + "/equipment/:id/hold", async (req, res) => {
    noQuery(req);
    const v = body(req.body, ["requestId", "version", "reason", "confirmed"]);
    res.json(
      await equipmentRegistry().hold(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<EquipmentRegistry["hold"]>[2],
      ),
    );
  });
  async function equipmentRead(res: express.Response) {
    if (
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "equipment:read",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return false;
    }
    return true;
  }
  app.get(prefix + "/consumables/expiry-report", async (req, res) => {
    if (
      Object.keys(req.query).some(
        (k) => !["days", "lotCode", "status"].includes(k),
      ) ||
      (req.query.days !== undefined &&
        (typeof req.query.days !== "string" ||
          !/^[1-9]\d{0,2}$/.test(req.query.days))) ||
      (req.query.lotCode !== undefined &&
        typeof req.query.lotCode !== "string") ||
      (req.query.status !== undefined && typeof req.query.status !== "string")
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new ConsumableExpiryReportRegistry(dependencies.repository!).get(
        res.locals.scope,
        req.query.days === undefined ? 30 : Number(req.query.days),
        {
          ...(req.query.lotCode === undefined
            ? {}
            : { lotCode: req.query.lotCode as string }),
          ...(req.query.status === undefined
            ? {}
            : {
                status: req.query
                  .status as import("@intrusionshield/sterile-processing").ConsumableExpiryStatus,
              }),
        },
      ),
    );
  });
  app.get(prefix + "/consumables/balance-report", async (req, res) => {
    if (
      Object.keys(req.query).some((k) => !["lotCode", "status"].includes(k)) ||
      (req.query.lotCode !== undefined &&
        typeof req.query.lotCode !== "string") ||
      (req.query.status !== undefined && typeof req.query.status !== "string")
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new StockBalanceReportRegistry(dependencies.repository!).get(
        res.locals.scope,
        {
          ...(req.query.lotCode === undefined
            ? {}
            : { lotCode: req.query.lotCode as string }),
          ...(req.query.status === undefined
            ? {}
            : {
                status: req.query
                  .status as import("@intrusionshield/sterile-processing").StockBalanceStatus,
              }),
        },
      ),
    );
  });
  app.get(prefix + "/consumables/movement-report", async (req, res) => {
    if (
      Object.keys(req.query).some(
        (k) => !["from", "to", "lotCode", "action"].includes(k),
      ) ||
      typeof req.query.from !== "string" ||
      typeof req.query.to !== "string" ||
      (req.query.lotCode !== undefined &&
        typeof req.query.lotCode !== "string") ||
      (req.query.action !== undefined && typeof req.query.action !== "string")
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new StockMovementReportRegistry(dependencies.repository!).report(
        res.locals.scope,
        req.query.from,
        req.query.to,
        {
          ...(req.query.lotCode === undefined
            ? {}
            : { lotCode: req.query.lotCode as string }),
          ...(req.query.action === undefined
            ? {}
            : {
                action: req.query
                  .action as import("@intrusionshield/sterile-processing").StockAction,
              }),
        },
      ),
    );
  });
  app.get(prefix + "/consumables/replenishment", async (req, res) => {
    noQuery(req);
    res.json(
      await new ReplenishmentRegistry(dependencies.repository!).get(
        res.locals.scope,
      ),
    );
  });
  app.get(
    prefix + "/consumables/:id/stock/counts/:countId",
    async (req, res) => {
      noQuery(req);
      res.json(
        await new StockReconciliationRegistry(dependencies.repository!).get(
          res.locals.scope,
          sterileUuid(req.params.id),
          sterileUuid(req.params.countId),
        ),
      );
    },
  );
  app.get(prefix + "/consumables/:id/stock/counts", async (req, res) =>
    res.json(
      await new StockReconciliationRegistry(dependencies.repository!).list(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/consumables/:id/stock/counts", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "stockVersion",
      "countedAvailable",
      "reason",
      "reference",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await new StockReconciliationRegistry(dependencies.repository!).record(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<StockReconciliationRegistry["record"]>[2],
        ),
      );
  });
  for (const action of ["approve", "reject"] as const)
    app.post(
      prefix + "/consumables/:id/stock/counts/:countId/" + action,
      async (req, res) => {
        noQuery(req);
        const v = body(req.body, [
          "requestId",
          "version",
          "reason",
          "reference",
          "confirmed",
        ]);
        res.json(
          await new StockReconciliationRegistry(
            dependencies.repository!,
          ).decide(
            res.locals.scope,
            sterileUuid(req.params.id),
            sterileUuid(req.params.countId),
            action,
            v as unknown as Parameters<
              StockReconciliationRegistry["decide"]
            >[4],
          ),
        );
      },
    );
  app.post(prefix + "/consumables/:id/alert-policy", async (req, res) => {
    noQuery(req);
    const v = body(
      req.body,
      [
        "requestId",
        "version",
        "minimumStock",
        "warningDays",
        "reason",
        "reference",
        "confirmed",
      ],
      ["targetStock"],
    );
    res.json(
      await new ConsumableAlertRegistry(dependencies.repository!).configure(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ConsumableAlertRegistry["configure"]>[2],
      ),
    );
  });
  app.get(prefix + "/consumables/:id/stock", async (req, res) =>
    res.json(
      await new ConsumableStockRegistry(dependencies.repository!).report(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  for (const action of [
    "receive",
    "quarantine",
    "discard",
    "discard_quarantined",
  ] as const)
    app.post(prefix + "/consumables/:id/stock/" + action, async (req, res) => {
      noQuery(req);
      const v = body(req.body, [
        "requestId",
        "version",
        "quantity",
        "reason",
        "reference",
        "confirmed",
      ]);
      res
        .status(201)
        .json(
          await new ConsumableStockRegistry(dependencies.repository!).record(
            res.locals.scope,
            sterileUuid(req.params.id),
            action,
            v as unknown as Parameters<ConsumableStockRegistry["record"]>[3],
          ),
        );
    });
  app.post(prefix + "/consumables/:id/withdraw", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "reason",
      "reference",
      "confirmed",
    ]);
    res.json(
      await new ConsumableRegistry(dependencies.repository!).withdraw(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ConsumableRegistry["withdraw"]>[2],
      ),
    );
  });
  app.get(prefix + "/consumables/:id/recall-impact", async (req, res) => {
    if (!(await lotRecallPermission(req, res, "recall:read"))) return;
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.packageId !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new ConsumableRegistry(dependencies.repository!).recallPreview(
        res.locals.scope,
        sterileUuid(req.params.id),
        req.query.packageId,
      ),
    );
  });
  app.post(prefix + "/consumables/:id/recalls", async (req, res) => {
    noQuery(req);
    if (!(await lotRecallPermission(req, res, "recall:write"))) return;
    const v = body(req.body, [
      "requestId",
      "version",
      "reason",
      "reference",
      "confirmed",
      "packageId",
      "impactHash",
      "code",
    ]);
    res
      .status(201)
      .json(
        await new ConsumableRegistry(dependencies.repository!).createRecall(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<ConsumableRegistry["createRecall"]>[2],
        ),
      );
  });
  async function lotRecallPermission(
    req: express.Request,
    res: express.Response,
    permission: "recall:read" | "recall:write",
  ) {
    for (const p of ["packaging:read", permission] as const) {
      if (
        (await dependencies.authorize!(res.locals.scope, "sterile.core", p)) !==
        true
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return false;
      }
    }
    return true;
  }
  app.get(prefix + "/consumables", async (req, res) =>
    res.json(
      await new ConsumableRegistry(dependencies.repository!).list(
        res.locals.scope,
        page(req),
      ),
    ),
  );
  app.get(prefix + "/consumables/:id/packages", async (req, res) => {
    if (
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "packaging:read",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    res.json(
      await new ConsumableRegistry(dependencies.repository!).packages(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    );
  });
  app.get(prefix + "/consumables/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await new ConsumableRegistry(dependencies.repository!).detail(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.post(prefix + "/consumables", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "kind",
      "name",
      "lotNumber",
      "supplier",
      "supplierReference",
      "expiresOn",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await new ConsumableRegistry(dependencies.repository!).register(
          res.locals.scope,
          v as unknown as Parameters<ConsumableRegistry["register"]>[1],
        ),
      );
  });
  app.get(prefix + "/procedures", async (req, res) =>
    res.json(
      await new ProcedureRegistry(dependencies.repository!).list(
        res.locals.scope,
        page(req),
      ),
    ),
  );
  app.get(prefix + "/procedures/available/:stage", async (req, res) =>
    res.json(
      await new ProcedureRegistry(dependencies.repository!).list(
        res.locals.scope,
        page(req),
        req.params
          .stage as import("@intrusionshield/sterile-processing").ProcedureStage,
      ),
    ),
  );
  app.get(prefix + "/procedures/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await new ProcedureRegistry(dependencies.repository!).get(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.get(prefix + "/procedures/:id/history", async (req, res) =>
    res.json(
      await new ProcedureRegistry(dependencies.repository!).history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.get(prefix + "/procedures/:id/versions/:version", async (req, res) => {
    noQuery(req);
    if (!/^[1-9]\d*$/.test(String(req.params.version)))
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new ProcedureRegistry(dependencies.repository!).get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.post(prefix + "/procedures", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "title",
      "stage",
      "method",
      "instructions",
      "source",
      "instrumentTypeIds",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await new ProcedureRegistry(dependencies.repository!).draft(
          res.locals.scope,
          v as unknown as Parameters<ProcedureRegistry["draft"]>[1],
        ),
      );
  });
  for (const action of ["publish", "withdraw"] as const)
    app.post(prefix + "/procedures/:id/" + action, async (req, res) => {
      noQuery(req);
      const v = body(req.body, ["requestId", "version", "reason", "confirmed"]);
      res.json(
        await new ProcedureRegistry(dependencies.repository!).transition(
          res.locals.scope,
          sterileUuid(req.params.id),
          action,
          v as unknown as Parameters<ProcedureRegistry["transition"]>[3],
        ),
      );
    });
  app.get(prefix + "/loaners", async (req, res) =>
    res.json(
      await new LoanerRegistry(dependencies.repository!).list(
        res.locals.scope,
        page(req),
      ),
    ),
  );
  app.get(prefix + "/loaners/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await new LoanerRegistry(dependencies.repository!).get(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.get(prefix + "/loaners/:id/versions/:version", async (req, res) => {
    noQuery(req);
    const v = Number(req.params.version);
    if (!/^[1-9]\d*$/.test(String(req.params.version)))
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new LoanerRegistry(dependencies.repository!).get(
        res.locals.scope,
        sterileUuid(req.params.id),
        v,
      ),
    );
  });
  app.get(prefix + "/loaners/:id/history", async (req, res) =>
    res.json(
      await new LoanerRegistry(dependencies.repository!).history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/loaners", async (req, res) => {
    noQuery(req);
    for (const permission of ["instruments:write", "processing:write"] as const)
      if (
        (await dependencies.authorize!(
          res.locals.scope,
          "sterile.core",
          permission,
        )) !== true
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
    const v = body(req.body, [
      "requestId",
      "code",
      "supplier",
      "supplierReference",
      "dueOn",
      "location",
      "custodian",
      "reference",
      "condition",
      "note",
      "contentsChecked",
      "confirmed",
      "items",
    ]);
    if (!Array.isArray(v.items)) throw new SterileError("INVALID_REQUEST");
    for (const row of v.items)
      body(row, ["code", "instrumentTypeId", "serialNumber"]);
    res
      .status(201)
      .json(
        await new LoanerRegistry(dependencies.repository!).receive(
          res.locals.scope,
          v as unknown as Parameters<LoanerRegistry["receive"]>[1],
        ),
      );
  });
  app.post(prefix + "/loaners/:id/readmit", async (req, res) => {
    noQuery(req);
    if (
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "processing:write",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    const v = body(req.body, [
      "requestId",
      "version",
      "instrumentIds",
      "episodeCode",
      "dueOn",
      "location",
      "custodian",
      "reference",
      "condition",
      "note",
      "contentsChecked",
      "confirmed",
    ]);
    res.json(
      await new LoanerRegistry(dependencies.repository!).readmit(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<LoanerRegistry["readmit"]>[2],
      ),
    );
  });
  app.post(prefix + "/loaners/:id/return", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "instrumentIds",
      "recipient",
      "reference",
      "note",
      "contentsChecked",
      "confirmed",
    ]);
    res.json(
      await new LoanerRegistry(dependencies.repository!).returnToSupplier(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<LoanerRegistry["returnToSupplier"]>[2],
      ),
    );
  });
  app.get(prefix + "/instrument-types", async (req, res) => {
    res.json(await registry().listTypes(res.locals.scope, page(req)));
  });
  app.post(prefix + "/instrument-types", async (req, res) => {
    noQuery(req);
    const value = body(req.body, [
      "requestId",
      "code",
      "name",
      "manufacturer",
      "model",
    ]);
    res
      .status(201)
      .json(
        await registry().createType(
          res.locals.scope,
          value as unknown as Parameters<InstrumentRegistry["createType"]>[1],
        ),
      );
  });
  app.get(prefix + "/instruments", async (req, res) => {
    res.json(await registry().list(res.locals.scope, page(req)));
  });
  app.get(prefix + "/instrument-scan", async (req, res) => {
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.identifier !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await registry().lookupScan(res.locals.scope, req.query.identifier),
    );
  });
  app.get(prefix + "/instruments/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await registry().get(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.post(prefix + "/instruments", async (req, res) => {
    noQuery(req);
    const value = body(req.body, [
      "requestId",
      "instrumentTypeId",
      "code",
      "serialNumber",
    ]);
    res
      .status(201)
      .json(
        await registry().register(
          res.locals.scope,
          value as unknown as Parameters<InstrumentRegistry["register"]>[1],
        ),
      );
  });
  for (const step of ["report", "assess", "repair", "authorize"] as const) {
    app.post(
      prefix + "/instruments/:id/maintenance/" + step,
      async (req, res) => {
        noQuery(req);
        const keys = [
          "requestId",
          "version",
          "confirmed",
          ...(step === "report"
            ? ["defect", "location"]
            : step === "authorize"
              ? [
                  "reason",
                  "evidence",
                  "procedure",
                  "procedureVersion",
                  "code",
                  "custodian",
                  "location",
                  "functionalChecked",
                ]
              : step === "repair"
                ? ["note", "evidence", "provider"]
                : ["note", "evidence"]),
        ];
        const input = body(req.body, keys);
        const m = new MaintenanceRegistry(dependencies.repository!);
        const method = step === "authorize" ? "authorizeReturn" : step;
        res.json(
          await m[method](
            res.locals.scope,
            sterileUuid(req.params.id),
            input as never,
          ),
        );
      },
    );
  }
  app.get(prefix + "/instruments/:id/history", async (req, res) => {
    res.json(
      await registry().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    );
  });
  app.post(prefix + "/instruments/:id/retire", async (req, res) => {
    noQuery(req);
    const value = body(req.body, ["requestId", "version", "reason"]);
    res.json(
      await registry().retire(
        res.locals.scope,
        sterileUuid(req.params.id),
        value as unknown as Parameters<InstrumentRegistry["retire"]>[2],
      ),
    );
  });
  app.get(prefix + "/tray-definitions", async (req, res) =>
    res.json(await trays().definitions(res.locals.scope, page(req))),
  );
  app.get(prefix + "/tray-definitions/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await trays().definition(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(
    prefix + "/tray-definitions/:id/revisions/:revision",
    async (req, res) => {
      noQuery(req);
      const n = Number(req.params.revision);
      res.json(
        await trays().definition(
          res.locals.scope,
          sterileUuid(req.params.id),
          n,
        ),
      );
    },
  );
  app.get(prefix + "/tray-definitions/:id/history", async (req, res) =>
    res.json(
      await trays().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        "definition",
        page(req),
      ),
    ),
  );
  app.post(prefix + "/tray-definitions", async (req, res) => {
    noQuery(req);
    const v = body(req.body, ["requestId", "code", "name", "requirements"]);
    res
      .status(201)
      .json(
        await trays().createDefinition(
          res.locals.scope,
          v as unknown as Parameters<TrayRegistry["createDefinition"]>[1],
        ),
      );
  });
  app.post(prefix + "/tray-definitions/:id/revise", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "name",
      "requirements",
      "reason",
    ]);
    res.json(
      await trays().reviseDefinition(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<TrayRegistry["reviseDefinition"]>[2],
      ),
    );
  });
  app.get(prefix + "/tray-assemblies", async (req, res) =>
    res.json(await trays().assemblies(res.locals.scope, page(req))),
  );
  app.get(prefix + "/tray-assemblies/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await trays().assembly(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(
    prefix + "/tray-assemblies/:id/versions/:version",
    async (req, res) => {
      noQuery(req);
      res.json(
        await trays().assembly(
          res.locals.scope,
          sterileUuid(req.params.id),
          Number(req.params.version),
        ),
      );
    },
  );
  app.get(prefix + "/tray-assemblies/:id/history", async (req, res) =>
    res.json(
      await trays().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        "assembly",
        page(req),
      ),
    ),
  );
  app.post(prefix + "/tray-assemblies", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "definitionId",
      "definitionVersion",
    ]);
    res
      .status(201)
      .json(
        await trays().createAssembly(
          res.locals.scope,
          v as unknown as Parameters<TrayRegistry["createAssembly"]>[1],
        ),
      );
  });
  app.post(prefix + "/tray-assemblies/:id/scan", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "identifier",
      "confirmed",
    ]);
    res.json(
      await trays().addByScan(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<TrayRegistry["addByScan"]>[2],
      ),
    );
  });
  app.post(prefix + "/tray-assemblies/:id/contents", async (req, res) => {
    noQuery(req);
    const v = body(req.body, ["requestId", "version", "instrumentIds"]);
    res.json(
      await trays().updateContents(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<TrayRegistry["updateContents"]>[2],
      ),
    );
  });
  app.post(prefix + "/tray-assemblies/:id/action", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "action",
      "confirmed",
      "reason",
    ]);
    res.json(
      await trays().transition(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<TrayRegistry["transition"]>[2],
      ),
    );
  });
  const processing = () => new ProcessingRegistry(dependencies.repository!);
  app.get(prefix + "/processing", async (req, res) =>
    res.json(await processing().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/processing/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await processing().get(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(prefix + "/processing/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await processing().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/processing/:id/history", async (req, res) =>
    res.json(
      await processing().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/processing/scanned-receipts", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "source",
      "custodian",
      "condition",
      "discrepancies",
      "instrumentIds",
      "scannedIdentifiers",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await new ProcessingRegistry(dependencies.repository!).receiveScanned(
          res.locals.scope,
          v as unknown as Parameters<ProcessingRegistry["receiveScanned"]>[1],
        ),
      );
  });
  app.post(prefix + "/processing", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "source",
      "custodian",
      "condition",
      "discrepancies",
      "instrumentIds",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await processing().receive(
          res.locals.scope,
          v as unknown as Parameters<ProcessingRegistry["receive"]>[1],
        ),
      );
  });
  app.post(prefix + "/processing/:id/start", async (req, res) => {
    noQuery(req);
    const v = body(
      req.body,
      [
        "requestId",
        "version",
        "method",
        "procedure",
        "procedureVersion",
        "equipment",
        "confirmed",
      ],
      ["procedureRevisionId", "equipmentId"],
    );
    if (v.method === "mechanical" || v.equipmentId !== undefined) {
      if (!(await equipmentRead(res))) return;
    }
    if (
      v.procedureRevisionId !== undefined &&
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "procedures:read",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    res.json(
      await processing().start(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ProcessingRegistry["start"]>[2],
      ),
    );
  });
  app.post(prefix + "/processing/:id/finish", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "outcome",
      "evidence",
      "note",
      "confirmed",
    ]);
    res.json(
      await processing().finish(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ProcessingRegistry["finish"]>[2],
      ),
    );
  });
  app.post(prefix + "/processing/:id/cancel-receipt", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "reason",
      "reference",
      "confirmed",
    ]);
    res.json(
      await processing().cancelReceipt(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ProcessingRegistry["cancelReceipt"]>[2],
      ),
    );
  });
  app.post(prefix + "/processing/:id/correct-receipt", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "source",
      "custodian",
      "condition",
      "discrepancies",
      "reason",
      "reference",
      "confirmed",
    ]);
    res.json(
      await processing().correctReceipt(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ProcessingRegistry["correctReceipt"]>[2],
      ),
    );
  });
  app.post(prefix + "/processing/:id/inspect", async (req, res) => {
    noQuery(req);
    const v = body(
      req.body,
      [
        "requestId",
        "version",
        "procedure",
        "procedureVersion",
        "evidence",
        "items",
        "confirmed",
      ],
      ["procedureRevisionId"],
    );
    if (
      v.procedureRevisionId !== undefined &&
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "procedures:read",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    res.json(
      await processing().inspect(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ProcessingRegistry["inspect"]>[2],
      ),
    );
  });
  const packaging = () => new PackagingRegistry(dependencies.repository!);
  app.get(prefix + "/packages", async (req, res) =>
    res.json(await packaging().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/package-scan", async (req, res) => {
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.identifier !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new PackagingRegistry(dependencies.repository!).lookupScan(
        res.locals.scope,
        req.query.identifier,
      ),
    );
  });
  app.get(prefix + "/packages/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await packaging().get(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(prefix + "/packages/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await packaging().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/packages/:id/history", async (req, res) =>
    res.json(
      await packaging().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/packages", async (req, res) => {
    noQuery(req);
    const v = body(
      req.body,
      [
        "requestId",
        "code",
        "assemblyId",
        "assemblyVersion",
        "material",
        "materialLot",
        "procedure",
        "procedureVersion",
        "sealChecked",
        "contentsChecked",
        "confirmed",
      ],
      ["shelfLife", "consumableLotIds", "consumableUsage"],
    );
    if (v.consumableLotIds !== undefined) {
      for (const permission of [
        "consumables:read",
        "consumables:write",
      ] as const) {
        if (
          (await dependencies.authorize!(
            res.locals.scope,
            "sterile.core",
            permission,
          )) !== true
        ) {
          res.status(403).json({ error: "FORBIDDEN" });
          return;
        }
      }
    }
    res
      .status(201)
      .json(
        await packaging().pack(
          res.locals.scope,
          v as unknown as Parameters<PackagingRegistry["pack"]>[1],
        ),
      );
  });
  app.post(prefix + "/packages/:id/integrity-hold", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "packageVersion",
      "reason",
      "evidence",
      "location",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await packaging().holdIntegrity(
          res.locals.scope,
          sterileUuid(req.params.id),
          v as unknown as Parameters<PackagingRegistry["holdIntegrity"]>[2],
        ),
      );
  });
  app.post(prefix + "/packages/:id/void", async (req, res) => {
    noQuery(req);
    const v = body(req.body, ["requestId", "version", "reason", "confirmed"]);
    res.json(
      await packaging().void(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<PackagingRegistry["void"]>[2],
      ),
    );
  });
  const cycles = () => new CycleRegistry(dependencies.repository!);
  app.get(prefix + "/loads", async (req, res) =>
    res.json(await cycles().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/loads/:id", async (req, res) => {
    noQuery(req);
    res.json(await cycles().get(res.locals.scope, sterileUuid(req.params.id)));
  });
  app.get(prefix + "/loads/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await cycles().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/loads/:id/history", async (req, res) =>
    res.json(
      await cycles().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/loads", async (req, res) => {
    noQuery(req);
    const v = body(
      req.body,
      [
        "requestId",
        "code",
        "sterilizer",
        "method",
        "profile",
        "profileVersion",
        "packageIds",
        "confirmed",
      ],
      ["procedureRevisionId", "equipmentId"],
    );
    if (!(await equipmentRead(res))) return;
    if (
      v.procedureRevisionId !== undefined &&
      (await dependencies.authorize!(
        res.locals.scope,
        "sterile.core",
        "procedures:read",
      )) !== true
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    res
      .status(201)
      .json(
        await cycles().create(
          res.locals.scope,
          v as unknown as Parameters<CycleRegistry["create"]>[1],
        ),
      );
  });
  app.post(prefix + "/loads/:id/scan", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "identifier",
      "confirmed",
    ]);
    res.json(
      await new CycleRegistry(dependencies.repository!).addByScan(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<CycleRegistry["addByScan"]>[2],
      ),
    );
  });
  app.post(prefix + "/loads/:id/contents", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "packageIds",
      "confirmed",
    ]);
    res.json(
      await cycles().contents(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<CycleRegistry["contents"]>[2],
      ),
    );
  });
  app.post(prefix + "/loads/:id/start", async (req, res) => {
    noQuery(req);
    if (!(await equipmentRead(res))) return;
    const v = body(req.body, [
      "requestId",
      "version",
      "cycleReference",
      "confirmed",
    ]);
    res.json(
      await cycles().start(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<CycleRegistry["start"]>[2],
      ),
    );
  });
  app.post(prefix + "/loads/:id/finish", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "outcome",
      "cycleEvidence",
      "indicatorEvidence",
      "note",
      "confirmed",
    ]);
    res.json(
      await cycles().finish(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<CycleRegistry["finish"]>[2],
      ),
    );
  });
  app.post(prefix + "/loads/:id/cancel", async (req, res) => {
    noQuery(req);
    const v = body(req.body, ["requestId", "version", "reason", "confirmed"]);
    res.json(
      await cycles().cancel(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<CycleRegistry["cancel"]>[2],
      ),
    );
  });
  const reviews = () => new ReviewRegistry(dependencies.repository!);
  app.get(prefix + "/reviews/queue", async (req, res) =>
    res.json(await reviews().queue(res.locals.scope, page(req))),
  );
  app.get(prefix + "/reviews", async (req, res) =>
    res.json(await reviews().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/reviews/:id", async (req, res) => {
    noQuery(req);
    res.json(await reviews().get(res.locals.scope, sterileUuid(req.params.id)));
  });
  app.get(prefix + "/reviews/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await reviews().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/reviews/:id/history", async (req, res) =>
    res.json(
      await reviews().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/reviews", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "loadId",
      "loadVersion",
      "reviewVersion",
      "decision",
      "reason",
      "reference",
      "cycleChecked",
      "indicatorsChecked",
      "packagesChecked",
      "profileChecked",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await reviews().decide(
          res.locals.scope,
          v as unknown as Parameters<ReviewRegistry["decide"]>[1],
        ),
      );
  });
  const distribution = () => new DistributionRegistry(dependencies.repository!);
  app.get(prefix + "/distribution-scan", async (req, res) => {
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.identifier !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new DistributionRegistry(dependencies.repository!).scan(
        res.locals.scope,
        req.query.identifier,
      ),
    );
  });
  app.get(prefix + "/distribution", async (req, res) =>
    res.json(await distribution().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/distribution/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await distribution().get(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.get(prefix + "/distribution/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await distribution().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/distribution/:id/history", async (req, res) =>
    res.json(
      await distribution().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/distribution", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "packageId",
      "packageVersion",
      "reviewId",
      "reviewVersion",
      "location",
      "reference",
      "integrityChecked",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await distribution().store(
          res.locals.scope,
          v as unknown as Parameters<DistributionRegistry["store"]>[1],
        ),
      );
  });
  app.post(prefix + "/distribution/:id/transfer", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "location",
      "reference",
      "reason",
      "integrityChecked",
      "confirmed",
    ]);
    res.json(
      await distribution().transfer(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<DistributionRegistry["transfer"]>[2],
      ),
    );
  });
  app.post(prefix + "/distribution/:id/issue", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "destination",
      "recipient",
      "reference",
      "integrityChecked",
      "confirmed",
    ]);
    res.json(
      await distribution().issue(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<DistributionRegistry["issue"]>[2],
      ),
    );
  });
  const trace = () => new TraceabilityRegistry(dependencies.repository!);
  app.get(prefix + "/traceability", async (req, res) => {
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.code !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json({
      tenantId: res.locals.scope.tenantId,
      facilityId: res.locals.scope.facilityId,
      matches: await trace().search(res.locals.scope, req.query.code),
    });
  });
  app.get(prefix + "/traceability/:kind/:id", async (req, res) => {
    noQuery(req);
    res.json(
      await trace().report(
        res.locals.scope,
        req.params.kind as Parameters<TraceabilityRegistry["report"]>[1],
        sterileUuid(req.params.id),
      ),
    );
  });
  const returns = () => new ReturnRegistry(dependencies.repository!);
  app.get(prefix + "/returns/scan", async (req, res) => {
    if (
      Object.keys(req.query).length !== 1 ||
      typeof req.query.identifier !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await new ReturnRegistry(dependencies.repository!).scan(
        res.locals.scope,
        req.query.identifier,
      ),
    );
  });
  app.post(prefix + "/returns/scanned", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "distributionId",
      "distributionVersion",
      "condition",
      "location",
      "custodian",
      "reference",
      "note",
      "contentsChecked",
      "confirmed",
      "identifier",
      "receivedInstrumentIds",
    ]);
    res
      .status(201)
      .json(
        await new ReturnRegistry(dependencies.repository!).createScanned(
          res.locals.scope,
          v as unknown as Parameters<ReturnRegistry["createScanned"]>[1],
        ),
      );
  });
  app.post(prefix + "/returns/partial", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "distributionId",
      "distributionVersion",
      "condition",
      "location",
      "custodian",
      "reference",
      "note",
      "confirmed",
      "identifier",
      "receivedInstrumentIds",
      "reason",
      "observedConfirmed",
    ]);
    res
      .status(201)
      .json(
        await returns().createPartial(
          res.locals.scope,
          v as unknown as Parameters<ReturnRegistry["createPartial"]>[1],
        ),
      );
  });
  app.post(prefix + "/returns/:id/receive-missing", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "receivedInstrumentIds",
      "location",
      "custodian",
      "reference",
      "note",
      "confirmed",
    ]);
    res.json(
      await returns().recoverMissing(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ReturnRegistry["recoverMissing"]>[2],
      ),
    );
  });
  app.get(prefix + "/returns", async (req, res) =>
    res.json(await returns().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/returns/:id", async (req, res) => {
    noQuery(req);
    res.json(await returns().get(res.locals.scope, sterileUuid(req.params.id)));
  });
  app.get(prefix + "/returns/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await returns().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/returns/:id/history", async (req, res) =>
    res.json(
      await returns().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/returns", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "code",
      "distributionId",
      "distributionVersion",
      "condition",
      "location",
      "custodian",
      "reference",
      "note",
      "contentsChecked",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await returns().create(
          res.locals.scope,
          v as unknown as Parameters<ReturnRegistry["create"]>[1],
        ),
      );
  });
  app.post(prefix + "/returns/:id/dispose", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "action",
      "reason",
      "reference",
      "episodeCode",
      "confirmed",
    ]);
    res.json(
      await returns().dispose(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<ReturnRegistry["dispose"]>[2],
      ),
    );
  });
  const recalls = () => new RecallRegistry(dependencies.repository!);
  app.get(prefix + "/recalls", async (req, res) =>
    res.json(await recalls().list(res.locals.scope, page(req))),
  );
  app.get(prefix + "/recalls/impact", async (req, res) => {
    if (
      Object.keys(req.query).length !== 3 ||
      typeof req.query.sourceKind !== "string" ||
      typeof req.query.sourceId !== "string" ||
      typeof req.query.sourceVersion !== "string"
    )
      throw new SterileError("INVALID_REQUEST");
    res.json(
      await recalls().impact(
        res.locals.scope,
        req.query.sourceKind as "load" | "package",
        req.query.sourceId,
        Number(req.query.sourceVersion),
      ),
    );
  });
  app.get(prefix + "/recalls/:id/impact", async (req, res) => {
    noQuery(req);
    res.json(
      await recalls().caseImpact(res.locals.scope, sterileUuid(req.params.id)),
    );
  });
  app.post(prefix + "/recalls/:id/extend", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "impactHash",
      "reason",
      "reference",
      "confirmed",
    ]);
    res.json(
      await recalls().extend(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<RecallRegistry["extend"]>[2],
      ),
    );
  });
  app.get(prefix + "/recalls/:id/admission-plan", async (req, res) => {
    noQuery(req);
    res.json(
      await recalls().admissionPlan(
        res.locals.scope,
        sterileUuid(req.params.id),
      ),
    );
  });
  app.post(prefix + "/recalls/:id/clear", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "resolution",
      "evidence",
      "procedure",
      "procedureVersion",
      "causeReviewed",
      "recoveryReviewed",
      "dispositionReviewed",
      "reprocessingRequired",
      "confirmed",
    ]);
    res.json(
      await recalls().clear(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<RecallRegistry["clear"]>[2],
      ),
    );
  });
  app.post(prefix + "/recalls/:id/admit", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "impactHash",
      "episodeCode",
      "custodian",
      "location",
      "condition",
      "reference",
      "note",
      "contentsChecked",
      "confirmed",
    ]);
    res.json(
      await recalls().admit(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<RecallRegistry["admit"]>[2],
      ),
    );
  });
  app.get(prefix + "/recalls/:id", async (req, res) => {
    noQuery(req);
    res.json(await recalls().get(res.locals.scope, sterileUuid(req.params.id)));
  });
  app.get(prefix + "/recalls/:id/versions/:version", async (req, res) => {
    noQuery(req);
    res.json(
      await recalls().get(
        res.locals.scope,
        sterileUuid(req.params.id),
        Number(req.params.version),
      ),
    );
  });
  app.get(prefix + "/recalls/:id/history", async (req, res) =>
    res.json(
      await recalls().history(
        res.locals.scope,
        sterileUuid(req.params.id),
        page(req),
      ),
    ),
  );
  app.post(prefix + "/recalls", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      ...(Object.hasOwn(req.body ?? {}, "impactHash") ? ["impactHash"] : []),
      "requestId",
      "code",
      "sourceKind",
      "sourceId",
      "sourceVersion",
      "reason",
      "reference",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await recalls().create(
          res.locals.scope,
          v as unknown as Parameters<RecallRegistry["create"]>[1],
        ),
      );
  });
  app.post(prefix + "/recalls/:id/recover", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "packageId",
      "location",
      "reference",
      "note",
      "confirmed",
    ]);
    res.json(
      await recalls().recover(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<RecallRegistry["recover"]>[2],
      ),
    );
  });
  app.post(prefix + "/recalls/:id/dispose", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "packageId",
      "action",
      "reason",
      "reference",
      "confirmed",
    ]);
    res.json(
      await recalls().dispose(
        res.locals.scope,
        sterileUuid(req.params.id),
        v as unknown as Parameters<RecallRegistry["dispose"]>[2],
      ),
    );
  });
  app.use((_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const code =
        error instanceof SterileError ? error.code : "SERVICE_UNAVAILABLE";
      const parser = error as { type?: string };
      const status =
        error instanceof SterileError
          ? {
              SCAN_DUPLICATE: 409,
              SCAN_TYPE: 409,
              INSUFFICIENT_STOCK: 409,
              CONSUMABLE_WITHDRAWN: 409,
              CONSUMABLE_EXPIRED: 409,
              REPORT_LIMIT: 409,
              INCIDENT_LIMIT: 409,
              EQUIPMENT_BLOCKED: 409,
              PACKAGE_EXPIRED: 409,
              PACKAGE_INTEGRITY_BLOCKED: 409,
              PROCEDURE_BLOCKED: 409,
              LOANER_UNAVAILABLE: 409,
              SERVICE_DUE: 409,
              SCAN_INELIGIBLE: 409,
              INVALID_REQUEST: 400,
              NOT_FOUND: 404,
              CONFLICT: 409,
              ASSEMBLY_INCOMPLETE: 409,
              INSTRUMENT_ASSIGNED: 409,
              PROCESSING_HOLD: 409,
              SELF_INSPECTION: 409,
              INSPECTION_IDENTITY_REQUIRED: 409,
              RECEIPT_CORRECTION_BLOCKED: 409,
              RECEIPT_CANCELLATION_BLOCKED: 409,
              PACKAGING_BLOCKED: 409,
              LOAD_BLOCKED: 409,
              REVIEW_BLOCKED: 409,
              DISTRIBUTION_BLOCKED: 409,
              RECALL_BLOCKED: 409,
              RECALL_LIMIT: 409,
              CLEARANCE_BLOCKED: 409,
              RETURN_BLOCKED: 409,
              RETURN_CONTENTS_MISMATCH: 409,
              TRACE_LIMIT: 409,
            }[code as SterileError["code"]]
          : parser.type === "entity.too.large"
            ? 413
            : parser.type === "entity.parse.failed"
              ? 400
              : 503;
      res.status(status).json({
        error: status === 400 || status === 413 ? "INVALID_REQUEST" : code,
      });
    },
  );
  return app;
}
