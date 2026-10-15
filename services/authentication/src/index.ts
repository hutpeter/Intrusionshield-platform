import {
    getDatabaseConfiguration
} from "@intrusionshield/config";

import {
    SqlServerProvider,
    resolveDatabaseRoleConfiguration
} from "@intrusionshield/database";

import {
    SqlTenantConfigurationRepository,
    TenantConfigurationService
} from "@intrusionshield/tenant-configuration";

import {
    createApp
} from "./app.js";

import {
    AuthenticationService
} from "./application/AuthenticationService.js";

import {
    SqlAuthenticationRepository
} from "./infrastructure/SqlAuthenticationRepository.js";

import {
    AccessTokenService
} from "./security/AccessTokenService.js";

import {
    PasswordHasher
} from "./security/PasswordHasher.js";

export * from "./types/authentication.js";
export * from "./security/PasswordHasher.js";
export * from "./security/AccessTokenService.js";
export * from "./infrastructure/SqlAuthenticationRepository.js";
export * from "./application/AuthenticationService.js";
export {
    createApp
} from "./app.js";
export {
    createAuthenticationRouter
} from "./routes/index.js";

function requiredEnvironment(
    name: string
): string {
    const value =
        process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `${name} must be supplied for the authentication service.`
        );
    }

    return value;
}

function positiveIntegerEnvironment(
    name: string,
    defaultValue: number
): number {
    const raw =
        process.env[name]?.trim();

    if (!raw) {
        return defaultValue;
    }

    const value =
        Number(raw);

    if (
        !Number.isInteger(value) ||
        value <= 0
    ) {
        throw new Error(
            `${name} must be a positive integer.`
        );
    }

    return value;
}

async function start(): Promise<void> {
    const configuration =
        getDatabaseConfiguration();

    if (!configuration.username) {
        throw new Error(
            "DB_USERNAME or DB_USER must be supplied for the authentication service."
        );
    }

    if (!configuration.password) {
        throw new Error(
            "DB_PASSWORD must be supplied for the authentication service."
        );
    }

    const resolved = resolveDatabaseRoleConfiguration("PLATFORM", {
        server: configuration.server,
        port: configuration.port,
        database: configuration.database,
        user: configuration.username,
        password: configuration.password,
        encrypt: configuration.encrypt,
        trustServerCertificate: configuration.trustServerCertificate
    });
    const database = new SqlServerProvider(resolved.options);

    await database.connect();

    const authenticationRepository =
        new SqlAuthenticationRepository(
            database
        );

    const tenantConfigurationRepository =
        new SqlTenantConfigurationRepository(
            database
        );

    const tenantConfigurationService =
        new TenantConfigurationService(
            tenantConfigurationRepository
        );

    const passwordHasher =
        new PasswordHasher();

    const accessTokenService =
        new AccessTokenService({
            secret:
                requiredEnvironment(
                    "AUTH_TOKEN_SECRET"
                ),
            issuer:
                process.env
                    .AUTH_TOKEN_ISSUER
                    ?.trim() ||
                "eis-authentication",
            audience:
                process.env
                    .AUTH_TOKEN_AUDIENCE
                    ?.trim() ||
                "eis",
            lifetimeSeconds:
                positiveIntegerEnvironment(
                    "AUTH_TOKEN_LIFETIME_SECONDS",
                    3600
                )
        });

    const authenticationService =
        new AuthenticationService(
            authenticationRepository,
            tenantConfigurationService,
            passwordHasher,
            accessTokenService
        );

    const app =
        createApp({
            authenticationService,
            accessTokenService
        });

    const port =
        positiveIntegerEnvironment(
            "AUTH_PORT",
            4400
        );

    const server =
        app.listen(
            port,
            () => {
                console.log(
                    `EIS authentication service listening on port ${port}`
                );
            }
        );

    const shutdown =
        async (): Promise<void> => {
            server.close();

            await database.disconnect();
        };

    process.once(
        "SIGINT",
        () => {
            void shutdown();
        }
    );

    process.once(
        "SIGTERM",
        () => {
            void shutdown();
        }
    );
}

const isMainModule =
    process.argv[1] !== undefined &&
    import.meta.url ===
        new URL(
            `file://${process.argv[1].replace(
                /\\/g,
                "/"
            )}`
        ).href;

if (isMainModule) {
    start().catch(
        (error: unknown) => {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            console.error(
                `EIS authentication service failed to start: ${message}`
            );

            process.exitCode = 1;
        }
    );
}
