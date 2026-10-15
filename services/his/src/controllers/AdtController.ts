import {
  randomUUID
} from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Admission
} from "@intrusionshield/his";

import type {
  AdtService
} from "../application/AdtService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord,
  dateFromBody
} from "./requestHelpers.js";

function routeId(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function optionalString(
  value: unknown
): string | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const text = String(value).trim();

  return text.length > 0
    ? text
    : undefined;
}

function positiveVersion(
  value: unknown
): number | undefined {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
}

export class AdtController {
  public constructor(
    private readonly service:
      AdtService
  ) {}

  public listAssignments = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const admissionId =
      routeId(req.params.admissionId);

    if (!admissionId) {
      return res.status(400).json({
        error: "admissionId is required"
      });
    }

    const assignments =
      await this.service.listAssignments(
        admissionId,
        getTenantId(res)
      );

    return res.status(200).json({
      items: assignments,
      total: assignments.length
    });
  };

  public assignBed = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const admissionId =
      routeId(req.params.admissionId);

    if (!admissionId) {
      return res.status(400).json({
        error: "admissionId is required"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const bedId =
      String(
        body.bedId ?? ""
      ).trim();

    if (!bedId) {
      return res.status(400).json({
        error: "bedId is required"
      });
    }

    const now = new Date();

    const assignment =
      await this.service.assignBed({
        id: randomUUID(),
        tenantId: getTenantId(res),
        admissionId,
        bedId,
        assignedAt:
          body.assignedAt !== undefined
            ? dateFromBody(
                body.assignedAt,
                now
              )
            : now,
        notes:
          optionalString(body.notes)
      });

    return res.status(201).json(
      assignment
    );
  };

  public transfer = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const admissionId =
      routeId(req.params.admissionId);

    if (!admissionId) {
      return res.status(400).json({
        error: "admissionId is required"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const destinationBedId =
      String(
        body.destinationBedId ?? ""
      ).trim();

    if (!destinationBedId) {
      return res.status(400).json({
        error:
          "destinationBedId is required"
      });
    }

    const now = new Date();

    const assignment =
      await this.service.transfer({
        newAssignmentId:
          randomUUID(),
        tenantId:
          getTenantId(res),
        admissionId,
        destinationBedId,
        transferredAt:
          body.transferredAt !== undefined
            ? dateFromBody(
                body.transferredAt,
                now
              )
            : now,
        notes:
          optionalString(body.notes)
      });

    return res.status(201).json(
      assignment
    );
  };

  public discharge = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const admissionId =
      routeId(req.params.admissionId);

    if (!admissionId) {
      return res.status(400).json({
        error: "admissionId is required"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const version =
      positiveVersion(body.version);

    if (version === undefined) {
      return res.status(400).json({
        error:
          "version is required for discharge"
      });
    }

    const disposition =
      String(
        body.dischargeDisposition ??
        ""
      ).trim() as
        Admission["dischargeDisposition"];

    if (!disposition) {
      return res.status(400).json({
        error:
          "dischargeDisposition is required"
      });
    }

    const allowed =
      new Set([
        "HOME",
        "TRANSFER",
        "LONG_TERM_CARE",
        "REHABILITATION",
        "HOSPICE",
        "LEFT_AGAINST_ADVICE",
        "DECEASED",
        "OTHER"
      ]);

    if (!allowed.has(disposition)) {
      return res.status(400).json({
        error:
          "dischargeDisposition is invalid"
      });
    }

    const now = new Date();

    const admission =
      await this.service.discharge({
        tenantId:
          getTenantId(res),
        admissionId,
        dischargedAt:
          body.dischargedAt !== undefined
            ? dateFromBody(
                body.dischargedAt,
                now
              )
            : now,
        dischargeDisposition:
          disposition,
        dischargeNotes:
          optionalString(
            body.dischargeNotes
          ),
        admissionVersion:
          version
      });

    return res.status(200).json(
      admission
    );
  };
}
