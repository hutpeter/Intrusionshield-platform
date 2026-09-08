import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Person } from "@intrusionshield/his";
import { PersonService } from "../application/PersonService.js";
import { getTenantId } from "../middleware/tenantContext.js";

export class PersonController {
  public constructor(private readonly service: PersonService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const person = await this.service.get(req.params.id, getTenantId(res));
    if (!person) { res.status(404).json({ error: "Person not found" }); return; }
    res.status(200).json(person);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = req.body as Partial<Person>;
    const person: Person = {
      ...(body as Person), id: randomUUID(), tenantId: getTenantId(res),
      createdAt: now, updatedAt: now, version: 1,
      identifiers: body.identifiers ?? [], addresses: body.addresses ?? [],
      sex: body.sex ?? "UNKNOWN", status: body.status ?? "ACTIVE"
    };
    const created = await this.service.create(person);
    res.status(201).json(created);
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const existing = await this.service.get(req.params.id, getTenantId(res));
    if (!existing) { res.status(404).json({ error: "Person not found" }); return; }
    const body = req.body as Partial<Person>;
    const person: Person = {
      ...existing, ...body, id: existing.id, tenantId: existing.tenantId,
      updatedAt: new Date(), version: body.version ?? existing.version,
      identifiers: body.identifiers ?? existing.identifiers,
      addresses: body.addresses ?? existing.addresses
    };
    res.status(200).json(await this.service.update(person));
  };
}
