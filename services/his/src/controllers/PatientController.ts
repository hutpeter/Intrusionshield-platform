import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";
import type { Patient } from "@intrusionshield/his";

import type { PatientService } from "../application/PatientService.js";
import { getTenantId } from "../middleware/tenantContext.js";
import {
  bodyAsRecord,
  dateFromBody
} from "./requestHelpers.js";

export class PatientController {
  public constructor(
    private readonly service: PatientService
  ) {}

  public get = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const patient = await this.service.get(
      id,
      getTenantId(res)
    );

    if (!patient) {
      return res.status(404).json({
        error: "Patient not found"
      });
    }

    return res.status(200).json(patient);
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);
    const now = new Date();
    const body = bodyAsRecord(req.body);

    const patient: Patient = {
      id: randomUUID(),
      tenantId,
      personId: String(body.personId ?? ""),
      medicalRecordNumber:
        String(body.medicalRecordNumber ?? ""),
      patientNumber:
        String(body.patientNumber ?? ""),
      status:
        (body.status ?? "ACTIVE") as Patient["status"],
      registrationDate:
        body.registrationDate !== undefined
          ? dateFromBody(body.registrationDate, now)
          : now,
      deceasedDate:
        body.deceasedDate !== undefined &&
        body.deceasedDate !== null
          ? dateFromBody(body.deceasedDate, now)
          : undefined,
      communicationPreferences:
        body.communicationPreferences as
          Patient["communicationPreferences"],
      emergencyContactPersonIds:
        Array.isArray(body.emergencyContactPersonIds)
          ? body.emergencyContactPersonIds.map(String)
          : [],
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    const created =
      await this.service.create(patient);

    return res.status(201).json(created);
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);

    const id = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const existing =
      await this.service.get(id, tenantId);

    if (!existing) {
      return res.status(404).json({
        error: "Patient not found"
      });
    }

    const body = bodyAsRecord(req.body);
    const now = new Date();

    const updated: Patient = {
      ...existing,
      ...body,
      id: existing.id,
      tenantId,
      personId:
        body.personId !== undefined
          ? String(body.personId)
          : existing.personId,
      medicalRecordNumber:
        body.medicalRecordNumber !== undefined
          ? String(body.medicalRecordNumber)
          : existing.medicalRecordNumber,
      patientNumber:
        body.patientNumber !== undefined
          ? String(body.patientNumber)
          : existing.patientNumber,
      status:
        body.status !== undefined
          ? body.status as Patient["status"]
          : existing.status,
      registrationDate:
        body.registrationDate !== undefined
          ? dateFromBody(
              body.registrationDate,
              existing.registrationDate
            )
          : existing.registrationDate,
      deceasedDate:
        body.deceasedDate !== undefined
          ? body.deceasedDate === null
            ? undefined
            : dateFromBody(
                body.deceasedDate,
                existing.deceasedDate ?? now
              )
          : existing.deceasedDate,
      communicationPreferences:
        body.communicationPreferences !== undefined
          ? body.communicationPreferences as
              Patient["communicationPreferences"]
          : existing.communicationPreferences,
      emergencyContactPersonIds:
        Array.isArray(
          body.emergencyContactPersonIds
        )
          ? body.emergencyContactPersonIds.map(String)
          : existing.emergencyContactPersonIds,
      createdAt: existing.createdAt,
      updatedAt: now,
      version: existing.version
    };

    return res
      .status(200)
      .json(
        await this.service.update(updated)
      );
  };
}