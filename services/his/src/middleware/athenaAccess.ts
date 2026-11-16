import type { RequestHandler } from "express";
export type AthenaAction = "READ" | "WRITE";
export type AthenaDecision = {
  tenantId: string;
  identityId: string;
  action: AthenaAction;
};
export type AthenaAuthorizer = (
  token: string,
  action: AthenaAction,
) => Promise<AthenaDecision>;
export class AthenaAccessError extends Error {
  constructor(
    public status: 401 | 403 | 503,
    public code: string,
  ) {
    super(code);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function athenaAccess(authorize?: AthenaAuthorizer): RequestHandler {
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const match = /^Bearer ([^\s]+)$/i.exec(req.header("authorization") ?? "");
    if (!match || match[1]!.length > 8192) {
      res.status(401).json({ error: "SIGN_IN_REQUIRED" });
      return;
    }
    if (!["GET", "HEAD", "POST", "PUT", "PATCH"].includes(req.method)) {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }
    const action: AthenaAction = ["GET", "HEAD"].includes(req.method)
      ? "READ"
      : "WRITE";
    try {
      if (!authorize)
        throw new AthenaAccessError(503, "ATHENA_AUTHORIZATION_UNAVAILABLE");
      const decision = await authorize(match[1]!, action);
      if (
        !decision ||
        !uuid.test(decision.tenantId) ||
        !uuid.test(decision.identityId) ||
        decision.action !== action
      )
        throw new AthenaAccessError(503, "ATHENA_AUTHORIZATION_UNAVAILABLE");
      const supplied = req.header("x-tenant-id");
      if (
        supplied &&
        supplied.toLowerCase() !== decision.tenantId.toLowerCase()
      )
        throw new AthenaAccessError(403, "CLIENT_MISMATCH");
      res.locals.tenantId = decision.tenantId.toLowerCase();
      res.locals.identityId = decision.identityId.toLowerCase();
      next();
    } catch (e) {
      if (e instanceof AthenaAccessError)
        res.status(e.status).json({ error: e.code });
      else res.status(503).json({ error: "ATHENA_AUTHORIZATION_UNAVAILABLE" });
    }
  };
}
export function remoteAthenaAuthorization(origin: string): AthenaAuthorizer {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw Error(
      "HTTPS authorization origin or explicit loopback origin required.",
    );
  return async (token, action) => {
    try {
      const r = await fetch(origin + "/api/v1/admin/accounts/athena-access", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        signal: AbortSignal.timeout(3000),
        redirect: "error",
      });
      if (!r.ok) {
        if (r.status === 401)
          throw new AthenaAccessError(401, "SIGN_IN_REQUIRED");
        if (r.status === 403) {
          const error = (await r.json()) as { error?: string };
          throw new AthenaAccessError(
            403,
            error.error === "ATHENA_FACILITY_SCOPE_UNSUPPORTED"
              ? "ATHENA_FACILITY_SCOPE_UNSUPPORTED"
              : "ATHENA_ACCESS_REQUIRED",
          );
        }
        throw new AthenaAccessError(503, "ATHENA_AUTHORIZATION_UNAVAILABLE");
      }
      const result = (await r.json()) as AthenaDecision;
      if (
        !result ||
        !uuid.test(result.tenantId) ||
        !uuid.test(result.identityId) ||
        result.action !== action
      )
        throw Error("Invalid authorization decision");
      return result;
    } catch (e) {
      if (e instanceof AthenaAccessError) throw e;
      throw new AthenaAccessError(503, "ATHENA_AUTHORIZATION_UNAVAILABLE");
    }
  };
}
