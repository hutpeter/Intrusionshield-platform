import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Practitioner } from "@intrusionshield/his";
import { PractitionerService } from "../application/PractitionerService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import { bodyAsRecord, dateFromBody } from "./requestHelpers.js";

export class PractitionerController {
  public constructor(private readonly service: PractitionerService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const practitioner = await this.service.get(req.params.id, getTenantId(res));
    if (!practitioner) { res.status(404).json({ error: "Practitioner not found" }); return; }
    res.status(200).json(practitioner);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = bodyAsRecord(req.body);
    const practitioner: Practitioner = {
      id: randomUUID(), tenantId: getTenantId(res), createdAt: now, updatedAt: now, version: 1,
      personId: String(body.personId ?? ""), practitionerNumber: String(body.practitionerNumber ?? ""),
      practitionerType: (body.practitionerType ?? "OTHER") as Practitioner["practitionerType"],
      status: (body.status ?? "ACTIVE") as Practitioner["status"],
      licenses: Array.isArray(body.licenses) ? body.licenses as Practitioner["licenses"] : [],
      specialties: Array.isArray(body.specialties) ? body.specialties.map(String) : [],
      effectiveFrom: dateFromBody(body.effectiveFrom, now),
      effectiveUntil: body.effectiveUntil ? dateFromBody(body.effectiveUntil, now) : undefined
    };
    res.status(201).json(await this.service.create(practitioner));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Practitioner not found" }); return; }
    const body = bodyAsRecord(req.body);
    const practitioner: Practitioner = {
      ...existing, ...body, id: existing.id, tenantId, updatedAt: new Date(),
      version: typeof body.version === "number" ? body.version : existing.version,
      effectiveFrom: body.effectiveFrom !== undefined ? dateFromBody(body.effectiveFrom, existing.effectiveFrom) : existing.effectiveFrom,
      effectiveUntil: body.effectiveUntil !== undefined && body.effectiveUntil !== null ? dateFromBody(body.effectiveUntil, existing.effectiveUntil ?? new Date()) : existing.effectiveUntil,
      licenses: Array.isArray(body.licenses) ? body.licenses as Practitioner["licenses"] : existing.licenses,
      specialties: Array.isArray(body.specialties) ? body.specialties.map(String) : existing.specialties
    } as Practitioner;
    res.status(200).json(await this.service.update(practitioner));
  };
}
