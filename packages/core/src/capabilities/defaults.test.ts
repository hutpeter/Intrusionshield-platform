import { describe, expect, test } from "@jest/globals";
import { createDefaultCapabilityRegistry, STERILE_PROCESSING_CORE_CAPABILITY_ID } from "./defaults.js";
import { CapabilityGuard } from "../entitlements/capability-guard.js";
import { InMemoryEntitlementResolver } from "../entitlements/resolver.js";
import type { Entitlement } from "../entitlements/types.js";

const id = STERILE_PROCESSING_CORE_CAPABILITY_ID;
const at = new Date("2026-11-25T00:00:00Z");
const dependencies = ["core.authentication", "core.authorization", "core.i18n"];
const grants = (ids: string[]): Entitlement[] => ids.map(capabilityId => ({
  id: capabilityId, tenantId: "tenant-a", capabilityId, licenseId: "license-a",
  status: "ACTIVE", effectiveFrom: at, effectiveUntil: null
}));

describe("Default product capabilities", () => {
  test("registers Tiger as an active standalone product with shared dependencies", () => {
    const registry = createDefaultCapabilityRegistry();
    expect(registry.get(id)).toMatchObject({ status: "ACTIVE", category: "application" });
    expect(registry.resolveDependencies(id).map(c => c.id).sort()).toEqual([...dependencies].sort());
  });

  test("requires the Tiger product entitlement in addition to shared dependencies", async () => {
    const guard = new CapabilityGuard(createDefaultCapabilityRegistry(), new InMemoryEntitlementResolver(grants(dependencies)));
    expect(await guard.authorize("tenant-a", id, at)).toMatchObject({ allowed: false });
  });

  test("allows entitled tenant but not another tenant", async () => {
    const guard = new CapabilityGuard(createDefaultCapabilityRegistry(), new InMemoryEntitlementResolver(grants([...dependencies, id])));
    expect(await guard.authorize("tenant-a", id, at)).toMatchObject({ allowed: true });
    expect(await guard.authorize("tenant-b", id, at)).toMatchObject({ allowed: false });
  });
});
