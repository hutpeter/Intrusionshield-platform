import type { DatabaseOptions } from "./DatabaseOptions.js";
import type { IDatabaseContext } from "./IDatabaseContext.js";
import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";
import {
    ConnectionFactory,
    type DatabaseProviderType
} from "./ConnectionFactory.js";

export class DatabaseContext implements IDatabaseContext {

    private readonly provider: IDatabaseProvider;

    constructor(
        private readonly options: DatabaseOptions,
        provider?: IDatabaseProvider
    ) {
        this.provider =
            provider ??
            ConnectionFactory.create({
                type: "sqlserver" satisfies DatabaseProviderType,
                options: this.options
            });
    }

    public async connect(): Promise<void> {
        await this.provider.connect();
    }

    public async disconnect(): Promise<void> {
        await this.provider.disconnect();
    }

    public isConnected(): boolean {
        return this.provider.isConnected();
    }

    public async query<T>(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {

        return this.provider.query<T>(
            sql,
            parameters
        );
    }

    public async execute(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {

        return this.provider.execute(
            sql,
            parameters
        );
    }
}