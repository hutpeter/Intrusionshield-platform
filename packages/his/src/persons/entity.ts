import { assertTenantScopedIdentity, assertVersion } from "../shared.js";
import type { Person } from "./types.js";

export function createPerson(input: Person): Person {
  assertTenantScopedIdentity(input.id, input.tenantId);
  assertVersion(input.version);
  if (!input.firstName.trim()) throw new Error("firstName is required");
  if (!input.lastName.trim()) throw new Error("lastName is required");
  if (input.identifiers.some((item) => !item.system.trim() || !item.value.trim())) {
    throw new Error("person identifiers require system and value");
  }
  return Object.freeze({ ...input, identifiers: [...input.identifiers], addresses: [...input.addresses] });
}
