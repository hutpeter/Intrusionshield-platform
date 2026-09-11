
import type { Request, Response } from "express";
import type { Facility } from "@intrusionshield/his";
import type { FacilityService } from "../application/FacilityService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class FacilityController {
  public constructor(private readonly service: FacilityService) {}

  public async get(req: Request, res: Response): Promise<Response> {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const facility = await this.service.get(
      id,
      getTenantId(res)
    );

    if (!facility) {
      return res.status(404).json({
        error: "Facility not found"
      });
    }

    return res.status(200).json(facility);
  }

  public async create(req: Request, res: Response): Promise<Response> {
    const tenantId = getTenantId(res);

    const facility = req.body as Facility;

    const created = await this.service.create({
      ...facility,
      tenantId
    });

    return res.status(201).json(created);
  }

  public async update(req: Request, res: Response): Promise<Response> {
    const tenantId = getTenantId(res);

    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const existing = await this.service.get(id, tenantId);

    if (!existing) {
      return res.status(404).json({
        error: "Facility not found"
      });
    }

    const facility = req.body as Facility;

    const updated = await this.service.update({
      ...facility,
      id,
      tenantId,
      version: existing.version
    });

    return res.status(200).json(updated);
  }
}

