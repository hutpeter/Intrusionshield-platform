/*
 * IntrusionShield Platform
 *
 * @package @intrusionshield/config
 *
 * Default configuration implementation.
 */

import { Configuration } from "../contracts/Configuration";
import { ConfigurationError } from "../errors/ConfigurationError";


export class DefaultConfiguration
    implements Configuration
{
    private readonly values:
        Record<string, unknown>;

    private frozen = false;


    constructor(
        values: Record<string, unknown>
    )
    {
        this.values =
            this.clone(values);
    }


    public get<T>(
        path: string
    ): T
    {
        const value =
            this.resolvePath(path);


        if (value === undefined)
        {
            throw new ConfigurationError(
                "configuration.value.not_found",
                `Configuration value '${path}' was not found.`,
                {
                    path
                }
            );
        }


        return value as T;
    }


    public getSection<T>(
        section: string
    ): Readonly<T>
    {
        const value =
            this.resolvePath(section);


        if (
            value === undefined ||
            typeof value !== "object" ||
            value === null
        )
        {
            throw new ConfigurationError(
                "configuration.section.not_found",
                `Configuration section '${section}' was not found.`,
                {
                    section
                }
            );
        }


        return Object.freeze(
            this.clone(
                value as Record<string, unknown>
            )
        ) as Readonly<T>;
    }


    public has(
        path: string
    ): boolean
    {
        return this.resolvePath(path)
            !== undefined;
    }


    public toObject():
        Readonly<Record<string, unknown>>
    {
        return Object.freeze(
            this.clone(this.values)
        );
    }


    public freeze():
        void
    {
        this.frozen = true;
    }


    public isFrozen():
        boolean
    {
        return this.frozen;
    }


    private resolvePath(
        path: string
    ): unknown
    {
        return path
            .split(".")
            .reduce(
                (
                    current: unknown,
                    key: string
                ) =>
                {
                    if (
                        current === null ||
                        typeof current !== "object"
                    )
                    {
                        return undefined;
                    }


                    return (
                        current as Record<string, unknown>
                    )[key];

                },
                this.values
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


        if (
            Array.isArray(value)
        )
        {
            return value.map(
                item =>
                    this.clone(item)
            ) as T;
        }


        const cloned:
            Record<string, unknown> = {};


        for (
            const [key, child]
            of Object.entries(
                value as Record<string, unknown>
            )
        )
        {
            cloned[key] =
                this.clone(child);
        }


        return cloned as T;
    }
}