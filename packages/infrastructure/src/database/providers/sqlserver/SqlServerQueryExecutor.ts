import sql from "mssql";

import type { SqlParameter } from "../../SqlParameter.js";
import type { SqlResult } from "../../SqlResult.js";

import type { SqlServerConnection } from "./SqlServerConnection.js";

export class SqlServerQueryExecutor {

    public constructor(
        private readonly connection: SqlServerConnection
    ) {}

    public async query<T>(
        statement: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {

        const request = this.createRequest(parameters);

        const result = await request.query<T>(statement);

        return {
            rows: result.recordset ?? [],
            rowsAffected: this.getRowsAffected(result),
            output: result.output
        };
    }

    public async execute(
        statement: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult> {

        const request = this.createRequest(parameters);

        const result = await request.query(statement);

        return {
            rows: result.recordset ?? [],
            rowsAffected: this.getRowsAffected(result),
            output: result.output
        };
    }

    private createRequest(
        parameters: SqlParameter[]
    ): sql.Request {

        const request = this.connection
            .getPool()
            .request();

        for (const parameter of parameters) {

            request.input(
                parameter.name,
                parameter.type as any,
                parameter.value
            );
        }

        return request;
    }

    private getRowsAffected(
        result: sql.IResult<unknown>
    ): number {

        if (!result.rowsAffected?.length) {
            return 0;
        }

        return result.rowsAffected.reduce(
            (total, count) => total + count,
            0
        );
    }
}