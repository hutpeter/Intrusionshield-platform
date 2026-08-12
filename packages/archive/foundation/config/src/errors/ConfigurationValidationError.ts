/*
 * IntrusionShield Platform
 */

import { ConfigurationError } from "./ConfigurationError";

export class ConfigurationValidationError
    extends ConfigurationError
{
    constructor(
        code: string,
        message: string,
        details?: unknown)
    {
        super(
            code,
            message,
            details);

        this.name =
            "ConfigurationValidationError";
    }
}