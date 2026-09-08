import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Facility } from "@intrusionshield/his";
import { FacilityService } from "../application/FacilityService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class FacilityController {
  public constructor(private readonly service: FacilityService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const facility = await this.service.get(req.params.id, getTenantId(res));
    if (!facility) { res.status(404).json({ error: "Facility not found" }); return; }
    res.status(200).json(facility);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = req.body as Partial<Facility>;
    const facility: Facility = {
      ...(body as Facility), id: randomUUID(), tenantId: getTenantId(res),
      createdAt: now, updatedAt: now, version: 1,
      status: body.status ?? "ACTIVE"
    };
    res.status(201).json(await this.service.create(facility));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Facility not found" }); return; }
    const body = req.body as Partial<Facility>;
    const facility: Facility = {
      ...existing, ...body, id: existing.id, tenantId,
      updatedAt: new Date(), version: body.version ?? existing.version
    };
    res.status(200).json(await this.service.update(facility));
  };
}
