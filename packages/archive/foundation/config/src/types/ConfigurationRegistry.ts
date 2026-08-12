export interface IConfigurationRegistry
{
    register(
        schema: IConfigurationSchema
    ): void;

    getSchemas(): IConfigurationSchema[];
}