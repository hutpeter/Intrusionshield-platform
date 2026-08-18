import { describe, expect, it, jest } from "@jest/globals";
import { PolicyService } from "./policy-service.js";
import type { AuthorizationPolicy } from "../types/policy.js";

const policy: AuthorizationPolicy = {
  id: "policy-1",
  tenantId: "tenant-a",
  name: "Trusted clinical device",
  resource: "patient-record",
  action: "read",
  effect: "ALLOW",
  conditions: [
    { attribute: "deviceTrusted", operator: "equals", value: true },
    { attribute: "department", operator: "in", value: ["cardiology", "oncology"] }
  ],
  conditionOperator: "AND",
  priority: 100,
  enabled: true
};

describe("PolicyService", () => {
  it("allows a matching policy", async () => {
    const repository = { findApplicablePolicies: jest.fn(async () => [policy]) };
    const service = new PolicyService(repository);

    const decision = await service.evaluate({
      resource: "patient-record",
      action: "read",
      context: {
        identityId: "user-1",
        tenantId: "tenant-a",
        roles: ["THERAPIST"],
        attributes: { deviceTrusted: true, department: "cardiology" }
      }
    });

    expect(decision.allowed).toBe(true);
  });

  it("denies a non-matching tenant policy", async () => {
    const repository = {
      findApplicablePolicies: jest.fn(async (tenantId: string) => tenantId === "tenant-b" ? [policy] : [])
    };
    const service = new PolicyService(repository);

    const decision = await service.evaluate({
      resource: "patient-record",
      action: "read",
      context: {
        identityId: "user-1",
        tenantId: "tenant-a",
        roles: ["THERAPIST"],
        attributes: { deviceTrusted: true, department: "cardiology" }
      }
    });

    expect(decision.allowed).toBe(false);
  });
});
