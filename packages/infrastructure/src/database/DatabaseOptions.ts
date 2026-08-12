export interface DatabaseOptions {
    server: string;
    port: number;
    database: string;
    username: string;
    password: string;

    encrypt: boolean;
    trustServerCertificate: boolean;

    pool: {
        min: number;
        max: number;
        idleTimeoutMillis: number;
    };

    connectionTimeout: number;
    requestTimeout: number;
}