import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Patient } from "@intrusionshield/his";
import { PatientService } from "../application/PatientService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import { bodyAsRecord, dateFromBody } from "./requestHelpers.js";

export class PatientController {
  public constructor(private readonly service: PatientService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const patient = await this.service.get(req.params.id, getTenantId(res));
    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    res.status(200).json(patient);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = bodyAsRecord(req.body);
    const patient: Patient = {
      id: randomUUID(), tenantId: getTenantId(res), createdAt: now, updatedAt: now, version: 1,
      personId: String(body.personId ?? ""), medicalRecordNumber: String(body.medicalRecordNumber ?? ""),
      patientNumber: String(body.patientNumber ?? ""), status: (body.status ?? "ACTIVE") as Patient["status"],
      registrationDate: dateFromBody(body.registrationDate, now), deceasedDate: body.deceasedDate ? dateFromBody(body.deceasedDate, now) : undefined,
      communicationPreferences: body.communicationPreferences as Patient["communicationPreferences"],
      emergencyContactPersonIds: Array.isArray(body.emergencyContactPersonIds) ? body.emergencyContactPersonIds.map(String) : []
    };
    res.status(201).json(await this.service.create(patient));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Patient not found" }); return; }
    const body = bodyAsRecord(req.body);
    const patient: Patient = {
      ...existing, ...body, id: existing.id, tenantId, updatedAt: new Date(),
      version: typeof body.version === "number" ? body.version : existing.version,
      registrationDate: body.registrationDate !== undefined ? dateFromBody(body.registrationDate, existing.registrationDate) : existing.registrationDate,
      deceasedDate: body.deceasedDate !== undefined && body.deceasedDate !== null ? dateFromBody(body.deceasedDate, existing.deceasedDate ?? new Date()) : existing.deceasedDate,
      emergencyContactPersonIds: Array.isArray(body.emergencyContactPersonIds) ? body.emergencyContactPersonIds.map(String) : existing.emergencyContactPersonIds
    } as Patient;
    res.status(200).json(await this.service.update(patient));
  };
}
