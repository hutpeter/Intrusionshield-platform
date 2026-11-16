import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { AccessTokenService } from "../security/AccessTokenService.js";
import { AccountAdministration } from "../accounts/service.js";
import { AccountError, type Principal, uuid, fail } from "../accounts/model.js";
export type AccountAdminApi = {
  accounts: AccountAdministration;
  tokens: AccessTokenService;
  allowInsecureLoopback?: boolean;
  canCreateClients?: (p: Principal) => Promise<boolean>;
};
export function createAccountAdminRouter(api: AccountAdminApi): Router {
  const router = Router(),
    attempts = new Map<string, { count: number; until: number }>();
  router.use((req, res, next) => {
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress ?? "",
    );
    if (!req.secure && !(api.allowInsecureLoopback && local)) {
      res.status(403).json({ error: "HTTPS_REQUIRED" });
      return;
    }
    next();
  });
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const principal = (req: Request): Principal => {
    const m = /^Bearer ([^\s]+)$/i.exec(req.header("authorization") ?? "");
    if (!m) fail(401, "SIGN_IN_REQUIRED");
    try {
      const c = api.tokens.verify(m[1]!);
      if (c.identityType !== "USER") fail(401, "SIGN_IN_REQUIRED");
      return {
        tenantId: uuid(c.tenantId),
        id: uuid(c.sub),
        sessionVersion: c.sessionVersion,
      };
    } catch {
      fail(401, "SIGN_IN_REQUIRED");
    }
  };
  const run =
    (work: (req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const result = await work(req);
        res.json(result);
      } catch (e) {
        if (e instanceof AccountError)
          res.status(e.status).json({ error: e.code });
        else res.status(503).json({ error: "ACCOUNT_ADMIN_UNAVAILABLE" });
      }
    };
  const noQuery = (req: Request, keys: string[] = []) => {
    if (Object.keys(req.query).some((k) => !keys.includes(k)))
      fail(400, "INVALID_QUERY");
  };
  const offset = (req: Request) => {
    noQuery(req, ["offset"]);
    const s = req.query.offset ?? "0";
    if (typeof s !== "string" || !/^\d{1,6}$/.test(s))
      fail(400, "INVALID_PAGE");
    return Number(s);
  };
  const tenant = (req: Request) => uuid(req.params.tenantId),
    target = (req: Request) => uuid(req.params.id);
  router.post(
    "/athena-access",
    run((req) => {
      noQuery(req);
      return api.accounts.athenaAccess(principal(req), req.body);
    }),
  );
  router.post(
    "/clients/:tenantId/athena-roles",
    run((req) => {
      noQuery(req);
      return api.accounts.prepareAthenaRoles(
        principal(req),
        tenant(req),
        req.body,
      );
    }),
  );
  router.get(
    "/client-creation",
    run(async (req) => {
      noQuery(req);
      const p = principal(req),
        context = await api.accounts.context(p);
      return {
        enabled:
          context.kind === "SUPERUSER" && !!(await api.canCreateClients?.(p)),
      };
    }),
  );
  router.get(
    "/context",
    run((req) => {
      noQuery(req);
      return api.accounts.context(principal(req));
    }),
  );
  router.get(
    "/clients",
    run((req) => {
      noQuery(req);
      return api.accounts.tenants(principal(req));
    }),
  );
  router.get(
    "/clients/:tenantId/users",
    run((req) => api.accounts.list(principal(req), tenant(req), offset(req))),
  );
  router.get(
    "/clients/:tenantId/roles",
    run((req) => {
      noQuery(req);
      return api.accounts.roles(principal(req), tenant(req));
    }),
  );
  router.get(
    "/clients/:tenantId/audit",
    run((req) =>
      api.accounts.history(principal(req), tenant(req), offset(req)),
    ),
  );
  router.post(
    "/clients/:tenantId/users",
    run((req) => {
      noQuery(req);
      return api.accounts.create(principal(req), tenant(req), req.body);
    }),
  );
  router.put(
    "/clients/:tenantId/users/:id/access",
    run((req) => {
      noQuery(req);
      return api.accounts.accessChange(
        principal(req),
        tenant(req),
        target(req),
        req.body,
      );
    }),
  );
  router.post(
    "/clients/:tenantId/users/:id/status",
    run((req) => {
      noQuery(req);
      return api.accounts.status(
        principal(req),
        tenant(req),
        target(req),
        req.body,
      );
    }),
  );
  router.post(
    "/clients/:tenantId/users/:id/setup",
    run((req) => {
      noQuery(req);
      return api.accounts.reset(
        principal(req),
        tenant(req),
        target(req),
        req.body,
      );
    }),
  );
  router.post(
    "/complete-setup",
    run(async (req) => {
      noQuery(req);
      const now = Date.now(),
        key = req.ip ?? req.socket.remoteAddress ?? "unknown";
      for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
      if (!attempts.has(key) && attempts.size >= 10000) fail(429, "TRY_LATER");
      const entry = attempts.get(key) ?? { count: 0, until: now + 900000 };
      if (entry.count >= 10) fail(429, "TRY_LATER");
      entry.count++;
      attempts.set(key, entry);
      return api.accounts.complete(req.body);
    }),
  );
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(400).json({ error: "INVALID_REQUEST" });
    },
  );
  return router;
}
