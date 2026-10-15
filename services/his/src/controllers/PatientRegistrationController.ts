import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { PatientRegistration } from "@intrusionshield/his";
import type { PatientRegistrationService } from "../application/PatientRegistrationService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import { bodyAsRecord, dateFromBody } from "./requestHelpers.js";

function routeId(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestVersion(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export class PatientRegistrationController {
  public constructor(private readonly service: PatientRegistrationService) {}

  public get = async (req: Request, res: Response): Promise<Response> => {
    const id = routeId(req.params.id);
    if (!id) return res.status(400).json({ error: "id is required" });
    const registration = await this.service.get(id, getTenantId(res));
    if (!registration) return res.status(404).json({ error: "Patient registration not found" });
    return res.status(200).json(registration);
  };

  public listForPatient = async (req: Request, res: Response): Promise<Response> => {
    const patientId = routeId(req.params.patientId);
    if (!patientId) return res.status(400).json({ error: "patientId is required" });
    const registrations = await this.service.listForPatient(patientId, getTenantId(res));
    return res.status(200).json({ items: registrations, total: registrations.length });
  };

  public create = async (req: Request, res: Response): Promise<Response> => {
    const tenantId = getTenantId(res);
    const body = bodyAsRecord(req.body);
    const now = new Date();
    const status = (body.status ?? "REGISTERED") as PatientRegistration["status"];

    if (status !== "REGISTERED") {
      return res.status(400).json({ error: "New patient registrations must start with REGISTERED status" });
    }

    const registration: PatientRegistration = {
      id: randomUUID(),
      tenantId,
      patientId: String(body.patientId ?? ""),
      facilityId: String(body.facilityId ?? ""),
      registrationNumber: String(body.registrationNumber ?? ""),
      registrationType: (body.registrationType ?? "OUTPATIENT") as PatientRegistration["registrationType"],
      status,
      source: (body.source ?? "OTHER") as PatientRegistration["source"],
      registeredAt: body.registeredAt !== undefined ? dateFromBody(body.registeredAt, now) : now,
      completedAt: undefined,
      cancelledAt: undefined,
      reasonForVisit: body.reasonForVisit !== undefined ? String(body.reasonForVisit) : undefined,
      registrationLocation: body.registrationLocation !== undefined ? String(body.registrationLocation) : undefined,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    return res.status(201).json(await this.service.create(registration));
  };

  public update = async (req: Request, res: Response): Promise<Response> => {
    const tenantId = getTenantId(res);
    const id = routeId(req.params.id);
    if (!id) return res.status(400).json({ error: "id is required" });

    const existing = await this.service.get(id, tenantId);
    if (!existing) return res.status(404).json({ error: "Patient registration not found" });

    const body = bodyAsRecord(req.body);
    const suppliedVersion = requestVersion(body.version);
    if (suppliedVersion === undefined) {
      return res.status(400).json({ error: "version is required for patient registration updates" });
    }
    if (suppliedVersion !== existing.version) {
      return res.status(409).json({
        error: "Patient registration was modified by another request. Refresh and try again.",
        currentVersion: existing.version
      });
    }

    const status = body.status !== undefined
      ? body.status as PatientRegistration["status"]
      : existing.status;

    if (existing.status !== "REGISTERED" && status !== existing.status) {
      return res.status(409).json({ error: `Patient registration is already ${existing.status} and cannot transition again` });
    }
    if (existing.status === "REGISTERED" && !["REGISTERED", "COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ error: "Invalid patient registration status transition" });
    }

    const now = new Date();
    const updated: PatientRegistration = {
      ...existing,
      patientId: body.patientId !== undefined ? String(body.patientId) : existing.patientId,
      facilityId: body.facilityId !== undefined ? String(body.facilityId) : existing.facilityId,
      registrationNumber: body.registrationNumber !== undefined ? String(body.registrationNumber) : existing.registrationNumber,
      registrationType: body.registrationType !== undefined ? body.registrationType as PatientRegistration["registrationType"] : existing.registrationType,
      status,
      source: body.source !== undefined ? body.source as PatientRegistration["source"] : existing.source,
      registeredAt: body.registeredAt !== undefined ? dateFromBody(body.registeredAt, existing.registeredAt) : existing.registeredAt,
      completedAt: status === "COMPLETED" ? existing.completedAt ?? now : undefined,
      cancelledAt: status === "CANCELLED" ? existing.cancelledAt ?? now : undefined,
      reasonForVisit: body.reasonForVisit !== undefined
        ? body.reasonForVisit === null ? undefined : String(body.reasonForVisit)
        : existing.reasonForVisit,
      registrationLocation: body.registrationLocation !== undefined
        ? body.registrationLocation === null ? undefined : String(body.registrationLocation)
        : existing.registrationLocation,
      createdAt: existing.createdAt,
      updatedAt: now,
      version: existing.version
    };

    return res.status(200).json(await this.service.update(updated));
  };
}
