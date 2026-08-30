/**
 * Configuration required by a database provider.
 *
 * The shape is intentionally provider-neutral. Provider implementations
 * translate these options into their database driver's configuration.
 */
export interface DatabaseOptions {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
}
