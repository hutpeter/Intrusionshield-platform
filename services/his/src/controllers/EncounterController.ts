import { randomUUID } from "node:crypto";
import type {
  Request,
  Response
} from "express";

import type {
  Encounter
} from "@intrusionshield/his";

import type {
  EncounterService
} from "../application/EncounterService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord,
  dateFromBody
} from "./requestHelpers.js";

function routeId(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function requestVersion(
  value: unknown
): number | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
}

export class EncounterController {
  public constructor(
    private readonly service: EncounterService
  ) {}

  public get = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const id = routeId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const encounter =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!encounter) {
      return res.status(404).json({
        error: "Encounter not found"
      });
    }

    return res.status(200).json(encounter);
  };

  public listForPatient = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const patientId =
      routeId(req.params.patientId);

    if (!patientId) {
      return res.status(400).json({
        error: "patientId is required"
      });
    }

    const encounters =
      await this.service.listForPatient(
        patientId,
        getTenantId(res)
      );

    return res.status(200).json({
      items: encounters,
      total: encounters.length
    });
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);
    const body = bodyAsRecord(req.body);
    const now = new Date();

    const status =
      (body.status ?? "ARRIVED") as
        Encounter["status"];

    if (
      !["PLANNED", "ARRIVED"].includes(status)
    ) {
      return res.status(400).json({
        error:
          "New encounters must start with PLANNED or ARRIVED status"
      });
    }

    const encounter: Encounter = {
      id: randomUUID(),
      tenantId,
      patientId:
        String(body.patientId ?? ""),
      facilityId:
        String(body.facilityId ?? ""),
      registrationId:
        body.registrationId !== undefined &&
        body.registrationId !== null
          ? String(body.registrationId)
          : undefined,
      attendingPractitionerId:
        body.attendingPractitionerId !==
          undefined &&
        body.attendingPractitionerId !== null
          ? String(
              body.attendingPractitionerId
            )
          : undefined,
      encounterNumber:
        String(body.encounterNumber ?? ""),
      encounterType:
        (body.encounterType ??
          "OUTPATIENT") as
          Encounter["encounterType"],
      status,
      source:
        (body.source ?? "OTHER") as
          Encounter["source"],
      startedAt:
        body.startedAt !== undefined
          ? dateFromBody(
              body.startedAt,
              now
            )
          : now,
      endedAt: undefined,
      reasonForEncounter:
        body.reasonForEncounter !== undefined
          ? String(body.reasonForEncounter)
          : undefined,
      referralSource:
        body.referralSource !== undefined
          ? String(body.referralSource)
          : undefined,
      locationDescription:
        body.locationDescription !== undefined
          ? String(body.locationDescription)
          : undefined,
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    return res.status(201).json(
      await this.service.create(encounter)
    );
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId = getTenantId(res);
    const id = routeId(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const existing =
      await this.service.get(
        id,
        tenantId
      );

    if (!existing) {
      return res.status(404).json({
        error: "Encounter not found"
      });
    }

    const body = bodyAsRecord(req.body);

    const suppliedVersion =
      requestVersion(body.version);

    if (suppliedVersion === undefined) {
      return res.status(400).json({
        error:
          "version is required for encounter updates"
      });
    }

    if (
      suppliedVersion !== existing.version
    ) {
      return res.status(409).json({
        error:
          "Encounter was modified by another request. Refresh and try again.",
        currentVersion: existing.version
      });
    }

    const status =
      body.status !== undefined
        ? body.status as Encounter["status"]
        : existing.status;

    const allowedTransitions:
      Record<
        Encounter["status"],
        readonly Encounter["status"][]
      > = {
        PLANNED: [
          "PLANNED",
          "ARRIVED",
          "CANCELLED"
        ],
        ARRIVED: [
          "ARRIVED",
          "IN_PROGRESS",
          "CANCELLED"
        ],
        IN_PROGRESS: [
          "IN_PROGRESS",
          "ON_HOLD",
          "FINISHED"
        ],
        ON_HOLD: [
          "ON_HOLD",
          "IN_PROGRESS",
          "FINISHED",
          "CANCELLED"
        ],
        FINISHED: [
          "FINISHED"
        ],
        CANCELLED: [
          "CANCELLED"
        ]
      };

    if (
      !allowedTransitions[
        existing.status
      ].includes(status)
    ) {
      return res.status(409).json({
        error:
          `Invalid encounter status transition from ${existing.status} to ${status}`
      });
    }

    const now = new Date();

    const updated: Encounter = {
      ...existing,
      patientId:
        body.patientId !== undefined
          ? String(body.patientId)
          : existing.patientId,
      facilityId:
        body.facilityId !== undefined
          ? String(body.facilityId)
          : existing.facilityId,
      registrationId:
        body.registrationId !== undefined
          ? body.registrationId === null
            ? undefined
            : String(body.registrationId)
          : existing.registrationId,
      attendingPractitionerId:
        body.attendingPractitionerId !==
          undefined
          ? body.attendingPractitionerId ===
            null
            ? undefined
            : String(
                body.attendingPractitionerId
              )
          : existing.attendingPractitionerId,
      encounterNumber:
        body.encounterNumber !== undefined
          ? String(body.encounterNumber)
          : existing.encounterNumber,
      encounterType:
        body.encounterType !== undefined
          ? body.encounterType as
              Encounter["encounterType"]
          : existing.encounterType,
      status,
      source:
        body.source !== undefined
          ? body.source as Encounter["source"]
          : existing.source,
      startedAt:
        body.startedAt !== undefined
          ? dateFromBody(
              body.startedAt,
              existing.startedAt
            )
          : existing.startedAt,
      endedAt:
        status === "FINISHED"
          ? existing.endedAt ?? now
          : undefined,
      reasonForEncounter:
        body.reasonForEncounter !== undefined
          ? body.reasonForEncounter === null
            ? undefined
            : String(
                body.reasonForEncounter
              )
          : existing.reasonForEncounter,
      referralSource:
        body.referralSource !== undefined
          ? body.referralSource === null
            ? undefined
            : String(body.referralSource)
          : existing.referralSource,
      locationDescription:
        body.locationDescription !== undefined
          ? body.locationDescription === null
            ? undefined
            : String(
                body.locationDescription
              )
          : existing.locationDescription,
      createdAt: existing.createdAt,
      updatedAt: now,
      version: existing.version
    };

    return res.status(200).json(
      await this.service.update(updated)
    );
  };
}
