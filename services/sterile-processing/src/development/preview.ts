import { prepareReviewQueueExample } from "./review-queue-example.js";
import { StockReconciliationRegistry } from "@intrusionshield/sterile-processing";
import { ConsumableStockRegistry } from "@intrusionshield/sterile-processing";
import { createHash } from "node:crypto";
import { ConsumableRegistry } from "@intrusionshield/sterile-processing";
import { prepareEquipmentIncidentExample } from "./equipment-incident-example.js";
import { prepareUnpackagedIncidentExample } from "./unpackaged-incident-example.js";
import { prepareProcedureExample } from "./procedure-example.js";
import { prepareLoanerReadmissionExample } from "./loaner-readmission-example.js";
import { InstrumentRegistry } from "@intrusionshield/sterile-processing";
import { prepareServiceThresholdExample } from "./service-threshold-example.js";
import { prepareDashboardPagingExample } from "./dashboard-paging-example.js";
import { prepareReturnScanExample } from "./return-scan-example.js";
import { prepareDistributionScanExample } from "./distribution-scan-example.js";
import { prepareLoadScanExample } from "./load-scan-example.js";
import { prepareReceivingScanExample } from "./receiving-scan-example.js";
import { prepareTrayScanExample } from "./tray-scan-example.js";
import { prepareScanExample } from "./scan-example.js";
import { prepareMaintenanceExample } from "./maintenance-example.js";
import { prepareRecallClearanceExample } from "./recall-clearance-example.js";
import { prepareLineageRecallExample } from "./lineage-recall-example.js";
import { prepareReturnExample } from "./return-example.js";
import { prepareDistributionExample } from "./distribution-example.js";
import { prepareReviewExample } from "./review-example.js";
import { prepareCycleExample } from "./cycle-example.js";
import { preparePackagingExample } from "./packaging-example.js";
import { prepareInspectionExample } from "./inspection-example.js";
import express from "express";
import { randomBytes } from "node:crypto";
import {
  sterileUuid,
  type SterileRepository,
} from "@intrusionshield/sterile-processing";
import { createSterileApp } from "../app.js";
import { assertSterilePreviewEnvironment } from "./guard.js";

const tenantId = "a7f4b902-0101-4be1-8001-000000000001",
  facilityId = "a7f4b902-0101-4be1-8001-000000000002";
