import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";
import type { Practitioner } from "@intrusionshield/his";

import type { PractitionerService } from "../application/PractitionerService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import {
  bodyAsRecord,
  dateFromBody
} from "./requestHelpers.js";

export class PractitionerController {
  public constructor(
    private readonly service: PractitionerService
  ) {}

  public list = async (
    _req: Request,
    res: Response
  ): Promise<Response> => {
    const items =
      await this.service.list(
        getTenantId(res)
      );

    return res.status(200).json({
      items,
      total: items.length
    });
  };
  public get = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const practitioner =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!practitioner) {
      return res.status(404).json({
        error: "Practitioner not found"
      });
    }

    return res
      .status(200)
      .json(practitioner);
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);
    const now = new Date();
    const body = bodyAsRecord(req.body);

    const practitioner: Practitioner = {
      id: randomUUID(),
      tenantId,
      personId:
        String(body.personId ?? ""),
      practitionerNumber:
        String(body.practitionerNumber ?? ""),
      practitionerType:
        (body.practitionerType ??
          "PHYSICIAN") as
          Practitioner["practitionerType"],
      status:
        (body.status ??
          "ACTIVE") as Practitioner["status"],
      effectiveFrom:
        body.effectiveFrom !== undefined
          ? dateFromBody(
              body.effectiveFrom,
              now
            )
          : now,
      effectiveUntil:
        body.effectiveUntil !== undefined &&
        body.effectiveUntil !== null
          ? dateFromBody(
              body.effectiveUntil,
              now
            )
          : undefined,
      licenses: parseLicenses(
        body.licenses,
        now
      ),
      specialties:
        Array.isArray(body.specialties)
          ? body.specialties.map(String)
          : [],
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const created =
      await this.service.create(
        practitioner
      );

    return res.status(201).json(created);
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);

    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const existing =
      await this.service.get(
        id,
        tenantId
      );

    if (!existing) {
      return res.status(404).json({
        error: "Practitioner not found"
      });
    }

    const body = bodyAsRecord(req.body);
    const now = new Date();

    const updated: Practitioner = {
      ...existing,
      ...body,
      id: existing.id,
      tenantId,
      personId:
        body.personId !== undefined
          ? String(body.personId)
          : existing.personId,
      practitionerNumber:
        body.practitionerNumber !== undefined
          ? String(body.practitionerNumber)
          : existing.practitionerNumber,
      practitionerType:
        body.practitionerType !== undefined
          ? body.practitionerType as
              Practitioner["practitionerType"]
          : existing.practitionerType,
      status:
        body.status !== undefined
          ? body.status as
              Practitioner["status"]
          : existing.status,
      effectiveFrom:
        body.effectiveFrom !== undefined
          ? dateFromBody(
              body.effectiveFrom,
              existing.effectiveFrom
            )
          : existing.effectiveFrom,
      effectiveUntil:
        body.effectiveUntil !== undefined
          ? body.effectiveUntil === null
            ? undefined
            : dateFromBody(
                body.effectiveUntil,
                existing.effectiveUntil ?? now
              )
          : existing.effectiveUntil,
      licenses:
        body.licenses !== undefined
          ? parseLicenses(
              body.licenses,
              now
            )
          : existing.licenses,
      specialties:
        Array.isArray(body.specialties)
          ? body.specialties.map(String)
          : existing.specialties,
      createdAt: existing.createdAt,
      updatedAt: now,
      version: existing.version
    };

    return res
      .status(200)
      .json(
        await this.service.update(
          updated
        )
      );
  };
}

function parseLicenses(
  value: unknown,
  fallbackDate: Date
): Practitioner["licenses"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = bodyAsRecord(item);

    return {
      jurisdiction:
        String(record.jurisdiction ?? ""),
      licenseNumber:
        String(record.licenseNumber ?? ""),
      issuedAt:
        record.issuedAt !== undefined &&
        record.issuedAt !== null
          ? dateFromBody(
              record.issuedAt,
              fallbackDate
            )
          : undefined,
      expiresAt:
        record.expiresAt !== undefined &&
        record.expiresAt !== null
          ? dateFromBody(
              record.expiresAt,
              fallbackDate
            )
          : undefined
    };
  });
}
