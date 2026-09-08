import { assertTenantScopedIdentity, assertVersion } from "../shared.js";
import type { Facility } from "./types.js";

export function createFacility(input: Facility): Facility {
  assertTenantScopedIdentity(input.id, input.tenantId);
  assertVersion(input.version);
  if (!input.code.trim()) throw new Error("code is required");
  if (!input.name.trim()) throw new Error("name is required");
  if (input.parentFacilityId === input.id) throw new Error("facility cannot be its own parent");
  return Object.freeze({ ...input });
}
