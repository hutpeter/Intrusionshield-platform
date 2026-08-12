/**
 * Defines the configuration required to connect to a database.
 *
 * DatabaseOptions is database-provider agnostic. Individual providers
 * are responsible for translating these options into their native
 * connection configuration.
 */
export interface DatabaseOptions {
    /**
     * Database server hostname or IP address.
     */
    server: string;

    /**
     * Database server port.
     */
    port: number;

    /**
     * Database name.
     */
    database: string;

    /**
     * Database authentication username.
     */
    user: string;

    /**
     * Database authentication password.
     */
    password: string;

    /**
     * Indicates whether the database connection should use encryption.
     */
    encrypt: boolean;

    /**
     * Indicates whether the provider should trust the database server
     * certificate.
     */
    trustServerCertificate: boolean;
}

