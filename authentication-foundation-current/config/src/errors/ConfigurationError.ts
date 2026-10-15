/**
 * Represents an error caused by invalid or incomplete
 * IntrusionShield configuration.
 */
export class ConfigurationError extends Error {
    public readonly details?: Record<string, unknown>;

    constructor(
        message: string,
        details?: Record<string, unknown>
    ) {
        super(message);

        this.name = "ConfigurationError";
        this.details = details;

        Object.setPrototypeOf(
            this,
            new.target.prototype
        );
    }
}