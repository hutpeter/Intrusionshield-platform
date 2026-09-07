
import { describe, expect, test } from "@jest/globals";
import { IdentityService, type IdentityRepository } from "./identity-service.js";
import type { Identity } from "../types/identity.js";

describe("IdentityService", () => {
    const identity: Identity = {
        id: "identity-1",
        tenantId: "tenant-1",
        type: "USER",
        status: "ACTIVE",
        displayName: "Test User",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
    };

    test("gets an identity using the supplied tenant context", async () => {
        const calls: Array<{ id: string; tenantId: string }> = [];

        const repository: IdentityRepository = {
            findById: async (id, tenantId) => {
                calls.push({ id, tenantId });
                return identity;
            },
            updateStatus: async () => undefined
        };

        const service = new IdentityService(repository);

        const result = await service.getIdentity("identity-1", "tenant-1");

        expect(result).toBe(identity);
        expect(calls).toEqual([
            {
                id: "identity-1",
                tenantId: "tenant-1"
            }
        ]);
    });

    test("returns null when the repository does not find an identity", async () => {
        const repository: IdentityRepository = {
            findById: async () => null,
            updateStatus: async () => undefined
        };

        const service = new IdentityService(repository);

        await expect(
            service.getIdentity("identity-1", "tenant-1")
        ).resolves.toBeNull();
    });

    test("suspends an identity within the supplied tenant", async () => {
        const calls: Array<{
            id: string;
            tenantId: string;
            status: string;
        }> = [];

        const repository: IdentityRepository = {
            findById: async () => identity,
            updateStatus: async (id, tenantId, status) => {
                calls.push({ id, tenantId, status });
            }
        };

        const service = new IdentityService(repository);

        await service.suspend("identity-1", "tenant-1");

        expect(calls).toEqual([
            {
                id: "identity-1",
                tenantId: "tenant-1",
                status: "SUSPENDED"
            }
        ]);
    });

    test("disables an identity within the supplied tenant", async () => {
        const calls: Array<{
            id: string;
            tenantId: string;
            status: string;
        }> = [];

        const repository: IdentityRepository = {
            findById: async () => identity,
            updateStatus: async (id, tenantId, status) => {
                calls.push({ id, tenantId, status });
            }
        };

        const service = new IdentityService(repository);

        await service.disable("identity-1", "tenant-1");

        expect(calls).toEqual([
            {
                id: "identity-1",
                tenantId: "tenant-1",
                status: "DISABLED"
            }
        ]);
    });

    test("activates an identity within the supplied tenant", async () => {
        const calls: Array<{
            id: string;
            tenantId: string;
            status: string;
        }> = [];

        const repository: IdentityRepository = {
            findById: async () => identity,
            updateStatus: async (id, tenantId, status) => {
                calls.push({ id, tenantId, status });
            }
        };

        const service = new IdentityService(repository);

        await service.activate("identity-1", "tenant-1");

        expect(calls).toEqual([
            {
                id: "identity-1",
                tenantId: "tenant-1",
                status: "ACTIVE"
            }
        ]);
    });

    test("propagates repository errors", async () => {
        const repositoryError = new Error("Repository failure");

        const repository: IdentityRepository = {
            findById: async () => {
                throw repositoryError;
            },
            updateStatus: async () => {
                throw repositoryError;
            }
        };

        const service = new IdentityService(repository);

        await expect(
            service.getIdentity("identity-1", "tenant-1")
        ).rejects.toBe(repositoryError);

        await expect(
            service.suspend("identity-1", "tenant-1")
        ).rejects.toBe(repositoryError);
    });
});

