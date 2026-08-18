import { describe, expect, it, jest } from "@jest/globals";
import { AbacService, type AbacPolicyRepository } from "./abac-service.js";
import type { AbacPolicy } from "../types/abac.js";

const request = {
  action: "read",
  subject: {
    identityId: "identity-1",
    tenantId: "tenant-a",
    attributes: { department: "cardiology", clearance: "clinical" }
  },
  resource: {
    resource: "patient-record",
    attributes: { sensitivity: "clinical" }
  },
  environment: { attributes: { deviceTrusted: true } }
} as const;

describe("AbacService", () => {
  it("allows when an applicable tenant policy matches", async () => {
    const policy: AbacPolicy = {
      id: "policy-1",
      name: "Clinical readers",
      effect: "ALLOW",
      actions: ["read"],
      resources: ["patient-record"],
      conditions: [
        { attribute: "subject.department", operator: "equals", value: "cardiology" },
        { attribute: "environment.deviceTrusted", operator: "equals", value: true }
      ]
    };
    const repository: AbacPolicyRepository = { getPolicies: jest.fn(async (tenantId) => tenantId === "tenant-a" ? [policy] : []) };

    await expect(new AbacService(repository).evaluate(request)).resolves.toMatchObject({
      allowed: true,
      policyId: "policy-1"
    });
  });

  it("denies access when no policy exists for the subject tenant", async () => {
    const repository: AbacPolicyRepository = { getPolicies: jest.fn(async () => []) };
    await expect(new AbacService(repository).evaluate(request)).resolves.toMatchObject({
      allowed: false,
      reason: "No applicable ABAC policy"
    });
    expect(repository.getPolicies).toHaveBeenCalledWith("tenant-a");
  });

  it("supports explicit deny with higher priority", async () => {
    const policies: AbacPolicy[] = [
      {
        id: "allow",
        name: "Allow clinical",
        effect: "ALLOW",
        actions: ["read"],
        resources: ["patient-record"],
        conditions: [],
        priority: 10
      },
      {
        id: "deny",
        name: "Deny untrusted devices",
        effect: "DENY",
        actions: ["read"],
        resources: ["patient-record"],
        conditions: [{ attribute: "environment.deviceTrusted", operator: "equals", value: false }],
        priority: 100
      }
    ];

    const untrusted = {
      ...request,
      environment: { attributes: { deviceTrusted: false } }
    };
    const repository: AbacPolicyRepository = { getPolicies: jest.fn(async () => policies) };

    await expect(new AbacService(repository).evaluate(untrusted)).resolves.toMatchObject({
      allowed: false,
      policyId: "deny"
    });
  });
});
