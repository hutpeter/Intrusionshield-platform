import type { DatabaseOptions } from "./DatabaseOptions.js";

/** Explicit deployment roles; product-specific roles can be added without schema coupling. */
export type RubyDatabaseRole =
    | "PLATFORM"
    | "ATHENA"
    | "BAS_EMS"
    | "TELEMETRY"
    | "LEGAL_CMS";

export interface DatabaseRoleResolution {
    readonly role: RubyDatabaseRole;
    readonly options: DatabaseOptions;
    /** True only if this role has an explicit database-name override. */
    readonly isolatedDatabaseConfigured: boolean;
}

/**
 * Resolve one service's connection. Unset role variables inherit the existing
 * DB_* connection. This is connection separation, NOT tenant database routing.
 *
 * Role variables: RUBY_<ROLE>_DB_SERVER, _PORT, _DATABASE, _USER,
 * _PASSWORD, _ENCRYPT, _TRUST_SERVER_CERTIFICATE.
 *
 * Never log the returned options because they contain credentials.
 */
export function resolveDatabaseRoleConfiguration(
    role: RubyDatabaseRole,
    defaults: DatabaseOptions,
    environment: Readonly<Record<string, string | undefined>> = process.env
): DatabaseRoleResolution {
    const prefix = `RUBY_${role}_DB_`;
    const get = (suffix: string): string | undefined => {
        const value = environment[`${prefix}${suffix}`]?.trim();
        return value || undefined;
    };
    const portValue = get("PORT");
    const port = portValue === undefined ? defaults.port : Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`${prefix}PORT must be an integer between 1 and 65535.`);
    }
    const booleanValue = (suffix: string, fallback: boolean): boolean => {
        const value = get(suffix)?.toLowerCase();
        if (value === undefined) return fallback;
        if (value === "true") return true;
        if (value === "false") return false;
        throw new Error(`${prefix}${suffix} must be true or false.`);
    };
    const options: DatabaseOptions = {
        server: get("SERVER") ?? defaults.server,
        port,
        database: get("DATABASE") ?? defaults.database,
        user: get("USER") ?? defaults.user,
        password: get("PASSWORD") ?? defaults.password,
        encrypt: booleanValue("ENCRYPT", defaults.encrypt),
        trustServerCertificate: booleanValue(
            "TRUST_SERVER_CERTIFICATE", defaults.trustServerCertificate
        )
    };
    if (!options.server || !options.database || !options.user || !options.password) {
        throw new Error(`Database connection for role ${role} is incomplete.`);
    }
    return {
        role,
        options,
        isolatedDatabaseConfigured: get("DATABASE") !== undefined
    };
}
