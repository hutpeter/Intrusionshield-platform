export interface IConfiguration
{
    get<T>(path: string): T;

    has(path: string): boolean;

    freeze(): void;

    isFrozen(): boolean;

    toObject(): Record<string, unknown>;
}