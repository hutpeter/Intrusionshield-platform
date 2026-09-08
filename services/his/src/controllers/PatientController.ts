import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Patient } from "@intrusionshield/his";
import { PatientService } from "../application/PatientService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class PatientController {
  public constructor(private readonly service: PatientService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const patient = await this.service.get(req.params.id, getTenantId(res));
    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    res.status(200).json(patient);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = req.body as Partial<Patient>;
    const patient: Patient = {
      ...(body as Patient), id: randomUUID(), tenantId: getTenantId(res),
      createdAt: now, updatedAt: now, version: 1,
      emergencyContactPersonIds: body.emergencyContactPersonIds ?? [],
      status: body.status ?? "ACTIVE", registrationDate: body.registrationDate ? new Date(body.registrationDate) : now
    };
    res.status(201).json(await this.service.create(patient));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Patient not found" }); return; }
    const body = req.body as Partial<Patient>;
    const patient: Patient = {
      ...existing, ...body, id: existing.id, tenantId,
      updatedAt: new Date(), version: body.version ?? existing.version,
      registrationDate: body.registrationDate ? new Date(body.registrationDate) : existing.registrationDate,
      emergencyContactPersonIds: body.emergencyContactPersonIds ?? existing.emergencyContactPersonIds
    };
    res.status(200).json(await this.service.update(patient));
  };
}
