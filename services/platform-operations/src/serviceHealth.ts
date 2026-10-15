import type {
    ServiceDefinition
} from "./serviceRegistry.js";

export type ServiceHealthStatus =
    | "healthy"
    | "degraded"
    | "down";

export type ServiceHealthResult = {
    readonly id: string;
    readonly name: string;
    readonly category: ServiceDefinition["category"];
    readonly status: ServiceHealthStatus;
    readonly host: string;
    readonly port: number;
    readonly healthPath: string;
    readonly responseTimeMs: number | null;
    readonly lastCheckedAt: string;
    readonly message?: string;
};

const HEALTH_TIMEOUT_MS = 3000;

export async function checkServiceHealth(
    service: ServiceDefinition
): Promise<ServiceHealthResult> {

    const startedAt =
        performance.now();

    const lastCheckedAt =
        new Date().toISOString();

    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            HEALTH_TIMEOUT_MS
        );

    try {

        const url =
            `http://${service.host}:${service.port}${service.healthPath}`;

        const response =
            await fetch(
                url,
                {
                    method: "GET",
                    signal: controller.signal
                }
            );

        const responseTimeMs =
            Math.round(
                performance.now() - startedAt
            );

        if (!response.ok) {
            return {
                id: service.id,
                name: service.name,
                category: service.category,
                status: "degraded",
                host: service.host,
                port: service.port,
                healthPath: service.healthPath,
                responseTimeMs,
                lastCheckedAt,
                message:
                    `Health endpoint returned HTTP ${response.status}.`
            };
        }

        return {
            id: service.id,
            name: service.name,
            category: service.category,
            status: "healthy",
            host: service.host,
            port: service.port,
            healthPath: service.healthPath,
            responseTimeMs,
            lastCheckedAt
        };

    } catch (error) {

        const responseTimeMs =
            Math.round(
                performance.now() - startedAt
            );

        return {
            id: service.id,
            name: service.name,
            category: service.category,
            status: "down",
            host: service.host,
            port: service.port,
            healthPath: service.healthPath,
            responseTimeMs,
            lastCheckedAt,
            message:
                error instanceof Error
                    ? error.message
                    : "Health check failed."
        };

    } finally {

        clearTimeout(
            timeout
        );

    }
}

export async function checkAllServices(
    services: readonly ServiceDefinition[]
): Promise<ServiceHealthResult[]> {

    return Promise.all(
        services.map(
            (service) =>
                checkServiceHealth(service)
        )
    );
}