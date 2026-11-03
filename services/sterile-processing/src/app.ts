import express from "express";
import {
  InstrumentRegistry,
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
    permission: "instruments:read" | "instruments:write",
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
      const permission =
        req.method === "GET" || req.method === "HEAD"
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
          ? { INVALID_REQUEST: 400, NOT_FOUND: 404, CONFLICT: 409 }[
              code as SterileError["code"]
            ]
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
