import type { DatabaseOptions } from "./DatabaseOptions.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";
import { SqlServerProvider } from "./providers/SqlServerProvider.js";

export type DatabaseProviderType = "sqlserver";

export interface DatabaseProviderFactoryOptions {
    readonly type: DatabaseProviderType;
    readonly options: DatabaseOptions;
}

/**
 * Creates database provider implementations.
 *
 * The factory exposes the database-provider abstraction and prevents
 * consumers from depending directly on database-driver implementations.
 */
export class ConnectionFactory {

    public static create(
        configuration: DatabaseProviderFactoryOptions
    ): IDatabaseProvider {

        switch (configuration.type) {

            case "sqlserver":
                return new SqlServerProvider(
                    configuration.options
                );

            default:
                return ConnectionFactory.unsupportedProvider(
                    configuration.type
                );
        }
    }

    private static unsupportedProvider(
        type: never
    ): never {

        throw new Error(
            `Unsupported database provider: ${String(type)}`
        );
    }
}