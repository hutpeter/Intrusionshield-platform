
/**
 * Indicates that tenant provisioning encountered an error and
 * the subsequent rollback also failed.
 *
 * The final database state must be treated as uncertain until
 * it has been investigated and reconciled.
 */
export class TenantTransactionOutcomeError extends AggregateError {
    constructor(
        provisioningError: unknown,
        rollbackError: unknown
    ) {
        super(
            [provisioningError, rollbackError],
            "Tenant provisioning failed and rollback also failed."
        );

        this.name = "TenantTransactionOutcomeError";
    }
}