const actors = {
  operator: "a7f4b902-0101-4be1-8001-000000000003",
  viewer: "a7f4b902-0101-4be1-8001-000000000004",
  reviewer: "a7f4b902-0101-4be1-8001-000000000005",
};
export type PreviewRole = keyof typeof actors;
type Session = { csrf: string; expiresAt: number; role: PreviewRole | null };
const cookieName = "ruby_sterile_preview";
const ttl = 30 * 60 * 1000;
const secret = () => randomBytes(32).toString("hex");
/** Explicit local fixture BFF. Never imported by app.ts or the production composition root. */
export function createSterilePreview({
  repository,
  origin,
  webRoot,
  now = Date.now,
}: {
  repository: SterileRepository;
  origin: string;
  webRoot?: string;
  now?: () => number;
}): { app: express.Express; dispose: () => void } {
  assertSterilePreviewEnvironment();
  const url = new URL(origin);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    origin !== url.origin
  )
    throw new Error("Preview requires an exact loopback HTTP origin.");
  const sessions = new Map<string, Session>();
  const tokens = { operator: secret(), viewer: secret(), reviewer: secret() };
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    // A link from chat/bookmarks may be a cross-site top-level navigation.
    // Only the public entry document is exempt; sessions, API reads and writes are not.
    const publicNavigation =
      ["GET", "HEAD"].includes(req.method) &&
      req.path === "/" &&
      req.headers["sec-fetch-mode"] === "navigate" &&
      req.headers["sec-fetch-dest"] === "document";
    if (
      req.headers.host !== url.host ||
      (req.headers.origin && req.headers.origin !== origin) ||
      (req.headers["sec-fetch-site"] === "cross-site" && !publicNavigation)
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    for (const [id, s] of sessions)
      if (s.expiresAt <= now()) sessions.delete(id);
    const matches = (req.headers.cookie ?? "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v.startsWith(cookieName + "="));
    const id =
      matches.length === 1 ? matches[0]!.slice(cookieName.length + 1) : "";
    res.locals.sessionId = id;
    res.locals.session = sessions.get(id) ?? null;
    next();
  });
  function create(res: express.Response, role: PreviewRole | null) {
    if (sessions.size >= 128) sessions.delete(sessions.keys().next().value!);
    const id = secret(),
      session: Session = { csrf: secret(), expiresAt: now() + ttl, role };
    sessions.set(id, session);
    res.locals.sessionId = id;
    res.locals.session = session;
    res.setHeader(
      "Set-Cookie",
      `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ttl / 1000}`,
    );
    return session;
  }
  function projection(session: Session) {
    return {
      mode: "local-dummy-preview",
      authenticated: !!session.role,
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      ...(session.role
        ? {
            role: session.role,
            tenantId,
            actorId: actors[session.role],
            personId: actors[session.role],
            facilityId,
            facilityName: "Centro de demostración",
            timeZone: "America/Lima",
            actors: Object.fromEntries(
              Object.entries(actors).map(([role, id]) => [id, role]),
            ),
            canWrite: session.role === "operator",
            canInspect: session.role === "reviewer",
            canCorrectReceipt: session.role === "reviewer",
            canCancelReceipt: session.role === "reviewer",
            canReview: session.role === "reviewer",
            canRecall: session.role === "reviewer",
            canClearRecall: session.role === "reviewer",
            canAdmitRecall: session.role === "operator",
            canRecover: session.role === "operator",
            canReturn: session.role === "operator",
            canDisposeReturn: session.role === "reviewer",
          }
        : {}),
    };
  }
  app.get("/preview/session", (_req, res) => {
    res.json(projection(res.locals.session ?? create(res, null)));
  });
  app.use(["/preview", "/api/v1/sterile"], (req, res, next) => {
    if (req.headers.authorization) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    const s = res.locals.session as Session | null;
    if (!s) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers.origin !== origin ||
        typeof req.headers["x-sterile-csrf"] !== "string" ||
        req.headers["x-sterile-csrf"] !== s.csrf)
    ) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  });
  // Do not consume core API JSON here; the production factory applies its own strict parser.
  app.use("/preview", express.json({ limit: "8kb", strict: true }));
  app.post("/preview/login", (req, res) => {
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      !["operator", "viewer", "reviewer"].includes(req.body.role)
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    sessions.delete(res.locals.sessionId);
    res.json(projection(create(res, req.body.role as PreviewRole)));
  });
  app.post("/preview/logout", (req, res) => {
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    sessions.delete(res.locals.sessionId);
    res.json(projection(create(res, null)));
  });
  app.post("/preview/inspection-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareInspectionExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          id,
        ),
      );
  });
  app.post("/preview/packaging-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await preparePackagingExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          id,
        ),
      );
  });
  app.post("/preview/cycle-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareCycleExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          id,
        ),
      );
  });
  app.post("/preview/review-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareReviewExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          id,
        ),
      );
  });
  app.post("/preview/distribution-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareDistributionExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.post("/preview/recall-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareDistributionExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.post("/preview/distribution-scan-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareDistributionScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.post("/preview/lineage-recall-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareLineageRecallExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.post("/preview/maintenance-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareMaintenanceExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/load-scan-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareLoadScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/dashboard-paging-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareDashboardPagingExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/service-threshold-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareServiceThresholdExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/unpackaged-incident-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res.status(session.role ? 403 : 401).json({
        error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED",
      });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareUnpackagedIncidentExample(
          repository,
          { tenantId, facilityId, actorId: actors.reviewer },
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/review-queue-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareReviewQueueExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/stock-count-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    const requestId = sterileUuid(req.body.requestId),
      scope = { tenantId, facilityId, actorId: actors.operator },
      code = "COUNT-DEMO-" + requestId.toUpperCase(),
      derived = (kind: string) => {
        const h = createHash("sha256")
          .update(kind + requestId)
          .digest("hex");
        return (
          h.slice(0, 8) +
          "-" +
          h.slice(8, 12) +
          "-4" +
          h.slice(13, 16) +
          "-a" +
          h.slice(17, 20) +
          "-" +
          h.slice(20, 32)
        );
      };
    let lot = await repository.transaction(scope, (tx) =>
      tx.findConsumableByCode(code),
    );
    if (!lot)
      lot = await new ConsumableRegistry(repository).register(scope, {
        requestId,
        code,
        kind: "wrap",
        name: "SIMULATED count wrap",
        lotNumber: "SIMULATED-COUNT-LOT",
        supplier: "DEMO-SUPPLIER",
        supplierReference: "SIMULATED-DELIVERY",
        expiresOn: "2099-01-01",
        confirmed: true,
      });
    const stock = new ConsumableStockRegistry(repository);
    if (!(await stock.report(scope, lot.id)).balance)
      await stock.record(scope, lot.id, "receive", {
        requestId: derived("stock:"),
        version: 0,
        quantity: 10,
        reason: "SIMULATED count prerequisites",
        reference: "SIMULATED-DELIVERY",
        confirmed: true,
      });
    await new StockReconciliationRegistry(repository).record(scope, lot.id, {
      requestId: derived("count:"),
      stockVersion: 1,
      countedAvailable: 8,
      reason: "SIMULATED physical available count",
      reference: "SIMULATED-COUNT-EVIDENCE",
      confirmed: true,
    });
    res.status(201).json(lot);
  });
  app.post("/preview/consumable-alert-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    const requestId = sterileUuid(req.body.requestId),
      scope = { tenantId, facilityId, actorId: actors.operator },
      code = "ALERT-DEMO-" + requestId.toUpperCase();
    let lot = await repository.transaction(scope, (tx) =>
      tx.findConsumableByCode(code),
    );
    if (!lot)
      lot = await new ConsumableRegistry(repository).register(scope, {
        requestId,
        code,
        kind: "wrap",
        name: "SIMULATED alert wrap",
        lotNumber: "SIMULATED-ALERT-LOT",
        supplier: "DEMO-SUPPLIER",
        supplierReference: "SIMULATED-ALERT-DELIVERY",
        expiresOn: new Date(Date.now() + 3 * 86400000)
          .toISOString()
          .slice(0, 10),
        confirmed: true,
      });
    const stock = new ConsumableStockRegistry(repository);
    if (!(await stock.report(scope, lot.id)).balance) {
      const h = createHash("sha256")
        .update("alert-stock:" + requestId)
        .digest("hex");
      await stock.record(scope, lot.id, "receive", {
        requestId:
          h.slice(0, 8) +
          "-" +
          h.slice(8, 12) +
          "-4" +
          h.slice(13, 16) +
          "-a" +
          h.slice(17, 20) +
          "-" +
          h.slice(20, 32),
        version: 0,
        quantity: 5,
        reason: "SIMULATED alert prerequisites",
        reference: "SIMULATED-ALERT-DELIVERY",
        confirmed: true,
      });
    }
    res.status(201).json(lot);
  });
  app.post("/preview/consumable-stock-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    const requestId = sterileUuid(req.body.requestId);
    res.status(201).json(
      await new ConsumableRegistry(repository).register(
        { tenantId, facilityId, actorId: actors.operator },
        {
          requestId,
          code: "STOCK-DEMO-" + requestId,
          kind: "wrap",
          name: "SIMULATED stock wrap",
          lotNumber: "SIMULATED-STOCK-LOT",
          supplier: "DEMO-SUPPLIER",
          supplierReference: "SIMULATED-DELIVERY",
          expiresOn: "2099-01-01",
          confirmed: true,
        },
      ),
    );
  });
  app.post("/preview/equipment-incident-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareEquipmentIncidentExample(
          repository,
          { tenantId, facilityId, actorId: actors.reviewer },
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/procedure-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "reviewer") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareProcedureExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/loaner-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res.status(201).json(
      await new InstrumentRegistry(repository).createType(
        { tenantId, facilityId, actorId: actors.operator },
        {
          requestId: sterileUuid(req.body.requestId),
          code: "LOAN-TYPE-" + sterileUuid(req.body.requestId).toUpperCase(),
          name: "Fictional loaner instrument",
          manufacturer: "DEMO-SUPPLIER",
          model: "FICTITIOUS",
        },
      ),
    );
  });
  app.post("/preview/loaner-readmission-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareLoanerReadmissionExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/receiving-scan-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareReceivingScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/tray-scan-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareTrayScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/scan-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/recall-clearance-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "reviewer") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareRecallClearanceExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.post("/preview/return-scan-example", async (req, res) => {
    const session = res.locals.session as Session;
    if (session.role !== "operator") {
      res
        .status(session.role ? 403 : 401)
        .json({ error: session.role ? "FORBIDDEN" : "UNAUTHENTICATED" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareReturnScanExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          sterileUuid(req.body.requestId),
        ),
      );
  });
  app.post("/preview/return-example", async (req, res) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    if (s.role !== "operator") {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    if (
      Object.keys(req.query).length ||
      !req.body ||
      Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 ||
      typeof req.body.requestId !== "string"
    ) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    let id: string;
    try {
      id = sterileUuid(req.body.requestId);
    } catch {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }
    res
      .status(201)
      .json(
        await prepareReturnExample(
          repository,
          { tenantId, facilityId, actorId: actors.operator },
          { tenantId, facilityId, actorId: actors.reviewer },
          id,
        ),
      );
  });
  app.use("/api/v1/sterile", (req, res, next) => {
    const s = res.locals.session as Session;
    if (!s.role) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }
    // The random bridge credential is never returned to browser code or stored there.
    delete req.headers.cookie;
    req.headers.authorization = "Bearer " + tokens[s.role];
    next();
  });
  const fixtureGrants = new Set([
    "sterile.core",
    "core.authentication",
    "core.authorization",
  ]);
  if (webRoot)
    app.use(
      express.static(webRoot, {
        index: "index.html",
        dotfiles: "deny",
        redirect: false,
      }),
    );
  app.use(
    createSterileApp({
      repository,
      authenticate: async (bearer) => {
        const role = (Object.keys(tokens) as PreviewRole[]).find(
          (r) => tokens[r] === bearer,
        );
        return role
          ? {
              tenantId,
              actorId: actors[role],
              personId: actors[role],
              facilityIds: [facilityId],
            }
          : null;
      },
      authorize: async (scope, capability, permission) =>
        scope.tenantId === tenantId &&
        scope.facilityId === facilityId &&
        fixtureGrants.has(capability) &&
        fixtureGrants.has("core.authentication") &&
        fixtureGrants.has("core.authorization") &&
        ((scope.actorId === actors.operator &&
          permission !== "processing:inspect" &&
          permission !== "processing:correct" &&
          permission !== "processing:cancel" &&
          permission !== "consumables:reconcile" &&
          permission !== "consumables:policy" &&
          permission !== "consumables:withdraw" &&
          permission !== "equipment-incidents:write" &&
          permission !== "equipment:write" &&
          permission !== "procedures:publish" &&
          permission !== "maintenance:authorize" &&
          permission !== "release:write" &&
          permission !== "recall:write" &&
          permission !== "recall:clear" &&
          permission !== "returns:dispose") ||
          (scope.actorId === actors.viewer && permission.endsWith(":read")) ||
          (scope.actorId === actors.reviewer &&
            (permission.endsWith(":read") ||
              permission === "processing:inspect" ||
              permission === "processing:correct" ||
              permission === "processing:cancel" ||
              permission === "consumables:reconcile" ||
              permission === "consumables:policy" ||
              permission === "consumables:withdraw" ||
              permission === "equipment-incidents:write" ||
              permission === "equipment:write" ||
              permission === "equipment:hold" ||
              permission === "procedures:write" ||
              permission === "procedures:publish" ||
              permission === "maintenance:authorize" ||
              permission === "release:write" ||
              permission === "recall:write" ||
              permission === "recall:clear" ||
              permission === "returns:dispose"))),
    }),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const type = (error as { type?: string }).type;
      res
        .status(
          type === "entity.too.large"
            ? 413
            : type === "entity.parse.failed"
              ? 400
              : 503,
        )
        .json({
          error:
            type === "entity.too.large" || type === "entity.parse.failed"
              ? "INVALID_REQUEST"
              : "SERVICE_UNAVAILABLE",
        });
    },
  );
  return { app, dispose: () => sessions.clear() };
}
