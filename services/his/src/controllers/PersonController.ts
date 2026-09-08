import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Person } from "@intrusionshield/his";
import { PersonService } from "../application/PersonService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import { bodyAsRecord, dateFromBody } from "./requestHelpers.js";

export class PersonController {
  public constructor(private readonly service: PersonService) {}

  public get = async (req: Request, res: Response): Promise<void> => {
    const person = await this.service.get(req.params.id, getTenantId(res));
    if (!person) { res.status(404).json({ error: "Person not found" }); return; }
    res.status(200).json(person);
  };

  public create = async (req: Request, res: Response): Promise<void> => {
    const now = new Date();
    const body = bodyAsRecord(req.body);
    const person: Person = {
      id: randomUUID(), tenantId: getTenantId(res), createdAt: now, updatedAt: now, version: 1,
      firstName: String(body.firstName ?? ""), middleName: body.middleName as string | undefined,
      lastName: String(body.lastName ?? ""), preferredName: body.preferredName as string | undefined,
      dateOfBirth: body.dateOfBirth ? dateFromBody(body.dateOfBirth, now) : undefined,
      sex: (body.sex ?? "UNKNOWN") as Person["sex"], gender: body.gender as string | undefined,
      identifiers: Array.isArray(body.identifiers) ? body.identifiers as Person["identifiers"] : [],
      contactInformation: body.contactInformation as Person["contactInformation"],
      addresses: Array.isArray(body.addresses) ? body.addresses as Person["addresses"] : [],
      status: (body.status ?? "ACTIVE") as Person["status"]
    };
    res.status(201).json(await this.service.create(person));
  };

  public update = async (req: Request, res: Response): Promise<void> => {
    const tenantId = getTenantId(res);
    const existing = await this.service.get(req.params.id, tenantId);
    if (!existing) { res.status(404).json({ error: "Person not found" }); return; }
    const body = bodyAsRecord(req.body);
    const person: Person = {
      ...existing, ...body, id: existing.id, tenantId, updatedAt: new Date(),
      version: typeof body.version === "number" ? body.version : existing.version,
      dateOfBirth: body.dateOfBirth !== undefined ? dateFromBody(body.dateOfBirth, existing.dateOfBirth ?? new Date()) : existing.dateOfBirth,
      identifiers: Array.isArray(body.identifiers) ? body.identifiers as Person["identifiers"] : existing.identifiers,
      addresses: Array.isArray(body.addresses) ? body.addresses as Person["addresses"] : existing.addresses
    } as Person;
    res.status(200).json(await this.service.update(person));
  };
}
