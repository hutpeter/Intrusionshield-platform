import express from "express";
import { sterileUuid } from "@intrusionshield/sterile-processing";
import {
  AccessAdministrationError,
  type SqliteSterileAccessDirectory,
} from "./sqlite-access.js";
import {
  sterilePermissions,
  type SterilePermission,
  type SterileIdentityRepository,
  type createRubySterileAccess,
} from "./access.js";
export type SterileAccessAdministration = Pick<
  SqliteSterileAccessDirectory,
  "listFacilityUsers" | "facilityHistory" | "replaceFacilityAccess"
>;
/** Mounted only after browser session, same-origin and CSRF checks. Never in demo mode. */
export function installAccessAdministration(
  app: express.Express,
  options: {
    tenantId: string;
    facilityId: string;
    directory: import("./access.js").SterileAccessDirectory;
    administration: SterileAccessAdministration;
    identities: SterileIdentityRepository;
    access: ReturnType<typeof createRubySterileAccess>;
  },
) {
  const root = "/api/v1/sterile/access";
  const active = async (actorId: string) => {
    const identity = await options.identities.findById(
      actorId,
      options.tenantId,
    );
    return identity &&
      identity.id.toLowerCase() === actorId &&
      identity.tenantId.toLowerCase() === options.tenantId &&
      identity.type === "USER" &&
      identity.status === "ACTIVE"
      ? identity
      : null;
  };
  app.use(root, async (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const principal = await options.access.authenticate(token);
      if (!principal) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }
      const scope = {
        tenantId: options.tenantId,
        facilityId: options.facilityId,
        actorId: principal.actorId,
        personId: principal.personId,
      };
      if (
        !principal.facilityIds.includes(options.facilityId) ||
        !(await options.access.authorize(
          scope,
          "sterile.core",
          "access:manage",
        ))
      ) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      const record = await options.directory.findUser(
        options.tenantId,
        principal.actorId,
      );
      if (!record) {
        res.status(403).json({ error: "FORBIDDEN" });
        return;
      }
      res.locals.accessAdministrator = record;
      next();
    } catch (error) {
      next(error);
    }
  });
  app.use(root, express.json({ limit: "16kb", strict: true }));
  app.get(root + "/users", async (req, res, next) => {
    try {
      if (Object.keys(req.query).length) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      const records = options.administration.listFacilityUsers(
        options.tenantId,
        options.facilityId,
      );
      const users = await Promise.all(
        records.map(async (user) => {
          const identity = await options.identities.findById(
            user.actorId,
            options.tenantId,
          );
          const matching =
            !!identity &&
            identity.id.toLowerCase() === user.actorId &&
            identity.tenantId.toLowerCase() === options.tenantId &&
            identity.type === "USER";
          const grant = user.facilities.find(
            (f) => f.facilityId === options.facilityId,
          )!;
          return {
            actorId: user.actorId,
            displayName:
              (matching ? identity?.displayName?.slice(0, 200) : undefined) ||
              user.actorId,
            version: user.version,
            accountActive:
              !!identity &&
              identity.id.toLowerCase() === user.actorId &&
              identity.tenantId.toLowerCase() === options.tenantId &&
              identity.type === "USER" &&
              identity.status === "ACTIVE" &&
              user.status === "ACTIVE",
            personMapped: !!user.personId,
            self:
              user.actorId === res.locals.accessAdministrator.actorId ||
              (!!user.personId &&
                user.personId === res.locals.accessAdministrator.personId),
            capabilityEnabled: grant.capabilityEnabled,
            permissions: grant.permissions,
          };
        }),
      );
      res.json({
        facilityId: options.facilityId,
        users,
        permissions: sterilePermissions,
      });
    } catch (error) {
      next(error);
    }
  });
  app.get(root + "/users/:actorId/history", async (req, res, next) => {
    try {
      let actorId: string;
      try {
        actorId = sterileUuid(req.params.actorId);
      } catch {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      if (Object.keys(req.query).length) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      const user = await options.directory.findUser(options.tenantId, actorId);
      if (!user?.facilities.some((f) => f.facilityId === options.facilityId)) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      res.json({
        events: options.administration.facilityHistory(
          options.tenantId,
          actorId,
          options.facilityId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  app.post(root + "/users/:actorId", async (req, res, next) => {
    try {
      const input = req.body;
      if (
        Object.keys(req.query).length ||
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).sort().join(",") !==
          "capabilityEnabled,confirmed,expectedVersion,permissions,reason" ||
        input.confirmed !== true ||
        !Number.isSafeInteger(input.expectedVersion) ||
        input.expectedVersion < 1 ||
        typeof input.capabilityEnabled !== "boolean" ||
        !Array.isArray(input.permissions) ||
        input.permissions.length > sterilePermissions.length ||
        new Set(input.permissions).size !== input.permissions.length ||
        input.permissions.some(
          (p: unknown) =>
            typeof p !== "string" ||
            !sterilePermissions.includes(p as SterilePermission),
        ) ||
        typeof input.reason !== "string" ||
        !input.reason.trim() ||
        input.reason.length > 400 ||
        [...(input.reason as string)].some(
          (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
        )
      ) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      let actorId: string;
      try {
        actorId = sterileUuid(req.params.actorId);
      } catch {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      const current = await options.directory.findUser(
        options.tenantId,
        actorId,
      );
      if (
        !current?.facilities.some((f) => f.facilityId === options.facilityId)
      ) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      if (
        !(await active(actorId)) ||
        current.status !== "ACTIVE" ||
        !current.personId
      ) {
        res.status(409).json({ error: "ACCOUNT_UNAVAILABLE" });
        return;
      }
      const admin = res.locals.accessAdministrator;
      if (
        current.actorId === admin.actorId ||
        current.personId === admin.personId
      ) {
        res.status(403).json({ error: "SELF_CHANGE_FORBIDDEN" });
        return;
      }
      if (current.version !== input.expectedVersion) {
        res.status(409).json({ error: "CONFLICT" });
        return;
      }
      const grant = current.facilities.find(
        (f) => f.facilityId === options.facilityId,
      )!;
      if (
        grant.capabilityEnabled === input.capabilityEnabled &&
        JSON.stringify([...grant.permissions].sort()) ===
          JSON.stringify([...input.permissions].sort())
      ) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      const saved = await options.administration.replaceFacilityAccess({
        tenantId: options.tenantId,
        facilityId: options.facilityId,
        actorId,
        administratorId: admin.actorId,
        administratorVersion: admin.version,
        expectedVersion: input.expectedVersion,
        capabilityEnabled: input.capabilityEnabled,
        permissions: input.permissions,
        reason: input.reason,
      });
      res.json({ saved: true, version: saved.version });
    } catch (error) {
      if (error instanceof AccessAdministrationError) {
        res
          .status(
            error.code === "NOT_FOUND"
              ? 404
              : error.code === "CONFLICT"
                ? 409
                : 403,
          )
          .json({ error: error.code });
        return;
      }
      next(error);
    }
  });
  // Parser errors are safe client errors; do not echo input or private storage failures.
  app.use(
    root,
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        error &&
        typeof error === "object" &&
        "type" in error &&
        ["entity.parse.failed", "entity.too.large"].includes(String(error.type))
      ) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }
      next(error);
    },
  );
}
