import type { SqlParameter } from "../../SqlParameter.js";
import type { SqlResult } from "../../SqlResult.js";

import type { IDatabaseProvider } from "../IDatabaseProvider.js";

import {
    SqlServerConnection,
    type SqlServerConnectionOptions
} from "./SqlServerConnection.js";

import { SqlServerQueryExecutor } from "./SqlServerQueryExecutor.js";

export class SqlServerProvider implements IDatabaseProvider {

    private readonly connection: SqlServerConnection;
    private readonly executor: SqlServerQueryExecutor;

    public constructor(
        options: SqlServerConnectionOptions
    ) {
        this.connection = new SqlServerConnection(options);

        this.executor = new SqlServerQueryExecutor(
            this.connection
        );
    }

    public async connect(): Promise<void> {

        await this.connection.connect();
    }

    public async disconnect(): Promise<void> {

        await this.connection.disconnect();
    }

    public async query<T>(
        statement: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {

        return this.executor.query<T>(
            statement,
            parameters
        );
    }

    public async execute(
        statement: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult> {

        return this.executor.execute(
            statement,
            parameters
        );
    }

    public isConnected(): boolean {

        return this.connection.isConnected();
    }
}