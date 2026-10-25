
import { SqlDevicePointRepository } from "../infrastructure/repositories/DevicePointRepository.js";
import type { IDatabaseProvider } from "@intrusionshield/database";

import {
    beforeEach,
    describe,
    expect,
    it,
    jest
} from "@jest/globals";

const tenantId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const measurementDefinitionId =
    "44444444-4444-4444-8444-444444444444";

const input = {
    tenantId,
    siteId,
    deviceId,
    measurementDefinitionId,
    code: "TEMP_01",
    name: "Temperature"
};

describe("SqlDevicePointRepository", () => {
    const execute = jest.fn<() => Promise<number>>();

    const query = jest.fn<
        (
            sql: string,
            parameters?: unknown[]
        ) => Promise<{ rows: unknown[] }>
    >();

    const repository = new SqlDevicePointRepository({
        execute,
        query
    } as unknown as IDatabaseProvider);

    beforeEach(() => {
        execute.mockReset();
        query.mockReset();
    });

    it(
        "rejects invalid polling intervals before database access",
        async () => {
            await expect(
                repository.create({
                    ...input,
                    pollIntervalSeconds: 0
                })
            ).rejects.toThrow("Polling interval");

            expect(execute).not.toHaveBeenCalled();
        }
    );

    it("rejects invalid point codes", async () => {
        await expect(
            repository.create({
                ...input,
                code: "bad code"
            })
        ).rejects.toThrow("code");

        expect(execute).not.toHaveBeenCalled();
    });

    it(
        "queries points using tenant and device filters",
        async () => {
            query.mockResolvedValue({
                rows: []
            });

            expect(
                await repository.findByDevice(
                    deviceId,
                    tenantId
                )
            ).toEqual([]);

            expect(
                query.mock.calls[0][0]
            ).toContain(
                "tenant_id = @tenantId AND device_id = @deviceId"
            );
        }
    );

    it(
        "reports not found when an update affects no rows",
        async () => {
            execute.mockResolvedValue(0);

            query.mockResolvedValue({
                rows: []
            });

            expect(
                await repository.update({
                    ...input,
                    id: "55555555-5555-4555-8555-555555555555",
                    version: 1
                })
            ).toEqual({
                status: "NOT_FOUND"
            });
        }
    );
});
