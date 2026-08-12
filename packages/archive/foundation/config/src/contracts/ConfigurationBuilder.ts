/*
 * IntrusionShield Platform
 */

import { Configuration } from "../configuration";
import { ConfigurationProvider } from "../providers";

export interface ConfigurationBuilder
{
    addProvider(
        provider: ConfigurationProvider
    ): this;

    build(): Promise<Configuration>;
}