import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  AvailabilityException,
  AvailabilityResourceType,
  AvailabilityRule
} from "./availabilityTypes.js";

const resourceTypes =
  new Set<AvailabilityResourceType>([
    "PRACTITIONER",
    "CLINICAL_LOCATION"
  ]);

const exceptionTypes =
  new Set<
    AvailabilityException["exceptionType"]
  >([
    "UNAVAILABLE",
    "AVAILABLE"
  ]);

const timePattern =
  /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

function assertResource(
  resourceType: AvailabilityResourceType,
  resourceId: string
): void {
  if (!resourceTypes.has(resourceType)) {
    throw new Error(
      "resourceType is invalid"
    );
  }

  if (!resourceId.trim()) {
    throw new Error(
      "resourceId is required"
    );
  }
}

function assertInstant(
  value: Date,
  name: string
): void {
  if (
    !(value instanceof Date) ||
    Number.isNaN(value.getTime())
  ) {
    throw new Error(
      `${name} is invalid`
    );
  }
}

function assertCalendarDate(
  value: string,
  name: string
): void {
  if (!datePattern.test(value)) {
    throw new Error(
      `${name} must use YYYY-MM-DD format`
    );
  }

  const [year, month, day] =
    value.split("-").map(Number);

  const date =
    new Date(
      Date.UTC(year, month - 1, day)
    );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(
      `${name} is invalid`
    );
  }
}

function assertTime(
  value: string,
  name: string
): void {
  if (!timePattern.test(value)) {
    throw new Error(
      `${name} must use HH:mm format`
    );
  }
}

function timeToMinutes(
  value: string
): number {
  const [
    hours,
    minutes
  ] = value
    .split(":")
    .map(Number);

  return (hours * 60) + minutes;
}

function optionalText(
  value: string | undefined
): string | undefined {
  return value?.trim() || undefined;
}

export function createAvailabilityRule(
  input: AvailabilityRule
): AvailabilityRule {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  assertResource(
    input.resourceType,
    input.resourceId
  );

  if (
    !Number.isInteger(input.dayOfWeek) ||
    input.dayOfWeek < 0 ||
    input.dayOfWeek > 6
  ) {
    throw new Error(
      "dayOfWeek must be an integer from 0 through 6"
    );
  }

  assertTime(
    input.startTime,
    "startTime"
  );

  assertTime(
    input.endTime,
    "endTime"
  );

  if (
    timeToMinutes(input.endTime) <=
    timeToMinutes(input.startTime)
  ) {
    throw new Error(
      "endTime must be after startTime"
    );
  }

  assertCalendarDate(
    input.effectiveFrom,
    "effectiveFrom"
  );

  if (input.effectiveTo) {
    assertCalendarDate(
      input.effectiveTo,
      "effectiveTo"
    );

    if (
      input.effectiveTo <
      input.effectiveFrom
    ) {
      throw new Error(
        "effectiveTo cannot be before effectiveFrom"
      );
    }
  }

  return Object.freeze({
    ...input,

    resourceId:
      input.resourceId.trim(),

    startTime:
      input.startTime.trim(),

    endTime:
      input.endTime.trim(),

    effectiveFrom:
      input.effectiveFrom.trim(),

    effectiveTo:
      input.effectiveTo?.trim()
  });
}

export function createAvailabilityException(
  input: AvailabilityException
): AvailabilityException {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  assertResource(
    input.resourceType,
    input.resourceId
  );

  if (
    !exceptionTypes.has(
      input.exceptionType
    )
  ) {
    throw new Error(
      "exceptionType is invalid"
    );
  }

  assertInstant(
    input.startsAt,
    "startsAt"
  );

  assertInstant(
    input.endsAt,
    "endsAt"
  );

  if (
    input.endsAt.getTime() <=
    input.startsAt.getTime()
  ) {
    throw new Error(
      "endsAt must be after startsAt"
    );
  }

  return Object.freeze({
    ...input,

    resourceId:
      input.resourceId.trim(),

    reason:
      optionalText(input.reason)
  });
}
