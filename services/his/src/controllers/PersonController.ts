import { randomUUID } from "node:crypto";

import type {
  Request,
  Response
} from "express";

import type {
  Person
} from "@intrusionshield/his";

import type {
  PersonFacilityAffiliationInput,
  PersonFacilityAffiliationType
} from "../application/PersonList.js";

import {
  PersonService
} from "../application/PersonService.js";

import {
  getTenantId
} from "../middleware/tenantContext.js";

import {
  bodyAsRecord,
  dateFromBody
} from "./requestHelpers.js";

const PERSON_STATUSES = new Set<
  Person["status"]
>([
  "ACTIVE",
  "INACTIVE",
  "DECEASED"
]);

const AFFILIATION_TYPES =
  new Set<PersonFacilityAffiliationType>([
    "PATIENT_CARE",
    "PRACTITIONER_ASSIGNMENT",
    "GENERAL"
  ]);

function parameter(
  req: Request,
  name: string
): string | undefined {
  const value = req.params[name];

  return Array.isArray(value)
    ? value[0]
    : value;
}

function positiveInteger(
  value: unknown,
  defaultValue: number
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

export class PersonController {
  public constructor(
    private readonly service: PersonService
  ) {}

  public list = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const page =
      positiveInteger(
        req.query.page,
        1
      );

    if (page === null) {
      res.status(400).json({
        error:
          "page must be a positive integer"
      });
      return;
    }

    const pageSize =
      positiveInteger(
        req.query.pageSize,
        25
      );

    if (
      pageSize === null ||
      pageSize > 100
    ) {
      res.status(400).json({
        error:
          "pageSize must be an integer between 1 and 100"
      });
      return;
    }

    const rawSearch =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    const rawStatus =
      typeof req.query.status === "string"
        ? req.query.status
            .trim()
            .toUpperCase()
        : "";

    let status:
      Person["status"] | undefined;

    if (rawStatus) {
      if (
        !PERSON_STATUSES.has(
          rawStatus as Person["status"]
        )
      ) {
        res.status(400).json({
          error:
            "status must be ACTIVE, INACTIVE, or DECEASED"
        });
        return;
      }

      status =
        rawStatus as Person["status"];
    }

    const result =
      await this.service.list({
        tenantId: getTenantId(res),
        page,
        pageSize,
        search:
          rawSearch || undefined,
        status
      });

    res.status(200).json(result);
  };

  public summary = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.status(200).json(
      await this.service.summary(
        getTenantId(res)
      )
    );
  };

  public facilityOptions = async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    res.status(200).json(
      await this.service.listFacilityOptions(
        getTenantId(res)
      )
    );
  };

  public listFacilityAffiliations = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const id =
      parameter(req, "id");

    if (!id) {
      res.status(400).json({
        error: "id is required"
      });
      return;
    }

    const person =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!person) {
      res.status(404).json({
        error: "Person not found"
      });
      return;
    }

    res.status(200).json(
      await this.service.listFacilityAffiliations(
        id,
        getTenantId(res)
      )
    );
  };

  public replaceFacilityAffiliations = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const id =
      parameter(req, "id");

    if (!id) {
      res.status(400).json({
        error: "id is required"
      });
      return;
    }

    const rawBody =
      Array.isArray(req.body)
        ? req.body
        : bodyAsRecord(req.body)
            .affiliations;

    if (!Array.isArray(rawBody)) {
      res.status(400).json({
        error:
          "affiliations must be an array"
      });
      return;
    }

    const affiliations:
      PersonFacilityAffiliationInput[] = [];

    for (const item of rawBody) {
      const record =
        bodyAsRecord(item);

      const facilityId =
        typeof record.facilityId ===
        "string"
          ? record.facilityId.trim()
          : "";

      const affiliationType =
        typeof record.affiliationType ===
        "string"
          ? record.affiliationType
              .trim()
              .toUpperCase()
          : "";

      if (!facilityId) {
        res.status(400).json({
          error:
            "Every Facility affiliation requires a facilityId."
        });
        return;
      }

      if (
        !AFFILIATION_TYPES.has(
          affiliationType as
            PersonFacilityAffiliationType
        )
      ) {
        res.status(400).json({
          error:
            "affiliationType must be PATIENT_CARE, PRACTITIONER_ASSIGNMENT, or GENERAL"
        });
        return;
      }

      if (
        typeof record.isPrimary !==
        "boolean"
      ) {
        res.status(400).json({
          error:
            "isPrimary must be true or false"
        });
        return;
      }

      affiliations.push({
        facilityId,
        affiliationType:
          affiliationType as
            PersonFacilityAffiliationType,
        isPrimary:
          record.isPrimary
      });
    }

    const primaryCount =
      affiliations.filter(
        (affiliation) =>
          affiliation.isPrimary
      ).length;

    if (primaryCount > 1) {
      res.status(400).json({
        error:
          "Only one active Facility affiliation can be primary."
      });
      return;
    }

    const keys =
      affiliations.map(
        (affiliation) =>
          `${affiliation.facilityId.toLowerCase()}|${affiliation.affiliationType}`
      );

    if (
      new Set(keys).size !==
      keys.length
    ) {
      res.status(400).json({
        error:
          "Duplicate active Facility affiliations are not allowed."
      });
      return;
    }

    try {
      const updated =
        await this.service.replaceFacilityAffiliations(
          id,
          getTenantId(res),
          affiliations
        );

      res.status(200).json(updated);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save Facility affiliations.";

      if (/not found/i.test(message)) {
        res.status(404).json({
          error: message
        });
        return;
      }

      if (
        /active Facility|primary|duplicate/i.test(
          message
        )
      ) {
        res.status(400).json({
          error: message
        });
        return;
      }

      throw error;
    }
  };

  public get = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const id =
      parameter(req, "id");

    if (!id) {
      res.status(400).json({
        error: "id is required"
      });
      return;
    }

    const person =
      await this.service.get(
        id,
        getTenantId(res)
      );

    if (!person) {
      res.status(404).json({
        error: "Person not found"
      });
      return;
    }

    res.status(200).json(person);
  };

  public create = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const now = new Date();
    const body =
      bodyAsRecord(req.body);

    const person: Person = {
      id: randomUUID(),
      tenantId:
        getTenantId(res),
      createdAt: now,
      updatedAt: now,
      version: 1,
      firstName:
        String(
          body.firstName ?? ""
        ),
      middleName:
        body.middleName as
          string | undefined,
      lastName:
        String(
          body.lastName ?? ""
        ),
      preferredName:
        body.preferredName as
          string | undefined,
      dateOfBirth:
        body.dateOfBirth
          ? dateFromBody(
              body.dateOfBirth,
              now
            )
          : undefined,
      sex:
        (body.sex ??
          "UNKNOWN") as
          Person["sex"],
      gender:
        body.gender as
          string | undefined,
      identifiers:
        Array.isArray(
          body.identifiers
        )
          ? body.identifiers as
              Person["identifiers"]
          : [],
      contactInformation:
        body.contactInformation as
          Person["contactInformation"],
      addresses:
        Array.isArray(
          body.addresses
        )
          ? body.addresses as
              Person["addresses"]
          : [],
      status:
        (body.status ??
          "ACTIVE") as
          Person["status"]
    };

    res.status(201).json(
      await this.service.create(
        person
      )
    );
  };

  public update = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const tenantId =
      getTenantId(res);

    const id =
      parameter(req, "id");

    if (!id) {
      res.status(400).json({
        error: "id is required"
      });
      return;
    }

    const existing =
      await this.service.get(
        id,
        tenantId
      );

    if (!existing) {
      res.status(404).json({
        error: "Person not found"
      });
      return;
    }

    const body =
      bodyAsRecord(req.body);

    const person: Person = {
      ...existing,
      ...body,
      id: existing.id,
      tenantId,
      createdAt:
        existing.createdAt,
      updatedAt:
        new Date(),
      version:
        typeof body.version ===
        "number"
          ? body.version
          : existing.version,
      dateOfBirth:
        body.dateOfBirth !==
        undefined
          ? (
              body.dateOfBirth
                ? dateFromBody(
                    body.dateOfBirth,
                    existing.dateOfBirth ??
                      new Date()
                  )
                : undefined
            )
          : existing.dateOfBirth,
      identifiers:
        Array.isArray(
          body.identifiers
        )
          ? body.identifiers as
              Person["identifiers"]
          : existing.identifiers,
      addresses:
        Array.isArray(
          body.addresses
        )
          ? body.addresses as
              Person["addresses"]
          : existing.addresses
    } as Person;

    try {
      res.status(200).json(
        await this.service.update(
          person
        )
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update Person.";

      if (
        /modified|concurrency/i.test(
          message
        )
      ) {
        res.status(409).json({
          error: message
        });
        return;
      }

      throw error;
    }
  };
}
