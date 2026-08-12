import sql from "mssql";

export interface SqlServerConnectionOptions {
    server: string;
    port: number;
    database: string;
    user: string;
    password: string;

    encrypt?: boolean;
    trustServerCertificate?: boolean;

    connectionTimeout?: number;
    requestTimeout?: number;

    pool?: {
        max?: number;
        min?: number;
        idleTimeoutMillis?: number;
    };
}

export class SqlServerConnection {

    private pool: sql.ConnectionPool | null = null;

    public constructor(
        private readonly options: SqlServerConnectionOptions
    ) {}

    public async connect(): Promise<void> {

        if (this.pool?.connected) {
            return;
        }

        const config: sql.config = {
            server: this.options.server,
            port: this.options.port,
            database: this.options.database,
            user: this.options.user,
            password: this.options.password,

            options: {
                encrypt: this.options.encrypt ?? false,
                trustServerCertificate:
                    this.options.trustServerCertificate ?? true
            },

            connectionTimeout:
                this.options.connectionTimeout ?? 30000,

            requestTimeout:
                this.options.requestTimeout ?? 30000,

            pool: {
                max: this.options.pool?.max ?? 10,
                min: this.options.pool?.min ?? 0,
                idleTimeoutMillis:
                    this.options.pool?.idleTimeoutMillis ?? 30000
            }
        };

        this.pool = await sql.connect(config);
    }

    public async disconnect(): Promise<void> {

        if (!this.pool) {
            return;
        }

        await this.pool.close();

        this.pool = null;
    }

    public isConnected(): boolean {

        return this.pool?.connected === true;
    }

    public getPool(): sql.ConnectionPool {

        if (!this.pool) {
            throw new Error(
                "SQL Server connection has not been established."
            );
        }

        return this.pool;
    }
}