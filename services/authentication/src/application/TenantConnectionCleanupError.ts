
/**
 * Indicates that tenant administration completed its primary
 * operation but one or more database connections could not
 * be cleaned up successfully.
 *
 * IMPORTANT:
 * This error does not establish whether tenant provisioning
 * committed or rolled back.
 *
 * Callers must not automatically retry tenant creation based
 * solely on this error.
 */
export class TenantConnectionCleanupError extends AggregateError {
    constructor(cleanupErrors: unknown[]) {
        super(
            cleanupErrors,
            "Tenant administration database connection cleanup failed."
        );

        this.name = "TenantConnectionCleanupError";
    }
}
