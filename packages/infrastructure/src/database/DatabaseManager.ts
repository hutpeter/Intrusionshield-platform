export class DatabaseManager {

    constructor(
        private readonly context: DatabaseContext,
        private readonly executor: QueryExecutor
    ) {}

    public async connect(): Promise<void> {

        await this.context.connect();
    }

    public async disconnect(): Promise<void> {

        await this.context.close();
    }

    public async query<T>(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {

        return this.executor.query<T>(sql, parameters);
    }

    public async execute(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {

        return this.executor.execute(sql, parameters);
    }
}