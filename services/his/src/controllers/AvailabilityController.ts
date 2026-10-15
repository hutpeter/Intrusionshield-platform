import {
  randomUUID
} from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  AvailabilityException,
  AvailabilityResourceType,
  AvailabilityRule
} from "@intrusionshield/his";

import type {
  AvailabilityService
} from "../application/AvailabilityService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord
} from "./requestHelpers.js";

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

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
      ? String(value[0]).trim() ||
          undefined
      : undefined;
  }

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return String(value).trim() ||
    undefined;
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

  return String(value).trim() ||
    undefined;
}

function requiredString(
  value: unknown,
  name: string
): string {
  const result =
    optionalString(value);

  if (!result) {
    throw new Error(
      `${name} is required`
    );
  }

  return result;
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

function requiredDateOnly(
  value: unknown,
  name: string
): string {
  const result =
    requiredString(
      value,
      name
    );

  if (!datePattern.test(result)) {
    throw new Error(
      `${name} must use YYYY-MM-DD format`
    );
  }

  const [
    year,
    month,
    day
  ] = result
    .split("-")
    .map(Number);

  const check =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(
      `${name} is invalid`
    );
  }

  return result;
}

function optionalDateOnly(
  value: unknown,
  name: string
): string | undefined {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return undefined;
  }

  return requiredDateOnly(
    value,
    name
  );
}

function requiredInteger(
  value: unknown,
  name: string
): number {
  const result =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(result)
  ) {
    throw new Error(
      `${name} must be an integer`
    );
  }

  return result;
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

function requiredBoolean(
  value: unknown,
  defaultValue: boolean
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error(
      "active must be boolean"
    );
  }

  return value;
}

export class AvailabilityController {
  public constructor(
    private readonly service:
      AvailabilityService
  ) {}

  public getSlots = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const practitionerId =
      queryParameter(
        req.query.practitionerId
      );

    const clinicalLocationId =
      queryParameter(
        req.query.clinicalLocationId
      );

    if (
      !practitionerId &&
      !clinicalLocationId
    ) {
      throw new Error(
        "practitionerId or clinicalLocationId is required"
      );
    }

    const result =
      await this.service.getSlots({
        tenantId:
          getTenantId(res),

        practitionerId,
        clinicalLocationId,

        from:
          requiredDateOnly(
            req.query.from,
            "from"
          ),

        to:
          requiredDateOnly(
            req.query.to,
            "to"
          ),

        durationMinutes:
          requiredInteger(
            req.query.durationMinutes,
            "durationMinutes"
          ),

        timeZone:
          requiredString(
            queryParameter(
              req.query.timeZone
            ),
            "timeZone"
          )
      });

