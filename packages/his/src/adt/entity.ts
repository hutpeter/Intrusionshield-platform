import {
  assertTenantScopedIdentity,
  assertVersion
} from "../shared.js";

import type {
  BedAssignment
} from "./types.js";

const assignmentTypes =
  new Set<
    BedAssignment["assignmentType"]
  >([
    "ADMISSION",
    "TRANSFER"
  ]);

const assignmentStatuses =
  new Set<
    BedAssignment["status"]
  >([
    "ACTIVE",
    "RELEASED"
  ]);

const releaseReasons =
  new Set<
    NonNullable<
      BedAssignment["releaseReason"]
    >
  >([
    "TRANSFER",
    "DISCHARGE",
    "CANCELLED",
    "OTHER"
  ]);

export function createBedAssignment(
  input: BedAssignment
): BedAssignment {
  assertTenantScopedIdentity(
    input.id,
    input.tenantId
  );

  assertVersion(input.version);

  if (!input.admissionId.trim()) {
    throw new Error(
      "admissionId is required"
    );
  }

  if (!input.encounterId.trim()) {
    throw new Error(
      "encounterId is required"
    );
  }

  if (!input.patientId.trim()) {
    throw new Error(
      "patientId is required"
    );
  }

  if (!input.facilityId.trim()) {
    throw new Error(
      "facilityId is required"
    );
  }

  if (!input.bedId.trim()) {
    throw new Error(
      "bedId is required"
    );
  }

  if (
    !assignmentTypes.has(
      input.assignmentType
    )
  ) {
    throw new Error(
      "assignmentType is invalid"
    );
  }

  if (
    !assignmentStatuses.has(
      input.status
    )
  ) {
    throw new Error(
      "bed assignment status is invalid"
    );
  }

  if (
    input.releaseReason &&
    !releaseReasons.has(
      input.releaseReason
    )
  ) {
    throw new Error(
      "releaseReason is invalid"
    );
  }

  if (
    input.releasedAt &&
    input.releasedAt.getTime() <
      input.assignedAt.getTime()
  ) {
    throw new Error(
      "releasedAt cannot be before assignedAt"
    );
  }

  if (
    input.status === "ACTIVE" &&
    (
      input.releasedAt ||
      input.releaseReason
    )
  ) {
    throw new Error(
      "Active bed assignments cannot have release information"
    );
  }

  if (
    input.status === "RELEASED" &&
    !input.releasedAt
  ) {
    throw new Error(
      "releasedAt is required for released bed assignments"
    );
  }

  return Object.freeze({
    ...input,
    admissionId:
      input.admissionId.trim(),
    encounterId:
      input.encounterId.trim(),
    patientId:
      input.patientId.trim(),
    facilityId:
      input.facilityId.trim(),
    bedId:
      input.bedId.trim(),
    notes:
      input.notes?.trim() || undefined
  });
}
