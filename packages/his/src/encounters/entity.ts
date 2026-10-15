import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  Encounter
} from "./types.js";

const encounterTypes =
  new Set<Encounter["encounterType"]>([
    "OUTPATIENT",
    "INPATIENT",
    "EMERGENCY",
    "OBSERVATION",
    "DAY_CASE",
    "VIRTUAL"
  ]);

const encounterStatuses =
  new Set<Encounter["status"]>([
    "PLANNED",
    "ARRIVED",
    "IN_PROGRESS",
    "ON_HOLD",
    "FINISHED",
    "CANCELLED"
  ]);

const encounterSources =
  new Set<Encounter["source"]>([
    "REGISTRATION",
    "SCHEDULED",
    "WALK_IN",
    "REFERRAL",
    "TRANSFER",
    "EMERGENCY",
    "OTHER"
  ]);

export function createEncounter(
  input: Encounter
): Encounter {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  if (!input.patientId.trim()) {
    throw new Error("patientId is required");
  }

  if (!input.facilityId.trim()) {
    throw new Error("facilityId is required");
  }

  if (!input.encounterNumber.trim()) {
    throw new Error(
      "encounterNumber is required"
    );
  }

  if (
    input.registrationId !== undefined &&
    !input.registrationId.trim()
  ) {
    throw new Error(
      "registrationId cannot be empty"
    );
  }

  if (
    input.attendingPractitionerId !== undefined &&
    !input.attendingPractitionerId.trim()
  ) {
    throw new Error(
      "attendingPractitionerId cannot be empty"
    );
  }

  if (!encounterTypes.has(input.encounterType)) {
    throw new Error(
      "encounterType is invalid"
    );
  }

  if (!encounterStatuses.has(input.status)) {
    throw new Error(
      "encounter status is invalid"
    );
  }

  if (!encounterSources.has(input.source)) {
    throw new Error(
      "encounter source is invalid"
    );
  }

  if (
    input.endedAt &&
    input.endedAt.getTime() <
      input.startedAt.getTime()
  ) {
    throw new Error(
      "endedAt cannot be before startedAt"
    );
  }

  if (
    input.status === "FINISHED" &&
    !input.endedAt
  ) {
    throw new Error(
      "endedAt is required for a finished encounter"
    );
  }

  if (
    input.status !== "FINISHED" &&
    input.endedAt
  ) {
    throw new Error(
      "endedAt is only valid for a finished encounter"
    );
  }

  return Object.freeze({
    ...input,
    encounterNumber:
      input.encounterNumber.trim(),
    registrationId:
      input.registrationId?.trim() || undefined,
    attendingPractitionerId:
      input.attendingPractitionerId?.trim() ||
      undefined,
    reasonForEncounter:
      input.reasonForEncounter?.trim() ||
      undefined,
    referralSource:
      input.referralSource?.trim() || undefined,
    locationDescription:
      input.locationDescription?.trim() ||
      undefined
  });
}
