import { randomUUID } from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  ClinicalLocation
} from "@intrusionshield/his";

import type {
  ClinicalLocationService
} from "../application/ClinicalLocationService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord
} from "./requestHelpers.js";

function routeParameter(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function requestVersion(
  value: unknown
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return undefined;
  }

  return value;
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

export class ClinicalLocationController {
  public constructor(
    private readonly service:
      ClinicalLocationService
  ) {}

  public listForFacility = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const facilityId =
      routeParameter(
        req.params.facilityId
      );

    if (!facilityId) {
      return res.status(400).json({
        error: "facilityId is required"
      });
    }

    const items =
      await this.service.listForFacility(
        facilityId,
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
    const id =
      routeParameter(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const location =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!location) {
      return res.status(404).json({
        error:
          "Clinical location not found"
      });
    }

    return res
      .status(200)
      .json(location);
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const body =
      bodyAsRecord(req.body);

    const now = new Date();

    const location:
      ClinicalLocation = {
        id: randomUUID(),
        tenantId,

        facilityId:
          String(
            body.facilityId ?? ""
          ).trim(),

        parentLocationId:
          optionalString(
            body.parentLocationId
          ),

        code:
          String(
            body.code ?? ""
          ).trim(),

        name:
          String(
            body.name ?? ""
          ).trim(),

        locationType:
          (body.locationType ??
            "OTHER") as
            ClinicalLocation["locationType"],

        status:
          (body.status ??
            "ACTIVE") as
            ClinicalLocation["status"],

        description:
          optionalString(
            body.description
          ),

        floor:
          optionalString(
            body.floor
          ),

        createdAt: now,
        updatedAt: now,
        version: 1
      };

    const created =
      await this.service.create(
        location
      );

    return res
      .status(201)
      .json(created);
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const id =
      routeParameter(req.params.id);

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
        error:
          "Clinical location not found"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const version =
      requestVersion(body.version);

    if (version === undefined) {
      return res.status(400).json({
        error:
          "version is required and must be a positive integer"
      });
    }

    if (version !== existing.version) {
      return res.status(409).json({
        error:
          "Clinical location was modified by another request"
      });
    }

    const updated:
      ClinicalLocation = {
        ...existing,

        facilityId:
          body.facilityId !== undefined
            ? String(
                body.facilityId
              ).trim()
            : existing.facilityId,

        parentLocationId:
          body.parentLocationId !==
          undefined
            ? optionalString(
                body.parentLocationId
              )
            : existing.parentLocationId,

        code:
          body.code !== undefined
            ? String(
                body.code
              ).trim()
            : existing.code,

        name:
          body.name !== undefined
            ? String(
                body.name
              ).trim()
            : existing.name,

        locationType:
          body.locationType !== undefined
            ? body.locationType as
                ClinicalLocation["locationType"]
            : existing.locationType,

        status:
          body.status !== undefined
            ? body.status as
                ClinicalLocation["status"]
            : existing.status,

        description:
          body.description !== undefined
            ? optionalString(
                body.description
              )
            : existing.description,

        floor:
          body.floor !== undefined
            ? optionalString(
                body.floor
              )
            : existing.floor,

        id: existing.id,
        tenantId,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
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