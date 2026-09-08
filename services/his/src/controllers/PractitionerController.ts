import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Practitioner } from "@intrusionshield/his";
import { PractitionerService } from "../application/PractitionerService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class PractitionerController {
  public constructor(private readonly service: PractitionerService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const practitioner = await this.service.get(req.params.id, getTenantId(res));
    if (!practitioner) { res.status(404).json({ error: "Practitioner not found" }); return; }
    res.status(200).json(practitioner);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = req.body as Partial<Practitioner>;
    const practitioner: Practitioner = {
      ...(body as Practitioner), id: randomUUID(), tenantId: getTenantId(res),
      createdAt: now, updatedAt: now, version: 1,
      licenses: body.licenses ?? [], specialties: body.specialties ?? [],
      status: body.status ?? "ACTIVE", effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : now
    };
    res.status(201).json(await this.service.create(practitioner));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Practitioner not found" }); return; }
    const body = req.body as Partial<Practitioner>;
    const practitioner: Practitioner = {
      ...existing, ...body, id: existing.id, tenantId,
      updatedAt: new Date(), version: body.version ?? existing.version,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : existing.effectiveFrom,
      licenses: body.licenses ?? existing.licenses, specialties: body.specialties ?? existing.specialties
    };
    res.status(200).json(await this.service.update(practitioner));
  };
}
