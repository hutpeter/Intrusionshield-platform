
import { TenantConnectionCleanupError } from "./TenantConnectionCleanupError.js";

export interface TenantAdminConnection {
    disconnect(): Promise<void>;
}

/**
 * Attempts to disconnect both tenant administration connections.
 *
 * A failure in one connection must not prevent cleanup
 * of the other connection.
 *
 * If the primary operation failed, preserve that error.
 * Cleanup failures are reported separately through logging.
 *
 * If the primary operation succeeded but cleanup failed,
 * throw TenantConnectionCleanupError.
 *
 * A cleanup failure does not establish whether the
 * provisioning transaction committed or rolled back.
 */
export async function cleanupTenantAdminConnections(
    writeDatabase: TenantAdminConnection,
    auditDatabase: TenantAdminConnection,
    operationFailed: boolean,
    operationError?: unknown
): Promise<void> {
    const results = await Promise.allSettled([
        writeDatabase.disconnect(),
        auditDatabase.disconnect()
    ]);

    const cleanupErrors: unknown[] = [];

    for (const result of results) {
        if (result.status === "rejected") {
            const failure = result as PromiseRejectedResult;

            cleanupErrors.push(failure.reason);

            console.error(
                "Tenant administration database cleanup failed:",
                failure.reason
            );
        }
    }

    if (operationFailed) {
        throw operationError;
    }

    if (cleanupErrors.length > 0) {
        throw new TenantConnectionCleanupError(
            cleanupErrors
        );
    }
}
