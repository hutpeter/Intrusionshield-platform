import {
    describe,
    expect,
    jest,
    test
} from "@jest/globals";

import { DatabaseManager } from "./DatabaseManager.js";
import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";

describe("DatabaseManager", () => {
    function createProvider(): IDatabaseProvider {
        return {
            connect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            query: jest.fn<
                (
                    sql: string,
                    parameters?: SqlParameter[]
                ) => Promise<SqlResult<unknown>>
            >().mockResolvedValue({
                rows: [],
                rowCount: 0
            }),
            execute: jest.fn<
                (
                    sql: string,
                    parameters?: SqlParameter[]
                ) => Promise<number>
            >().mockResolvedValue(0),
            beginTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            commitTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            rollbackTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            isConnected: jest.fn<() => boolean>().mockReturnValue(true)
        };
    }

    test("delegates connection lifecycle operations to the provider", async () => {
        const provider = createProvider();
        const manager = new DatabaseManager(provider);

        await manager.connect();
        await manager.disconnect();

        expect(provider.connect).toHaveBeenCalledTimes(1);
        expect(provider.disconnect).toHaveBeenCalledTimes(1);
    });

    test("delegates queries to the provider", async () => {
        const provider = createProvider();

        const result: SqlResult<{ id: number }> = {
            rows: [{ id: 1 }],
            rowCount: 1
        };

        jest.mocked(provider.query).mockResolvedValue(result);

        const manager = new DatabaseManager(provider);

        const parameters: SqlParameter[] = [
            {
                name: "id",
                value: 1
            }
        ];

        await expect(
            manager.query<{ id: number }>(
                "SELECT * FROM Users WHERE Id = @id",
                parameters
            )
        ).resolves.toEqual(result);

        expect(provider.query).toHaveBeenCalledWith(
            "SELECT * FROM Users WHERE Id = @id",
            parameters
        );
    });

    test("delegates command execution to the provider", async () => {
        const provider = createProvider();

        jest.mocked(provider.execute).mockResolvedValue(3);

        const manager = new DatabaseManager(provider);

        const parameters: SqlParameter[] = [
            {
                name: "status",
                value: "active"
            }
        ];

        await expect(
            manager.execute(
                "UPDATE Users SET Status = @status",
                parameters
            )
        ).resolves.toBe(3);

        expect(provider.execute).toHaveBeenCalledWith(
            "UPDATE Users SET Status = @status",
            parameters
        );
    });

    test("delegates transaction lifecycle operations to the provider", async () => {
        const provider = createProvider();
        const manager = new DatabaseManager(provider);

        await manager.beginTransaction();
        await manager.commitTransaction();
        await manager.beginTransaction();
        await manager.rollbackTransaction();

        expect(provider.beginTransaction).toHaveBeenCalledTimes(2);
        expect(provider.commitTransaction).toHaveBeenCalledTimes(1);
        expect(provider.rollbackTransaction).toHaveBeenCalledTimes(1);
    });

    test("delegates connection state to the provider", () => {
        const provider = createProvider();
        const manager = new DatabaseManager(provider);

        expect(manager.isConnected()).toBe(true);

        jest.mocked(provider.isConnected).mockReturnValue(false);

        expect(manager.isConnected()).toBe(false);
        expect(provider.isConnected).toHaveBeenCalledTimes(2);
    });

    test("uses empty parameter lists by default", async () => {
        const provider = createProvider();
        const manager = new DatabaseManager(provider);

        await manager.query("SELECT 1");
        await manager.execute("DELETE FROM Users");

        expect(provider.query).toHaveBeenCalledWith("SELECT 1", []);
        expect(provider.execute).toHaveBeenCalledWith(
            "DELETE FROM Users",
            []
        );
    });
});