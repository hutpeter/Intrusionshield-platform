/*
 * IntrusionShield Platform
 */

export class ConfigurationError extends Error
{
    public readonly code: string;

    public readonly details?: unknown;

    constructor(
        code: string,
        message: string,
        details?: unknown)
    {
        super(message);

        this.name = "ConfigurationError";

        this.code = code;

        this.details = details;

        Object.setPrototypeOf(
            this,
            new.target.prototype);
    }
}