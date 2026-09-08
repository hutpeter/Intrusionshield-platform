import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Facility } from "@intrusionshield/his";
import { FacilityService } from "../application/FacilityService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import { bodyAsRecord } from "./requestHelpers.js";

export class FacilityController {
  public constructor(private readonly service: FacilityService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const facility = await this.service.get(req.params.id, getTenantId(res));
    if (!facility) { res.status(404).json({ error: "Facility not found" }); return; }
    res.status(200).json(facility);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = bodyAsRecord(req.body);
    const facility: Facility = {
      ...(body as Partial<Facility>), id: randomUUID(), tenantId: getTenantId(res),
      createdAt: now, updatedAt: now, version: 1,
      facilityType: (body.facilityType ?? "OTHER") as Facility["facilityType"],
      code: String(body.code ?? ""), name: String(body.name ?? ""), status: (body.status ?? "ACTIVE") as Facility["status"]
    };
    res.status(201).json(await this.service.create(facility));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Facility not found" }); return; }
    const body = bodyAsRecord(req.body);
    const facility: Facility = {
      ...existing, ...body, id: existing.id, tenantId, updatedAt: new Date(),
      version: typeof body.version === "number" ? body.version : existing.version
    } as Facility;
    res.status(200).json(await this.service.update(facility));
  };
}
