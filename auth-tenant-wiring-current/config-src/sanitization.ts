import type { Configuration } from "./types/configuration.js";

/**
 * A configuration view safe for diagnostics, logging and support output.
 * Sensitive connection credentials are intentionally omitted.
 */
export type SanitizedConfiguration = Omit<
    Configuration,
    "database"
> & {
    database: Omit<
        Configuration["database"],
        "username" | "password"
    > & {
        credentialsConfigured: boolean;
    };
};

/**
 * Returns a non-sensitive representation of platform configuration.
 *
 * Passwords and usernames are never returned. This helper is the
 * supported boundary for diagnostic/configuration reporting.
 */
export function sanitizeConfiguration(
    configuration: Configuration
): SanitizedConfiguration {
    const {
        username: _username,
        password,
        ...database
    } = configuration.database;

    return {
        ...configuration,
        database: {
            ...database,
            credentialsConfigured:
                Boolean(password)
        }
    };
}
