/*
 * IntrusionShield Platform
 * Foundation Configuration Platform
 *
 * Copyright (c) IntrusionShield
 */

export interface Configuration
{
    /**
     * Returns a strongly typed configuration value.
     *
     * @param path Dot notation path (e.g. "database.server")
     */
    get<T>(path: string): T;

    /**
     * Returns a strongly typed configuration section.
     *
     * Example:
     *
     * const db = config.getSection<DatabaseOptions>("database");
     */
    getSection<T>(section: string): Readonly<T>;

    /**
     * Determines whether a configuration value exists.
     */
    has(path: string): boolean;

    /**
     * Returns the complete immutable configuration tree.
     */
    toObject(): Readonly<Record<string, unknown>>;

    /**
     * Prevents further modification.
     */
    freeze(): void;

    /**
     * Indicates whether the configuration is immutable.
     */
    isFrozen(): boolean;
}