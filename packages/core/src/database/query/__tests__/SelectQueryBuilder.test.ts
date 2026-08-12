
import { describe, expect, test } from "@jest/globals";

import { SelectQueryBuilder } from "../SelectQueryBuilder.js";

describe("SelectQueryBuilder", () => {
    test("builds a basic SELECT query", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports selecting specific columns", () => {
        const command = new SelectQueryBuilder()
            .select("UserId", "Username", "Email")
            .from("Users")
            .build();

        expect(command.sql).toBe(
            "SELECT UserId, Username, Email FROM Users"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports a single WHERE condition", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where("UserId", "=", "123")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE UserId = @p0"
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: "123"
            }
        ]);
    });

    test("parameterizes values instead of embedding them in SQL", () => {
        const sensitiveValue = "super-secret-value";

        const command = new SelectQueryBuilder()
            .from("Users")
            .where(
                "Password",
                "=",
                sensitiveValue
            )
            .build();

        expect(command.sql).not.toContain(
            sensitiveValue
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: sensitiveValue
            }
        ]);
    });

    test("supports multiple WHERE conditions", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where("IsActive", "=", true)
            .where("Username", "=", "admin")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE IsActive = @p0 AND Username = @p1"
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: true
            },
            {
                name: "p1",
                value: "admin"
            }
        ]);
    });

    test("preserves parameter ordering", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where("Username", "=", "admin")
            .where("Email", "=", "admin@example.com")
            .build();

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: "admin"
            },
            {
                name: "p1",
                value: "admin@example.com"
            }
        ]);
    });

    test("supports IS NULL", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where("DeletedAt", "IS NULL")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE DeletedAt IS NULL"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports IS NOT NULL", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where("Email", "IS NOT NULL")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE Email IS NOT NULL"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports IN conditions", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where(
                "RoleId",
                "IN",
                ["admin", "auditor", "user"]
            )
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE RoleId IN (@p0, @p1, @p2)"
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: "admin"
            },
            {
                name: "p1",
                value: "auditor"
            },
            {
                name: "p2",
                value: "user"
            }
        ]);
    });

    test("supports NOT IN conditions", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .where(
                "Status",
                "NOT IN",
                ["deleted", "disabled"]
            )
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users WHERE Status NOT IN (@p0, @p1)"
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: "deleted"
            },
            {
                name: "p1",
                value: "disabled"
            }
        ]);
    });

    test("rejects an empty IN array", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .where("RoleId", "IN", [])
        ).toThrow(
            "IN requires a non-empty array."
        );
    });

    test("rejects an empty NOT IN array", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .where("RoleId", "NOT IN", [])
        ).toThrow(
            "NOT IN requires a non-empty array."
        );
    });

    test("supports ascending ORDER BY", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .orderBy("Username", "ASC")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users ORDER BY Username ASC"
        );
    });

    test("supports descending ORDER BY", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .orderBy("CreatedAt", "DESC")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users ORDER BY CreatedAt DESC"
        );
    });

    test("supports multiple ORDER BY expressions", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .orderBy("LastName", "ASC")
            .orderBy("FirstName", "ASC")
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users ORDER BY LastName ASC, FirstName ASC"
        );
    });

    test("supports LIMIT using OFFSET/FETCH", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .limit(10)
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports OFFSET", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .offset(20)
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users OFFSET 20 ROWS"
        );

        expect(command.parameters).toEqual([]);
    });

    test("supports LIMIT with OFFSET", () => {
        const command = new SelectQueryBuilder()
            .from("Users")
            .offset(20)
            .limit(10)
            .build();

        expect(command.sql).toBe(
            "SELECT * FROM Users OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"
        );

        expect(command.parameters).toEqual([]);
    });

    test("rejects a negative LIMIT", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .limit(-1)
        ).toThrow(
            "limit must be a non-negative integer."
        );
    });

    test("rejects a negative OFFSET", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .offset(-1)
        ).toThrow(
            "offset must be a non-negative integer."
        );
    });

    test("rejects a non-integer LIMIT", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .limit(1.5)
        ).toThrow(
            "limit must be a non-negative integer."
        );
    });

    test("rejects a non-integer OFFSET", () => {
        expect(() =>
            new SelectQueryBuilder()
                .from("Users")
                .offset(1.5)
        ).toThrow(
            "offset must be a non-negative integer."
        );
    });

    test("requires a table before building", () => {
        expect(() =>
            new SelectQueryBuilder().build()
        ).toThrow(
            "A table must be specified before building a SELECT query."
        );
    });

    test("builds a complete parameterized query", () => {
        const command = new SelectQueryBuilder()
            .select(
                "UserId",
                "Username",
                "Email"
            )
            .from("Users")
            .where(
                "IsActive",
                "=",
                true
            )
            .where(
                "RoleId",
                "IN",
                ["admin", "auditor"]
            )
            .orderBy(
                "Username",
                "ASC"
            )
            .offset(0)
            .limit(25)
            .build();

        expect(command.sql).toBe(
            "SELECT UserId, Username, Email FROM Users WHERE IsActive = @p0 AND RoleId IN (@p1, @p2) ORDER BY Username ASC OFFSET 0 ROWS FETCH NEXT 25 ROWS ONLY"
        );

        expect(command.parameters).toEqual([
            {
                name: "p0",
                value: true
            },
            {
                name: "p1",
                value: "admin"
            },
            {
                name: "p2",
                value: "auditor"
            }
        ]);
    });
});