    return res
      .status(200)
      .json(result);
  };

  public listRules = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const dayOfWeekText =
      queryParameter(
        req.query.dayOfWeek
      );

    const activeText =
      queryParameter(
        req.query.active
      );

    let active:
      boolean | undefined;

    if (activeText !== undefined) {
      if (
        activeText !== "true" &&
        activeText !== "false"
      ) {
        throw new Error(
          "active is invalid"
        );
      }

      active =
        activeText === "true";
    }

    const items =
      await this.service.listRules({
        tenantId:
          getTenantId(res),

        resourceType:
          queryParameter(
            req.query.resourceType
          ) as
            AvailabilityResourceType |
            undefined,

        resourceId:
          queryParameter(
            req.query.resourceId
          ),

        dayOfWeek:
          dayOfWeekText !== undefined
            ? requiredInteger(
                dayOfWeekText,
                "dayOfWeek"
              )
            : undefined,

        effectiveOn:
          optionalDateOnly(
            req.query.effectiveOn,
            "effectiveOn"
          ),

        active
      });

    return res.status(200).json({
      items,
      total: items.length
    });
  };

  public getRule = async (
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

    const item =
      await this.service.getRule(
        id,
        getTenantId(res)
      );

    if (!item) {
      return res.status(404).json({
        error:
          "Availability rule not found"
      });
    }

    return res.status(200).json(
      item
    );
  };

  public createRule = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const body =
      bodyAsRecord(req.body);

    const now =
      new Date();

    const rule:
      AvailabilityRule = {
        id: randomUUID(),

        tenantId:
          getTenantId(res),

        resourceType:
          requiredString(
            body.resourceType,
            "resourceType"
          ) as
            AvailabilityResourceType,

        resourceId:
          requiredString(
            body.resourceId,
            "resourceId"
          ),

        dayOfWeek:
          requiredInteger(
            body.dayOfWeek,
            "dayOfWeek"
          ),

        startTime:
          requiredString(
            body.startTime,
            "startTime"
          ),

        endTime:
          requiredString(
            body.endTime,
            "endTime"
          ),

        effectiveFrom:
          requiredDateOnly(
            body.effectiveFrom,
            "effectiveFrom"
          ),

        effectiveTo:
          optionalDateOnly(
            body.effectiveTo,
            "effectiveTo"
          ),

        active:
          requiredBoolean(
            body.active,
            true
          ),

        createdAt: now,
        updatedAt: now,
        version: 1
      };

    const created =
      await this.service.createRule(
        rule
      );

    return res
      .status(201)
      .json(created);
  };

  public updateRule = async (
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
      await this.service.getRule(
        id,
        tenantId
      );

    if (!existing) {
      return res.status(404).json({
        error:
          "Availability rule not found"
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
      version !== existing.version
    ) {
      return res.status(409).json({
        error:
          "Availability rule was modified by another request"
      });
    }

    const updated:
      AvailabilityRule = {
        ...existing,

        resourceType:
          body.resourceType !==
          undefined
            ? requiredString(
                body.resourceType,
                "resourceType"
              ) as
                AvailabilityResourceType
            : existing.resourceType,

        resourceId:
          body.resourceId !== undefined
            ? requiredString(
                body.resourceId,
                "resourceId"
              )
            : existing.resourceId,

        dayOfWeek:
          body.dayOfWeek !== undefined
            ? requiredInteger(
                body.dayOfWeek,
                "dayOfWeek"
              )
            : existing.dayOfWeek,

        startTime:
          body.startTime !== undefined
            ? requiredString(
                body.startTime,
                "startTime"
              )
            : existing.startTime,

        endTime:
          body.endTime !== undefined
            ? requiredString(
                body.endTime,
                "endTime"
              )
            : existing.endTime,

        effectiveFrom:
          body.effectiveFrom !==
          undefined
            ? requiredDateOnly(
                body.effectiveFrom,
                "effectiveFrom"
              )
            : existing.effectiveFrom,

        effectiveTo:
          body.effectiveTo !==
          undefined
            ? optionalDateOnly(
                body.effectiveTo,
                "effectiveTo"
              )
            : existing.effectiveTo,

        active:
          body.active !== undefined
            ? requiredBoolean(
                body.active,
                existing.active
              )
            : existing.active,

        id: existing.id,
        tenantId,

        createdAt:
          existing.createdAt,

        updatedAt:
          new Date(),

        version:
          existing.version
      };

    const saved =
      await this.service.updateRule(
        updated
      );

    return res
      .status(200)
      .json(saved);
  };

  public listExceptions = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const items =
      await this.service.listExceptions({
        tenantId:
          getTenantId(res),

        resourceType:
          queryParameter(
            req.query.resourceType
          ) as
            AvailabilityResourceType |
            undefined,

        resourceId:
          queryParameter(
            req.query.resourceId
          ),

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

  public getException = async (
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

    const item =
      await this.service.getException(
        id,
        getTenantId(res)
      );

    if (!item) {
      return res.status(404).json({
        error:
          "Availability exception not found"
      });
    }

    return res.status(200).json(
      item
    );
  };

  public createException = async (
    req: Request,
    res: Response
  ): Promise<Response> => {
    const body =
      bodyAsRecord(req.body);

    const now =
      new Date();

    const exception:
      AvailabilityException = {
        id: randomUUID(),

        tenantId:
          getTenantId(res),

        resourceType:
          requiredString(
            body.resourceType,
            "resourceType"
          ) as
            AvailabilityResourceType,

        resourceId:
          requiredString(
            body.resourceId,
            "resourceId"
          ),

        startsAt:
          requiredDate(
            body.startsAt,
            "startsAt"
          ),

        endsAt:
          requiredDate(
            body.endsAt,
            "endsAt"
          ),

        exceptionType:
          requiredString(
            body.exceptionType,
            "exceptionType"
          ) as
            AvailabilityException[
              "exceptionType"
            ],

        reason:
          optionalString(
            body.reason
          ),

        createdAt: now,
        updatedAt: now,
        version: 1
      };

    const created =
      await this.service
        .createException(
          exception
        );

    return res
      .status(201)
      .json(created);
  };

  public updateException = async (
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
      await this.service
        .getException(
          id,
          tenantId
        );

    if (!existing) {
      return res.status(404).json({
        error:
          "Availability exception not found"
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
      version !== existing.version
    ) {
      return res.status(409).json({
        error:
          "Availability exception was modified by another request"
      });
    }

    const updated:
      AvailabilityException = {
        ...existing,

        resourceType:
          body.resourceType !==
          undefined
            ? requiredString(
                body.resourceType,
                "resourceType"
              ) as
                AvailabilityResourceType
            : existing.resourceType,

        resourceId:
          body.resourceId !== undefined
            ? requiredString(
                body.resourceId,
                "resourceId"
              )
            : existing.resourceId,

        startsAt:
          body.startsAt !== undefined
            ? requiredDate(
                body.startsAt,
                "startsAt"
              )
            : existing.startsAt,

        endsAt:
          body.endsAt !== undefined
            ? requiredDate(
                body.endsAt,
                "endsAt"
              )
            : existing.endsAt,

        exceptionType:
          body.exceptionType !==
          undefined
            ? requiredString(
                body.exceptionType,
                "exceptionType"
              ) as
                AvailabilityException[
                  "exceptionType"
                ]
            : existing.exceptionType,

        reason:
          body.reason !== undefined
            ? optionalString(
                body.reason
              )
            : existing.reason,

        id: existing.id,
        tenantId,

        createdAt:
          existing.createdAt,

        updatedAt:
          new Date(),

        version:
          existing.version
      };

    const saved =
      await this.service
        .updateException(
          updated
        );

    return res
      .status(200)
      .json(saved);
  };
}
