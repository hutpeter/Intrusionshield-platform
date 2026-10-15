import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  PatientRegistration
} from "./types.js";

const registrationTypes =
  new Set<PatientRegistration["registrationType"]>([
    "OUTPATIENT",
    "INPATIENT",
    "EMERGENCY",
    "OBSERVATION",
    "DAY_CASE"
  ]);

const registrationStatuses =
  new Set<PatientRegistration["status"]>([
    "REGISTERED",
    "COMPLETED",
    "CANCELLED"
  ]);

const registrationSources =
  new Set<PatientRegistration["source"]>([
    "WALK_IN",
    "REFERRAL",
    "TRANSFER",
    "SCHEDULED",
    "EMERGENCY",
    "OTHER"
  ]);

export function createPatientRegistration(
  input: PatientRegistration
): PatientRegistration {
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

  if (!input.registrationNumber.trim()) {
    throw new Error(
      "registrationNumber is required"
    );
  }

  if (!registrationTypes.has(
    input.registrationType
  )) {
    throw new Error(
      "registrationType is invalid"
    );
  }

  if (!registrationStatuses.has(
    input.status
  )) {
    throw new Error(
      "registration status is invalid"
    );
  }

  if (!registrationSources.has(
    input.source
  )) {
    throw new Error(
      "registration source is invalid"
    );
  }

  if (
    input.completedAt &&
    input.completedAt.getTime() <
      input.registeredAt.getTime()
  ) {
    throw new Error(
      "completedAt cannot be before registeredAt"
    );
  }

  if (
    input.cancelledAt &&
    input.cancelledAt.getTime() <
      input.registeredAt.getTime()
  ) {
    throw new Error(
      "cancelledAt cannot be before registeredAt"
    );
  }

  if (
    input.status === "COMPLETED" &&
    !input.completedAt
  ) {
    throw new Error(
      "completedAt is required for a completed registration"
    );
  }

  if (
    input.status === "CANCELLED" &&
    !input.cancelledAt
  ) {
    throw new Error(
      "cancelledAt is required for a cancelled registration"
    );
  }

  return Object.freeze({
    ...input,
    registrationNumber:
      input.registrationNumber.trim(),
    reasonForVisit:
      input.reasonForVisit?.trim() || undefined,
    registrationLocation:
      input.registrationLocation?.trim() ||
      undefined
  });
}
