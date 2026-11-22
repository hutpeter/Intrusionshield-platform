import { describe, expect, test } from "@jest/globals";
import { createDatabaseDialect } from "../../dialects/DatabaseDialect.js";
import { SelectQueryBuilder } from "../SelectQueryBuilder.js";

describe("database dialect portability", () => {
    test("SQL Server remains the default", () => {
        const command = new SelectQueryBuilder().from("Users").where("Id", "=", 5).orderBy("Id").limit(10).build();
        expect(command.sql).toBe("SELECT * FROM Users WHERE Id = @p0 ORDER BY Id ASC OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY");
    });

    test("PostgreSQL uses numbered placeholders and LIMIT/OFFSET", () => {
        const command = new SelectQueryBuilder(createDatabaseDialect("postgresql"))
            .from("Users").where("TenantId", "=", "t1").where("Status", "IN", ["active", "pending"])
            .orderBy("Id").offset(20).limit(10).build();
        expect(command.sql).toBe("SELECT * FROM Users WHERE TenantId = $1 AND Status IN ($2, $3) ORDER BY Id ASC LIMIT 10 OFFSET 20");
        expect(command.parameters).toEqual([
            { name: "p0", value: "t1" }, { name: "p1", value: "active" }, { name: "p2", value: "pending" }
        ]);
    });

    test("does not rewrite parameter-like text inside SQL identifiers", () => {
        const command = new SelectQueryBuilder(createDatabaseDialect("postgresql"))
            .select("audit_@p0").from("Users").where("Id", "=", 7).build();
        expect(command.sql).toBe("SELECT audit_@p0 FROM Users WHERE Id = $1");
    });

    test("PostgreSQL offset without limit", () => {
        const command = new SelectQueryBuilder(createDatabaseDialect("postgresql")).from("Users").offset(3).build();
        expect(command.sql).toBe("SELECT * FROM Users OFFSET 3");
    });

    test("quotes identifiers using engine-specific escaping", () => {
        expect(createDatabaseDialect("sqlserver").quoteIdentifier("a]b")).toBe("[a]]b]");
        expect(createDatabaseDialect("postgresql").quoteIdentifier('a"b')).toBe('"a""b"');
    });
});
