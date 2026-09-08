import { assertTenantScopedIdentity, assertVersion } from "../shared.js";
import type { Practitioner } from "./types.js";

export function createPractitioner(input: Practitioner): Practitioner {
  assertTenantScopedIdentity(input.id, input.tenantId);
  assertVersion(input.version);
  if (!input.personId.trim()) throw new Error("personId is required");
  if (!input.practitionerNumber.trim()) throw new Error("practitionerNumber is required");
  if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
    throw new Error("effectiveUntil must be after effectiveFrom");
  }
  return Object.freeze({ ...input, licenses: [...input.licenses], specialties: [...input.specialties] });
}
