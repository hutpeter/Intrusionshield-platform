export interface IConfigurationProvider
{
    readonly name: string;

    load(): Promise<Record<string, unknown>>;
}