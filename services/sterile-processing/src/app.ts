import express from "express";
import {
  InstrumentRegistry,
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
      | "traceability:read"
      | "maintenance:authorize"
      | "instruments:read"
      | "instruments:write"
      | "trays:read"
      | "trays:write"
      | "processing:read"
      | "processing:write"
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
function body(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
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
        facilityId,
      };
      const readOnly = req.method === "GET" || req.method === "HEAD";
      const permission =
        req.path.endsWith("/maintenance/authorize") && !readOnly
          ? "maintenance:authorize"
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
                      : req.path.startsWith("/packages")
                        ? readOnly
                          ? "packaging:read"
                          : "packaging:write"
                        : req.path.startsWith("/processing")
                          ? readOnly
                            ? "processing:read"
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
    const v = body(req.body, [
      "requestId",
      "version",
      "method",
      "procedure",
      "procedureVersion",
      "equipment",
      "confirmed",
    ]);
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
  app.post(prefix + "/processing/:id/inspect", async (req, res) => {
    noQuery(req);
    const v = body(req.body, [
      "requestId",
      "version",
      "procedure",
      "procedureVersion",
      "evidence",
      "items",
      "confirmed",
    ]);
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
    const v = body(req.body, [
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
    ]);
    res
      .status(201)
      .json(
        await packaging().pack(
          res.locals.scope,
          v as unknown as Parameters<PackagingRegistry["pack"]>[1],
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
    const v = body(req.body, [
      "requestId",
      "code",
      "sterilizer",
      "method",
      "profile",
      "profileVersion",
      "packageIds",
      "confirmed",
    ]);
    res
      .status(201)
      .json(
        await cycles().create(
          res.locals.scope,
          v as unknown as Parameters<CycleRegistry["create"]>[1],
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
              INVALID_REQUEST: 400,
              NOT_FOUND: 404,
              CONFLICT: 409,
              ASSEMBLY_INCOMPLETE: 409,
              INSTRUMENT_ASSIGNED: 409,
              PROCESSING_HOLD: 409,
              PACKAGING_BLOCKED: 409,
              LOAD_BLOCKED: 409,
              REVIEW_BLOCKED: 409,
              DISTRIBUTION_BLOCKED: 409,
              RECALL_BLOCKED: 409,
              RECALL_LIMIT: 409,
              CLEARANCE_BLOCKED: 409,
              RETURN_BLOCKED: 409,
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
