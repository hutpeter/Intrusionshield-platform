import {
    describe,
    expect,
    jest,
    test
} from "@jest/globals";

import { QueryExecutor } from "./QueryExecutor.js";
import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";

describe("QueryExecutor", () => {
    test("delegates query execution to the configured provider", async () => {
        const result: SqlResult<{ id: number }> = {
            rows: [{ id: 1 }],
            rowCount: 1
        };

        const query = jest.fn<
            (
                sql: string,
                parameters?: SqlParameter[]
            ) => Promise<SqlResult<{ id: number }>>
        >().mockResolvedValue(result);

        const provider: IDatabaseProvider = {
            connect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            query,
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

        const executor = new QueryExecutor(provider);

        const parameters: SqlParameter[] = [
            {
                name: "id",
                value: 1
            }
        ];

        await expect(
            executor.query<{ id: number }>(
                "SELECT * FROM Users WHERE Id = @id",
                parameters
            )
        ).resolves.toEqual(result);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(
            "SELECT * FROM Users WHERE Id = @id",
            parameters
        );
    });

    test("delegates command execution to the configured provider", async () => {
        const execute = jest.fn<
            (
                sql: string,
                parameters?: SqlParameter[]
            ) => Promise<number>
        >().mockResolvedValue(1);

        const provider: IDatabaseProvider = {
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
            execute,
            beginTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            commitTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            rollbackTransaction: jest.fn<() => Promise<void>>().mockResolvedValue(),
            isConnected: jest.fn<() => boolean>().mockReturnValue(true)
        };

        const executor = new QueryExecutor(provider);

        const parameters: SqlParameter[] = [
            {
                name: "name",
                value: "Alice"
            }
        ];

        await expect(
            executor.execute(
                "UPDATE Users SET Name = @name",
                parameters
            )
        ).resolves.toBe(1);

        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledWith(
            "UPDATE Users SET Name = @name",
            parameters
        );
    });

    test("uses an empty parameter list by default", async () => {
        const query = jest.fn<
            (
                sql: string,
                parameters?: SqlParameter[]
            ) => Promise<SqlResult<unknown>>
        >().mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        const provider: IDatabaseProvider = {
            connect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(),
            query,
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

        const executor = new QueryExecutor(provider);

        await executor.query("SELECT 1");

        expect(query).toHaveBeenCalledWith("SELECT 1", []);
    });
});