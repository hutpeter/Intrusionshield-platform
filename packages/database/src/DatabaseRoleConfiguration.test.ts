import { describe, expect, it } from "@jest/globals";
import { resolveDatabaseRoleConfiguration } from "./DatabaseRoleConfiguration.js";

const defaults = {
    server: "localhost", port: 1433, database: "RubyDev", user: "dev",
    password: "not-a-real-password", encrypt: false, trustServerCertificate: true
};

describe("database role configuration", () => {
    it("preserves the current single-database deployment by default", () => {
        const result = resolveDatabaseRoleConfiguration("BAS_EMS", defaults, {});
        expect(result.options).toEqual(defaults);
        expect(result.isolatedDatabaseConfigured).toBe(false);
    });
    it("supports a dedicated database without changing other roles", () => {
        const env = { RUBY_BAS_EMS_DB_DATABASE: "RubyBasEms" };
        expect(resolveDatabaseRoleConfiguration("BAS_EMS", defaults, env).options.database)
            .toBe("RubyBasEms");
        expect(resolveDatabaseRoleConfiguration("PLATFORM", defaults, env).options.database)
            .toBe("RubyDev");
    });
    it("supports an independent host and credentials", () => {
        const env = {
            RUBY_ATHENA_DB_SERVER: "athena-sql",
            RUBY_ATHENA_DB_USER: "athena_app",
            RUBY_ATHENA_DB_PASSWORD: "separate-secret",
            RUBY_ATHENA_DB_PORT: "1444",
            RUBY_ATHENA_DB_ENCRYPT: "true"
        };
        const result = resolveDatabaseRoleConfiguration("ATHENA", defaults, env);
        expect(result.options.server).toBe("athena-sql");
        expect(result.options.user).toBe("athena_app");
        expect(result.options.port).toBe(1444);
        expect(result.options.encrypt).toBe(true);
    });
    it("rejects invalid port and boolean overrides", () => {
        expect(() => resolveDatabaseRoleConfiguration("PLATFORM", defaults,
            { RUBY_PLATFORM_DB_PORT: "abc" })).toThrow(/PORT/);
        expect(() => resolveDatabaseRoleConfiguration("PLATFORM", defaults,
            { RUBY_PLATFORM_DB_ENCRYPT: "maybe" })).toThrow(/ENCRYPT/);
    });
});
