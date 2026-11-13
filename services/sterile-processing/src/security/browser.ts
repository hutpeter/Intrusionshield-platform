import express from "express";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import {
  sterileUuid,
  type SterileRepository,
} from "@intrusionshield/sterile-processing";
import { createSterileApp } from "../app.js";
import {
  createRubySterileAccess,
  type RubyTokenConfiguration,
  type SterileAccessDirectory,
  type SterileIdentityRepository,
} from "./access.js";

interface BrowserSession {
  csrf: string;
  expiresAt: number;
  token?: string;
}
const fresh = () => randomBytes(32).toString("hex");
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const cookieName = "__Host-ruby-sterile";
/** HTTPS same-origin BFF. No token/password is returned to the browser or persisted.
 * Explicit process-local session store: restart signs everybody out; no silent refresh.
 */
export function createSterileBrowserApp(options: {
  origin: string;
  facilityId: string;
  facilityName: string;
  timeZone: string;
  webRoot?: string;
  repository: SterileRepository;
  authentication: RubyTokenConfiguration;
  directory: SterileAccessDirectory;
  identities: SterileIdentityRepository;
  /** Delegate to Ruby AuthenticationService; null means invalid credentials, throw means unavailable. */
  signIn: (request: {
    tenantId: string;
    username: string;
    password: string;
  }) => Promise<{ accessToken: string } | null>;
  now?: () => number;
}): { app: express.Express; dispose: () => void } {
  const url = new URL(options.origin),
    facilityId = sterileUuid(options.facilityId),
    tenantId = sterileUuid(options.authentication.tenantId),
    now = options.now ?? Date.now;
  if (
    url.protocol !== "https:" ||
    url.origin !== options.origin ||
    !options.facilityName?.trim() ||
    typeof options.signIn !== "function" ||
    !options.repository
  )
    throw new Error(
      "Browser sign-in requires an exact HTTPS origin and explicit dependencies.",
    );
  if (!options.timeZone) throw new Error("A facility time zone is required.");
  new Intl.DateTimeFormat("en", { timeZone: options.timeZone }).format();
  const access = createRubySterileAccess(
    options.authentication,
    options.directory,
    options.identities,
  );
  const sessions = new Map<string, BrowserSession>(),
    attempts = new Map<string, { count: number; until: number }>();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const navigation =
      (req.method === "GET" || req.method === "HEAD") &&
      ["/", "/index.html"].includes(req.path);
    if (
      req.headers.host !== url.host ||
      (req.headers.origin && req.headers.origin !== options.origin) ||
      (req.headers["sec-fetch-site"] === "cross-site" && !navigation)
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    for (const [key, value] of sessions)
      if (value.expiresAt <= now()) sessions.delete(key);
    for (const [key, value] of attempts)
      if (value.until <= now()) attempts.delete(key);
    const matches = (req.headers.cookie ?? "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(cookieName + "="));
    const raw =
      matches.length === 1 ? matches[0].slice(cookieName.length + 1) : "";
    const key = /^[a-f0-9]{64}$/.test(raw) ? digest(raw) : "";
    res.locals.sessionKey = key;
    res.locals.session = sessions.get(key);
    next();
  });
  app.use("/auth", express.json({ limit: "8kb", strict: true }));
  function install(
    res: express.Response,
    token?: string,
    expiresAt = now() + 10 * 60_000,
  ) {
    if (sessions.size >= 1000) throw new Error("Session capacity reached.");
    const raw = fresh(),
      session = { csrf: fresh(), expiresAt, ...(token ? { token } : {}) };
    sessions.set(digest(raw), session);
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${raw}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(1, Math.floor((expiresAt - now()) / 1000))}`,
    );
    return session;
  }
  function csrf(req: express.Request, res: express.Response) {
    const s = res.locals.session as BrowserSession | undefined;
    return (
      !!s &&
      req.headers.origin === options.origin &&
      req.headers["x-sterile-csrf"] === s.csrf &&
      !req.headers.authorization
    );
  }
  async function view(s: BrowserSession) {
    const anonymous = {
      mode: "ruby-browser",
      authenticated: false,
      csrf: s.csrf,
      expiresAt: s.expiresAt,
    };
    if (!s.token) return anonymous;
    const principal = await access.authenticate(s.token);
    if (!principal || !principal.facilityIds.includes(facilityId)) return null;
    const record = await options.directory.findUser(
      tenantId,
      principal.actorId,
    );
    const grant = record?.facilities.find(
      (f) => f.facilityId === facilityId && f.capabilityEnabled,
    );
    if (record?.status !== "ACTIVE" || !grant) return null;
    const identity = await options.identities.findById(
      principal.actorId,
      tenantId,
    );
    if (
      !identity ||
      sterileUuid(identity.id) !== principal.actorId ||
      sterileUuid(identity.tenantId) !== tenantId ||
      identity.type !== "USER" ||
      identity.status !== "ACTIVE"
    )
      return null;
    const has = (p: string) =>
      grant.permissions.some((permission) => permission === p);
    const canWrite = [
      "instruments:write",
      "processing:write",
      "trays:write",
      "packaging:write",
      "cycles:write",
      "distribution:write",
    ].some(has);
    return {
      ...anonymous,
      authenticated: true,
      tenantId,
      actorId: principal.actorId,
      displayName:
        typeof identity.displayName === "string" && identity.displayName.trim()
          ? identity.displayName.slice(0, 200)
          : principal.actorId,
      facilityId,
      facilityName: options.facilityName,
      timeZone: options.timeZone,
      role: canWrite
        ? "operator"
        : has("release:write")
          ? "reviewer"
          : "viewer",
      canWrite,
      canInspect: has("processing:inspect"),
      personId: principal.personId,
      canReview: has("release:write"),
      canRecall: has("recall:write"),
      canClearRecall: has("recall:clear"),
      canAdmitRecall: has("recall:admit"),
      canRecover: has("recall:recover"),
      canReturn: has("returns:write"),
      canDisposeReturn: has("returns:dispose"),
    };
  }
  app.get("/auth/session", async (req, res, next) => {
    try {
      if (req.headers.authorization) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      let s = res.locals.session as BrowserSession | undefined;
      if (!s) s = install(res);
      let value = await view(s);
      if (!value) {
        sessions.delete(res.locals.sessionKey);
        s = install(res);
        value = await view(s);
      }
      res.json(value);
    } catch (error) {
      next(error);
    }
  });
  app.post("/auth/login", async (req, res, next) => {
    try {
      if (!csrf(req, res)) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      const s = res.locals.session as BrowserSession;
      if (s.token) {
        res.status(409).json({ error: "CONFLICT" });
        return;
      }
      const b = req.body;
      if (
        !b ||
        typeof b !== "object" ||
        Array.isArray(b) ||
        Object.keys(b).sort().join(",") !== "password,username" ||
        typeof b.username !== "string" ||
        !b.username.trim() ||
        b.username.length > 200 ||
        typeof b.password !== "string" ||
        !b.password ||
        b.password.length > 1024
      ) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      const key = req.socket.remoteAddress ?? "local",
        rate = attempts.get(key) ?? { count: 0, until: now() + 60_000 };
      if (rate.count >= 10) {
        res.setHeader("Retry-After", "60");
        res.status(429).json({ error: "TRY_LATER" });
        return;
      }
      rate.count++;
      attempts.set(key, rate);
      let result: { accessToken: string } | null;
      try {
        result = await options.signIn({
          tenantId,
          username: b.username.trim(),
          password: b.password,
        });
      } finally {
        delete b.password;
      }
      const principal = result
        ? await access.authenticate(result.accessToken)
        : null;
      if (!principal || !principal.facilityIds.includes(facilityId)) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      if (sessions.get(res.locals.sessionKey) !== s || s.expiresAt <= now()) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      const claims = jwt.decode(result!.accessToken) as jwt.JwtPayload;
      const expiry = Math.min(now() + 30 * 60_000, claims.exp! * 1000);
      const value = await view({
        csrf: fresh(),
        token: result!.accessToken,
        expiresAt: expiry,
      });
      if (
        !value ||
        expiry <= now() ||
        sessions.get(res.locals.sessionKey) !== s
      ) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      sessions.delete(res.locals.sessionKey);
      const active = install(res, result!.accessToken, expiry);
      res.json({ ...value, csrf: active.csrf });
    } catch (error) {
      next(error);
    }
  });
  app.post("/auth/logout", (req, res) => {
    if (!csrf(req, res)) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    sessions.delete(res.locals.sessionKey);
    const anonymous = install(res);
    res.json({
      mode: "ruby-browser",
      authenticated: false,
      csrf: anonymous.csrf,
      expiresAt: anonymous.expiresAt,
    });
  });
  app.use("/api/v1/sterile", async (req, res, next) => {
    try {
      const s = res.locals.session as BrowserSession | undefined;
      if (req.headers.authorization || !s?.token) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      if (!["GET", "HEAD"].includes(req.method) && !csrf(req, res)) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      if (!(await view(s))) {
        sessions.delete(res.locals.sessionKey);
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      delete req.headers.cookie;
      req.headers.authorization = "Bearer " + s.token;
      next();
    } catch (error) {
      next(error);
    }
  });
  if (options.webRoot) {
    const html = readFileSync(
      join(options.webRoot, "index.html"),
      "utf8",
    ).replace(
      "</head>",
      '<meta name="ruby-sterile-auth" content="browser"></head>',
    );
    app.get(["/", "/index.html"], (_req, res) => {
      res.type("html").send(html);
    });
    app.use(express.static(options.webRoot, { index: false }));
  }
  app.use(createSterileApp({ repository: options.repository, ...access }));
  app.use(
    (
      _error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(503).json({ error: "SERVICE_UNAVAILABLE" }),
  );
  return {
    app,
    dispose: () => {
      sessions.clear();
      attempts.clear();
    },
  };
}
