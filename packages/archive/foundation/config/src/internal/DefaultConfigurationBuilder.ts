/*
 * IntrusionShield Platform
 *
 * @package @intrusionshield/config
 */

import { ConfigurationBuilder } from "../contracts/ConfigurationBuilder";
import { Configuration } from "../contracts/Configuration";
import { ConfigurationProvider } from "../contracts/ConfigurationProvider";
import { ConfigurationOptions } from "../types/ConfigurationOptions";
import { DefaultConfiguration } from "./DefaultConfiguration";

export class DefaultConfigurationBuilder
    implements ConfigurationBuilder
{
    private readonly providers: ConfigurationProvider[] = [];

    private readonly options: ConfigurationOptions;

    constructor(
        options: ConfigurationOptions = {}
    )
    {
        this.options =
        {
            freeze: true,
            throwOnDuplicate: false,
            validateSchemas: true,
            ...options
        };
    }

    public addProvider(
        provider: ConfigurationProvider
    ): this
    {
        this.providers.push(provider);

        return this;
    }

    public async build():
        Promise<Configuration>
    {
        const merged: Record<string, unknown> = {};

        const orderedProviders =
            [...this.providers]
                .sort(
                    (a, b) =>
                        a.priority - b.priority
                );

        for (const provider of orderedProviders)
        {
            const values =
                await provider.load();

            this.deepMerge(
                merged,
                values
            );
        }

        const configuration =
            new DefaultConfiguration(
                merged
            );

        if (this.options.freeze)
        {
            configuration.freeze();
        }

        return configuration;
    }

    private deepMerge(
        target: Record<string, unknown>,
        source: Record<string, unknown>
    ): void
    {
        for (const [key, value] of Object.entries(source))
        {
            if (
                this.isObject(value) &&
                this.isObject(target[key])
            )
            {
                this.deepMerge(
                    target[key] as Record<string, unknown>,
                    value as Record<string, unknown>
                );

                continue;
            }

            target[key] = this.clone(value);
        }
    }

    private isObject(
        value: unknown
    ): value is Record<string, unknown>
    {
        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );
    }

    private clone<T>(
        value: T
    ): T
    {
        if (
            value === null ||
            typeof value !== "object"
        )
        {
            return value;
        }

        if (Array.isArray(value))
        {
            return value.map(
                item => this.clone(item)
            ) as T;
        }

        const result: Record<string, unknown> = {};

        for (const [key, child] of Object.entries(
            value as Record<string, unknown>
        ))
        {
            result[key] = this.clone(child);
        }

        return result as T;
    }
}