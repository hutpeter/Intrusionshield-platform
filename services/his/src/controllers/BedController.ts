import { randomUUID } from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Bed
} from "@intrusionshield/his";

import type {
  BedService
} from "../application/BedService.js";

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

export class BedController {
  public constructor(
    private readonly service:
      BedService
  ) {}

  public listForLocation = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const locationId =
      routeParameter(
        req.params.locationId
      );

    if (!locationId) {
      return res.status(400).json({
        error: "locationId is required"
      });
    }

    const items =
      await this.service.listForLocation(
        locationId,
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

    const bed =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!bed) {
      return res.status(404).json({
        error: "Bed not found"
      });
    }

    return res
      .status(200)
      .json(bed);
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

    const bed: Bed = {
      id: randomUUID(),
      tenantId,

      facilityId:
        String(
          body.facilityId ?? ""
        ),

      locationId:
        String(
          body.locationId ?? ""
        ),

      code:
        String(body.code ?? ""),

      name:
        String(body.name ?? ""),

      bedType:
        (body.bedType ??
          "STANDARD") as
          Bed["bedType"],

      status:
        (body.status ??
          "ACTIVE") as
          Bed["status"],

      operationalStatus:
        (body.operationalStatus ??
          "AVAILABLE") as
          Bed["operationalStatus"],

      description:
        body.description !== undefined
          ? String(body.description)
          : undefined,

      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const created =
      await this.service.create(bed);

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
        error: "Bed not found"
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
          "Bed was modified by another request"
      });
    }

    const updated: Bed = {
      ...existing,

      facilityId:
        body.facilityId !== undefined
          ? String(body.facilityId)
          : existing.facilityId,

      locationId:
        body.locationId !== undefined
          ? String(body.locationId)
          : existing.locationId,

      code:
        body.code !== undefined
          ? String(body.code)
          : existing.code,

      name:
        body.name !== undefined
          ? String(body.name)
          : existing.name,

      bedType:
        body.bedType !== undefined
          ? body.bedType as
              Bed["bedType"]
          : existing.bedType,

      status:
        body.status !== undefined
          ? body.status as
              Bed["status"]
          : existing.status,

      operationalStatus:
        body.operationalStatus !==
        undefined
          ? body.operationalStatus as
              Bed["operationalStatus"]
          : existing.operationalStatus,

      description:
        body.description !== undefined
          ? body.description === null
            ? undefined
            : String(body.description)
          : existing.description,

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
