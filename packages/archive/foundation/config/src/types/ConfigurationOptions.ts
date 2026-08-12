/*
 * IntrusionShield Platform
 * Foundation Configuration Package
 */

export interface ConfigurationOptions
{
    /**
     * Automatically freeze configuration after build.
     *
     * Default: true
     */
    readonly freeze?: boolean;

    /**
     * Throw if duplicate keys are encountered.
     *
     * Default: false
     */
    readonly throwOnDuplicate?: boolean;

    /**
     * Validate registered schemas during build.
     *
     * Default: true
     */
    readonly validateSchemas?: boolean;
}