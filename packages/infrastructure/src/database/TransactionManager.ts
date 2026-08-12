import type { DatabaseManager } from "./DatabaseManager.js";

export type TransactionOperation<T> =
    () => Promise<T>;

/**
 * Provides transaction orchestration for application and infrastructure
 * components.
 *
 * A transaction is committed when the supplied operation completes
 * successfully. If the operation throws, the transaction is rolled back
 * and the original error is re-thrown.
 */
export class TransactionManager {
    public constructor(
        private readonly database: DatabaseManager
    ) {}

    public async execute<T>(
        operation: TransactionOperation<T>
    ): Promise<T> {
        await this.database.beginTransaction();

        try {
            const result = await operation();

            await this.database.commitTransaction();

            return result;
        } catch (error) {
            await this.rollbackSafely();

            throw error;
        }
    }

    private async rollbackSafely(): Promise<void> {
        try {
            await this.database.rollbackTransaction();
        } catch (rollbackError) {
            /*
             * The original transaction operation error is deliberately
             * preserved and re-thrown by execute().
             *
             * Observability will eventually record rollback failures.
             */
            void rollbackError;
        }
    }
}