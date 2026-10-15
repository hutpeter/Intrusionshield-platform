import {
  randomUUID
} from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Admission
} from "@intrusionshield/his";

import type {
  AdmissionService
} from "../application/AdmissionService.js";

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

function queryValue(
  value: unknown
): string | undefined {
  if (Array.isArray(value)) {
    return queryValue(value[0]);
  }

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const text = String(value).trim();

  return text.length > 0
    ? text
    : undefined;
}

function optionalString(
  value: unknown
): string | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const text = String(value).trim();

  return text.length > 0
    ? text
    : undefined;
}

export class AdmissionController {
  public constructor(
    private readonly service:
      AdmissionService
  ) {}

  public list = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const facilityId =
      queryValue(req.query.facilityId);

    if (!facilityId) {
      return res.status(400).json({
        error: "facilityId is required"
      });
    }

    const status =
      (
        queryValue(req.query.status) ??
        "ACTIVE"
      ).toUpperCase() as
        Admission["status"];

    const allowedStatuses =
      new Set<Admission["status"]>([
        "ACTIVE",
        "DISCHARGED",
        "CANCELLED"
      ]);

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        error:
          "status must be ACTIVE, DISCHARGED, or CANCELLED"
      });
    }

    const admissions =
      await this.service.listCensus({
        tenantId: getTenantId(res),
        facilityId,
        status
      });

    return res.status(200).json({
      items: admissions,
      total: admissions.length
    });
  };

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

    const admission =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!admission) {
      return res.status(404).json({
        error: "Admission not found"
      });
    }

    return res.status(200).json(
      admission
    );
  };

  public getForEncounter = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const encounterId =
      routeId(req.params.encounterId);

    if (!encounterId) {
      return res.status(400).json({
        error: "encounterId is required"
      });
    }

    const admission =
      await this.service.getForEncounter(
        encounterId,
        getTenantId(res)
      );

    if (!admission) {
      return res.status(404).json({
        error:
          "Admission not found for encounter"
      });
    }

    return res.status(200).json(
      admission
    );
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

    const admissions =
      await this.service.listForPatient(
        patientId,
        getTenantId(res)
      );

    return res.status(200).json({
      items: admissions,
      total: admissions.length
    });
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const body =
      bodyAsRecord(req.body);

    const now = new Date();

    const admission: Admission = {
      id: randomUUID(),
      tenantId,

      patientId:
        String(
          body.patientId ?? ""
        ).trim(),

      encounterId:
        String(
          body.encounterId ?? ""
        ).trim(),

      facilityId:
        String(
          body.facilityId ?? ""
        ).trim(),

      admissionNumber:
        String(
          body.admissionNumber ?? ""
        ).trim(),

      admissionType:
        (body.admissionType ??
          "INPATIENT") as
          Admission["admissionType"],

      admissionSource:
        (body.admissionSource ??
          "OTHER") as
          Admission["admissionSource"],

      status: "ACTIVE",

      admittedAt:
        body.admittedAt !== undefined
          ? dateFromBody(
              body.admittedAt,
              now
            )
          : now,

      dischargedAt: undefined,

      admittingPractitionerId:
        optionalString(
          body.admittingPractitionerId
        ),

      reasonForAdmission:
        optionalString(
          body.reasonForAdmission
        ),

      dischargeDisposition:
        undefined,

      dischargeNotes:
        undefined,

      createdAt: now,
      updatedAt: now,
      version: 1
    };

    return res.status(201).json(
      await this.service.create(
        admission
      )
    );
  };
}
