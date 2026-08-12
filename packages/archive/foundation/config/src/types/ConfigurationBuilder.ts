export interface IConfigurationBuilder
{
    addProvider(
        provider: IConfigurationProvider
    ): IConfigurationBuilder;

    build(): Promise<IConfiguration>;
}