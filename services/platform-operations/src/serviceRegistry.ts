export type ServiceCategory =
    | "platform"
    | "product";

export type ServiceDefinition = {
    readonly id: string;
    readonly name: string;
    readonly category: ServiceCategory;
    readonly host: string;
    readonly port: number;
    readonly healthPath: string;
};

function readPort(
    environmentVariable: string,
    defaultPort: number
): number {
    const rawValue =
        process.env[environmentVariable];

    if (rawValue === undefined) {
        return defaultPort;
    }

    const port =
        Number(rawValue);

    if (
        !Number.isInteger(port) ||
        port <= 0 ||
        port > 65535
    ) {
        throw new Error(
            `${environmentVariable} must be a valid TCP port.`
        );
    }

    return port;
}

export const serviceRegistry:
    readonly ServiceDefinition[] = [
        {
            id: "gateway",
            name: "API Gateway",
            category: "platform",
            host: "localhost",
            port: readPort(
                "GATEWAY_SERVICE_PORT",
                4000
            ),
            healthPath: "/health"
        },
        {
            id: "authentication",
            name: "Authentication",
            category: "platform",
            host: "localhost",
            port: readPort(
                "AUTH_SERVICE_PORT",
                4400
            ),
            healthPath: "/health"
        },
        {
            id: "his",
            name: "Athena / HIS",
            category: "product",
            host: "localhost",
            port: readPort(
                "HIS_SERVICE_PORT",
                4300
            ),
            healthPath: "/health"
        },
        {
            id: "telemetry-energy",
            name: "Telemetry & Energy",
            category: "product",
            host: "localhost",
            port: readPort(
                "TELEMETRY_ENERGY_SERVICE_PORT",
                4401
            ),
            healthPath: "/health"
        }
    ];