import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  Admission
} from "./types.js";

const admissionTypes =
  new Set<Admission["admissionType"]>([
    "INPATIENT",
    "OBSERVATION",
    "EMERGENCY",
    "DAY_CASE"
  ]);

const admissionSources =
  new Set<Admission["admissionSource"]>([
    "EMERGENCY",
    "PHYSICIAN_REFERRAL",
    "CLINIC_REFERRAL",
    "TRANSFER",
    "DIRECT",
    "OTHER"
  ]);

const admissionStatuses =
  new Set<Admission["status"]>([
    "ACTIVE",
    "DISCHARGED",
    "CANCELLED"
  ]);

const dischargeDispositions =
  new Set<
    NonNullable<
      Admission["dischargeDisposition"]
    >
  >([
    "HOME",
    "TRANSFER",
    "LONG_TERM_CARE",
    "REHABILITATION",
    "HOSPICE",
    "LEFT_AGAINST_ADVICE",
    "DECEASED",
    "OTHER"
  ]);

export function createAdmission(
  input: Admission
): Admission {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  if (!input.patientId.trim()) {
    throw new Error(
      "patientId is required"
    );
  }

  if (!input.encounterId.trim()) {
    throw new Error(
      "encounterId is required"
    );
  }

  if (!input.facilityId.trim()) {
    throw new Error(
      "facilityId is required"
    );
  }

  if (!input.admissionNumber.trim()) {
    throw new Error(
      "admissionNumber is required"
    );
  }

  if (
    !admissionTypes.has(
      input.admissionType
    )
  ) {
    throw new Error(
      "admissionType is invalid"
    );
  }

  if (
    !admissionSources.has(
      input.admissionSource
    )
  ) {
    throw new Error(
      "admissionSource is invalid"
    );
  }

  if (
    !admissionStatuses.has(
      input.status
    )
  ) {
    throw new Error(
      "admission status is invalid"
    );
  }

  if (
    input.dischargeDisposition &&
    !dischargeDispositions.has(
      input.dischargeDisposition
    )
  ) {
    throw new Error(
      "dischargeDisposition is invalid"
    );
  }

  if (
    input.dischargedAt &&
    input.dischargedAt.getTime() <
      input.admittedAt.getTime()
  ) {
    throw new Error(
      "dischargedAt cannot be before admittedAt"
    );
  }

  if (
    input.status === "DISCHARGED" &&
    !input.dischargedAt
  ) {
    throw new Error(
      "dischargedAt is required for a discharged admission"
    );
  }

  if (
    input.status !== "DISCHARGED" &&
    input.dischargedAt
  ) {
    throw new Error(
      "dischargedAt is only valid for a discharged admission"
    );
  }

  if (
    input.status !== "DISCHARGED" &&
    input.dischargeDisposition
  ) {
    throw new Error(
      "dischargeDisposition is only valid for a discharged admission"
    );
  }

  return Object.freeze({
    ...input,
    patientId:
      input.patientId.trim(),
    encounterId:
      input.encounterId.trim(),
    facilityId:
      input.facilityId.trim(),
    admissionNumber:
      input.admissionNumber.trim(),
    admittingPractitionerId:
      input.admittingPractitionerId
        ?.trim() || undefined,
    reasonForAdmission:
      input.reasonForAdmission
        ?.trim() || undefined,
    dischargeNotes:
      input.dischargeNotes
        ?.trim() || undefined
  });
}
