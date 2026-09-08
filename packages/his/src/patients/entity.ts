import { assertTenantScopedIdentity, assertVersion } from "../shared.js";
import type { Patient } from "./types.js";

export function createPatient(input: Patient): Patient {
  assertTenantScopedIdentity(input.id, input.tenantId);
  assertVersion(input.version);
  if (!input.personId.trim()) throw new Error("personId is required");
  if (!input.medicalRecordNumber.trim()) throw new Error("medicalRecordNumber is required");
  if (!input.patientNumber.trim()) throw new Error("patientNumber is required");
  if (input.registrationDate.getTime() > Date.now()) throw new Error("registrationDate cannot be in the future");
  return Object.freeze({ ...input, emergencyContactPersonIds: [...input.emergencyContactPersonIds] });
}
