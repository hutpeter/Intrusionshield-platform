import {
  randomUUID
} from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Appointment
} from "@intrusionshield/his";

import type {
  AppointmentService
} from "../application/AppointmentService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord
} from "./requestHelpers.js";

function routeParameter(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function queryParameter(
  value: unknown
): string | undefined {
  if (Array.isArray(value)) {
    return value.length > 0
      ? String(value[0])
      : undefined;
  }

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const text =
    String(value).trim();

  return text || undefined;
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

  const text =
    String(value).trim();

  return text || undefined;
}

function requiredDate(
  value: unknown,
  name: string
): Date {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw new Error(
      `${name} is required`
    );
  }

  const date =
    new Date(String(value));

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      `${name} is invalid`
    );
  }

  return date;
}

function optionalDate(
  value: unknown,
  name: string
): Date | undefined {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return undefined;
  }

  const date =
    new Date(String(value));

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      `${name} is invalid`
    );
  }

  return date;
}

function requestVersion(
  value: unknown
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return undefined;
  }

  return value;
}

export class AppointmentController {
  public constructor(
    private readonly service:
      AppointmentService
  ) {}

  public search = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const items =
      await this.service.search({
        tenantId,

        patientId:
          queryParameter(
            req.query.patientId
          ),

        practitionerId:
          queryParameter(
            req.query.practitionerId
          ),

        facilityId:
          queryParameter(
            req.query.facilityId
          ),

        clinicalLocationId:
          queryParameter(
            req.query.clinicalLocationId
          ),

        status:
          queryParameter(
            req.query.status
          ) as
            Appointment["status"] |
            undefined,

        from:
          optionalDate(
            req.query.from,
            "from"
          ),

        to:
          optionalDate(
            req.query.to,
            "to"
          )
      });

    return res.status(200).json({
      items,
      total: items.length
    });
  };

  public listForPatient = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const patientId =
      routeParameter(
        req.params.patientId
      );

    if (!patientId) {
      return res.status(400).json({
        error:
          "patientId is required"
      });
    }

    const items =
      await this.service.search({
        tenantId:
          getTenantId(res),
        patientId
      });

    return res.status(200).json({
      items,
      total: items.length
    });
  };

  public get = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const id =
      routeParameter(
        req.params.id
      );

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const appointment =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!appointment) {
      return res.status(404).json({
        error:
          "Appointment not found"
      });
    }

    return res
      .status(200)
      .json(appointment);
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

    const appointment:
      Appointment = {
        id: randomUUID(),
        tenantId,

        patientId:
          String(
            body.patientId ?? ""
          ).trim(),

        facilityId:
          String(
            body.facilityId ?? ""
          ).trim(),

        practitionerId:
          optionalString(
            body.practitionerId
          ),

        clinicalLocationId:
          optionalString(
            body.clinicalLocationId
          ),

        encounterId:
          optionalString(
            body.encounterId
          ),

        appointmentNumber:
          String(
            body.appointmentNumber ??
            `APT-${Date.now()}`
          ).trim(),

        appointmentType:
          (body.appointmentType ??
            "CONSULTATION") as
            Appointment["appointmentType"],

        status:
          (body.status ??
            "BOOKED") as
            Appointment["status"],

        source:
          (body.source ??
            "STAFF") as
            Appointment["source"],

        scheduledStart:
          requiredDate(
            body.scheduledStart,
            "scheduledStart"
          ),

        scheduledEnd:
          requiredDate(
            body.scheduledEnd,
            "scheduledEnd"
          ),

        reason:
          optionalString(
            body.reason
          ),

        notes:
          optionalString(
            body.notes
          ),

        cancellationReason:
          undefined,

        cancelledAt:
          undefined,

        checkedInAt:
          undefined,

        completedAt:
          undefined,

        createdAt: now,
        updatedAt: now,
        version: 1
      };

    const created =
      await this.service.create(
        appointment
      );

    return res
      .status(201)
      .json(created);
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const tenantId =
      getTenantId(res);

    const id =
      routeParameter(
        req.params.id
      );

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
        error:
          "Appointment not found"
      });
    }

    const body =
      bodyAsRecord(req.body);

    const version =
      requestVersion(
        body.version
      );

    if (version === undefined) {
      return res.status(400).json({
        error:
          "version is required and must be a positive integer"
      });
    }

    if (
      version !==
      existing.version
    ) {
      return res.status(409).json({
        error:
          "Appointment was modified by another request"
      });
    }

    const updated:
      Appointment = {
        ...existing,

        patientId:
          body.patientId !== undefined
            ? String(
                body.patientId
              ).trim()
            : existing.patientId,

        facilityId:
          body.facilityId !== undefined
            ? String(
                body.facilityId
              ).trim()
            : existing.facilityId,

        practitionerId:
          body.practitionerId !==
          undefined
            ? optionalString(
                body.practitionerId
              )
            : existing.practitionerId,

        clinicalLocationId:
          body.clinicalLocationId !==
          undefined
            ? optionalString(
                body.clinicalLocationId
              )
            : existing.clinicalLocationId,

        encounterId:
          body.encounterId !==
          undefined
            ? optionalString(
                body.encounterId
              )
            : existing.encounterId,

        appointmentNumber:
          body.appointmentNumber !==
          undefined
            ? String(
                body.appointmentNumber
              ).trim()
            : existing.appointmentNumber,

        appointmentType:
          body.appointmentType !==
          undefined
            ? body.appointmentType as
                Appointment["appointmentType"]
            : existing.appointmentType,

        source:
          body.source !== undefined
            ? body.source as
                Appointment["source"]
            : existing.source,

        scheduledStart:
          body.scheduledStart !==
          undefined
            ? requiredDate(
                body.scheduledStart,
                "scheduledStart"
              )
            : existing.scheduledStart,

        scheduledEnd:
          body.scheduledEnd !==
          undefined
            ? requiredDate(
                body.scheduledEnd,
                "scheduledEnd"
              )
            : existing.scheduledEnd,

        reason:
          body.reason !== undefined
            ? optionalString(
                body.reason
              )
            : existing.reason,

        notes:
          body.notes !== undefined
            ? optionalString(
                body.notes
              )
            : existing.notes,

        id: existing.id,
        tenantId,
        status: existing.status,

        createdAt:
          existing.createdAt,

        updatedAt:
          new Date(),

        version:
          existing.version
      };

    const saved =
      await this.service.update(
        updated
      );

    return res
      .status(200)
      .json(saved);
  };

  public confirm = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    return this.transition(
      req,
      res,
      "CONFIRMED"
    );
  };

  public checkIn = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    return this.transition(
      req,
      res,
      "CHECKED_IN"
    );
  };

  public complete = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    return this.transition(
      req,
      res,
      "COMPLETED"
    );
  };

  public noShow = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    return this.transition(
      req,
      res,
      "NO_SHOW"
    );
  };

  public cancel = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const body =
      bodyAsRecord(req.body);

    return this.transition(
      req,
      res,
      "CANCELLED",
      optionalString(
        body.reason
      )
    );
  };

  private transition = async (
    req: Request,
    res: Response,
    status: Appointment["status"],
    cancellationReason?: string
  ): Promise<Response> => {
    const id =
      routeParameter(
        req.params.id
      );

    if (!id) {
      return res.status(400).json({
        error: "id is required"
      });
    }

    const appointment =
      await this.service.transition(
        id,
        getTenantId(res),
        status,
        cancellationReason
      );

    return res
      .status(200)
      .json(appointment);
  };
}
