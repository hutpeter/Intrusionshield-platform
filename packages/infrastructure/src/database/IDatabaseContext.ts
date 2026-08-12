import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";

export interface IDatabaseContext {

    connect(): Promise<void>;

    disconnect(): Promise<void>;

    isConnected(): boolean;

    query<T>(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<SqlResult<T>>;

    execute(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<number>;
}