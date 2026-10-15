
import { describe, expect, test } from "@jest/globals";
import {
    AuthorizationService,
    type AuthorizationRepository
} from "./authorization-service.js";
import type {
    AuthorizationRequest,
    Permission
} from "../types/authorization.js";

describe("AuthorizationService", () => {
    const permissions: readonly Permission[] = [
        {
            id: "permission-1",
            name: "Read Users",
            resource: "users",
            action: "read"
        },
        {
            id: "permission-2",
            name: "Update Users",
            resource: "users",
            action: "update"
        }
    ];

    const request: AuthorizationRequest = {
        resource: "users",
        action: "read",
        context: {
            identityId: "identity-1",
            tenantId: "tenant-1",
            roles: ["USER"],
            attributes: {
                department: "security"
            }
        }
    };

    test("allows a request when the identity has the required permission", async () => {
        const repository: AuthorizationRepository = {
            getPermissions: async () => permissions
        };

        const service = new AuthorizationService(repository);

        await expect(service.authorize(request)).resolves.toEqual({
            allowed: true,
            reason: "Permission granted"
        });
    });

    test("denies a request when the required permission is missing", async () => {
        const repository: AuthorizationRepository = {
            getPermissions: async () => permissions
        };

        const service = new AuthorizationService(repository);

        const deniedRequest: AuthorizationRequest = {
            ...request,
            resource: "users",
            action: "delete"
        };

        await expect(service.authorize(deniedRequest)).resolves.toEqual({
            allowed: false,
            reason: "Permission denied"
        });
    });

    test("passes the identity and tenant context to the repository", async () => {
        const calls: Array<{
            identityId: string;
            tenantId: string;
        }> = [];

        const repository: AuthorizationRepository = {
            getPermissions: async (identityId, tenantId) => {
                calls.push({ identityId, tenantId });
                return permissions;
            }
        };

        const service = new AuthorizationService(repository);

        await service.authorize(request);

        expect(calls).toEqual([
            {
                identityId: "identity-1",
                tenantId: "tenant-1"
            }
        ]);
    });

    test("allows the matching permission when multiple permissions exist", async () => {
        const repository: AuthorizationRepository = {
            getPermissions: async () => permissions
        };

        const service = new AuthorizationService(repository);

        const updateRequest: AuthorizationRequest = {
            ...request,
            action: "update"
        };

        await expect(service.authorize(updateRequest)).resolves.toEqual({
            allowed: true,
            reason: "Permission granted"
        });
    });

    test("denies a request when the repository returns no permissions", async () => {
        const repository: AuthorizationRepository = {
            getPermissions: async () => []
        };

        const service = new AuthorizationService(repository);

        await expect(service.authorize(request)).resolves.toEqual({
            allowed: false,
            reason: "Permission denied"
        });
    });

    test("propagates repository errors", async () => {
        const repositoryError = new Error("Authorization repository failure");

        const repository: AuthorizationRepository = {
            getPermissions: async () => {
                throw repositoryError;
            }
        };

        const service = new AuthorizationService(repository);

        await expect(service.authorize(request)).rejects.toBe(repositoryError);
    });
});

