export type ConfigurationEnvironment =
    | "development"
    | "production"
    | "test";

export function getEnvironment():
    ConfigurationEnvironment {

    const environment =
        process.env.NODE_ENV?.toLowerCase();

    switch (environment) {
        case "production":
            return "production";

        case "test":
            return "test";

        case "development":
        default:
            return "development";
    }
}

export function loadEnvironment(): void {
    process.env.NODE_ENV ??= "development";
}