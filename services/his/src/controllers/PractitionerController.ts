
import type { Request, Response } from "express";
import type { Practitioner } from "@intrusionshield/his";
import type { PractitionerService } from "../application/PractitionerService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class PractitionerController {
  public constructor(private readonly service: PractitionerService) {}

  public async get(req: Request, res: Response): Promise<Response> {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }

    const practitioner = await this.service.get(
      id,
      getTenantId(res)
    );

    if (!practitioner) {
      return res.status(404).json({
        error: "Practitioner not found"
      });
    }

    return res.status(200).json(practitioner);
  }

  public async create(req: Request, res: Response): Promise<Response> {
    const tenantId = getTenantId(res);

    const practitioner = req.body as Practitioner;

    const created = await this.service.create({
      ...practitioner,
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
        error: "Practitioner not found"
      });
    }

    const practitioner = req.body as Practitioner;

    const updated = await this.service.update({
      ...practitioner,
      id,
      tenantId,
      version: existing.version
    });

    return res.status(200).json(updated);
  }
}

