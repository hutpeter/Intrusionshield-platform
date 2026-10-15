import { randomUUID } from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Facility
} from "@intrusionshield/his";

import type {
  FacilityService
} from "../application/FacilityService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord
} from "./requestHelpers.js";

export class FacilityController {
  public constructor(
    private readonly service:
      FacilityService
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
    const id =
      Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const facility =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!facility) {
      return res.status(404).json({
        error: "Facility not found"
      });
    }

    return res
      .status(200)
      .json(facility);
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const now = new Date();

    const body =
      bodyAsRecord(req.body);

    const facility: Facility = {
      ...body,

      id: randomUUID(),
      tenantId,

      code:
        String(body.code ?? ""),

      name:
        String(body.name ?? ""),

      facilityType:
        (body.facilityType ??
          "HOSPITAL") as
          Facility["facilityType"],

      status:
        (body.status ??
          "ACTIVE") as
          Facility["status"],

      createdAt: now,
      updatedAt: now,
      version: 1
    } as Facility;

    const created =
      await this.service.create(
        facility
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
      Array.isArray(req.params.id)
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
        error: "Facility not found"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const updated: Facility = {
      ...existing,
      ...body,

      id: existing.id,
      tenantId,

      code:
        body.code !== undefined
          ? String(body.code)
          : existing.code,

      name:
        body.name !== undefined
          ? String(body.name)
          : existing.name,

      facilityType:
        body.facilityType !== undefined
          ? body.facilityType as
              Facility["facilityType"]
          : existing.facilityType,

      status:
        body.status !== undefined
          ? body.status as
              Facility["status"]
          : existing.status,

      createdAt:
        existing.createdAt,

      updatedAt:
        new Date(),

      version:
        existing.version
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
