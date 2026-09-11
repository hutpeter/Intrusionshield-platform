
import type { Request, Response } from "express";
import type { Patient } from "@intrusionshield/his";
import type { PatientService } from "../application/PatientService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class PatientController {
  public constructor(private readonly service: PatientService) {}

  public async get(req: Request, res: Response): Promise<Response> {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const patient = await this.service.get(id, getTenantId(res));

    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    return res.status(200).json(patient);
  }

  public async create(req: Request, res: Response): Promise<Response> {
    const tenantId = getTenantId(res);

    const patient = req.body as Patient;

    const created = await this.service.create({
      ...patient,
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
      return res.status(404).json({ error: "Patient not found" });
    }

    const patient = req.body as Patient;

    const updated = await this.service.update({
      ...patient,
      id,
      tenantId,
      version: existing.version
    });

    return res.status(200).json(updated);
  }
}

