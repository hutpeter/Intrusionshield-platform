import { describe, expect, it, jest } from "@jest/globals";
import { AuthorizationService, type AuthorizationRepository } from "./authorization-service.js";

describe("AuthorizationService tenant isolation", () => {
  it("cannot authorize a permission from another tenant", async () => {
    const repository: AuthorizationRepository = {
      getPermissions: jest.fn(async (_identityId, tenantId) => tenantId === "tenant-a"
        ? [{ id: "p1", name: "patient.read", resource: "patient", action: "read" }]
        : [])
    };

    const service = new AuthorizationService(repository);

    await expect(service.authorize({
      resource: "patient",
      action: "read",
      context: {
        identityId: "identity-1",
        tenantId: "tenant-a",
        roles: [],
        attributes: {}
      }
    })).resolves.toMatchObject({ allowed: true });

    await expect(service.authorize({
      resource: "patient",
      action: "read",
      context: {
        identityId: "identity-1",
        tenantId: "tenant-b",
        roles: [],
        attributes: {}
      }
    })).resolves.toMatchObject({ allowed: false });
  });
});
