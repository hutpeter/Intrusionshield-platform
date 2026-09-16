import express, {
    type Express,
    type Response
} from "express";

import type {
    IDatabaseProvider
} from "@intrusionshield/database";

import type {
    AssetStatus,
    DeviceStatus,
    MeasurementDataType,
    TelemetryQuality
} from "@intrusionshield/telemetry";

import {
    SqlAssetRepository
} from "./infrastructure/repositories/AssetRepository.js";

import {
    SqlDeviceRepository
} from "./infrastructure/repositories/DeviceRepository.js";

import {
    SqlMeasurementDefinitionRepository
} from "./infrastructure/repositories/MeasurementDefinitionRepository.js";

import {
    SqlSiteRepository
} from "./infrastructure/repositories/SiteRepository.js";

import {
    SqlTelemetryRepository
} from "./infrastructure/repositories/TelemetryRepository.js";

import {
    requireTenantId,
    tenantContext,
    type TenantRequest
} from "./middleware/tenantContext.js";

export function createApp(
    database: IDatabaseProvider
): Express {
    const app = express();

    const sites =
        new SqlSiteRepository(database);

    const assets =
        new SqlAssetRepository(database);

    const devices =
        new SqlDeviceRepository(database);

    const measurementDefinitions =
        new SqlMeasurementDefinitionRepository(
            database
        );

    const readings =
        new SqlTelemetryRepository(database);

    app.use(
        express.json({
            limit: "1mb"
        })
    );

    app.get(
        "/health",
        (_request, response) => {
            response.json({
                service:
                    "EIS Telemetry & Energy",
                status: "ok"
            });
        }
    );

    app.use(
        "/api/v1/telemetry",
        tenantContext
    );

    app.post(
        "/api/v1/telemetry/sites",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const site =
                    await sites.create({
                        tenantId:
                            requireTenantId(
                                request
                            ),
                        code:
                            getRequiredString(
                                body,
                                "code"
                            ),
                        name:
                            getRequiredString(
                                body,
                                "name"
                            ),
                        description:
                            getOptionalString(
                                body,
                                "description"
                            ),
                        timezone:
                            getRequiredString(
                                body,
                                "timezone"
                            ),
                        latitude:
                            getOptionalNumber(
                                body,
                                "latitude"
                            ),
                        longitude:
                            getOptionalNumber(
                                body,
                                "longitude"
                            ),
                        status:
                            body.status ===
                            "INACTIVE"
                                ? "INACTIVE"
                                : "ACTIVE"
                    });

                response
                    .status(201)
                    .json(site);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/sites",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await sites.findAll(
                    requireTenantId(request)
                )
            );
        }
    );

    app.get(
        "/api/v1/telemetry/sites/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const site =
                await sites.findById(
                    String(
                        request.params.id ?? ""
                    ),
                    requireTenantId(request)
                );

            if (!site) {
                sendNotFound(
                    response,
                    "Site"
                );
                return;
            }

            response.json(site);
        }
    );

    app.post(
        "/api/v1/telemetry/assets",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const asset =
                    await assets.create({
                        tenantId:
                            requireTenantId(
                                request
                            ),
                        siteId:
                            getRequiredString(
                                body,
                                "siteId"
                            ),
                        parentAssetId:
                            getOptionalString(
                                body,
                                "parentAssetId"
                            ),
                        code:
                            getRequiredString(
                                body,
                                "code"
                            ),
                        name:
                            getRequiredString(
                                body,
                                "name"
                            ),
                        assetType:
                            getRequiredString(
                                body,
                                "assetType"
                            ),
                        manufacturer:
                            getOptionalString(
                                body,
                                "manufacturer"
                            ),
                        model:
                            getOptionalString(
                                body,
                                "model"
                            ),
                        serialNumber:
                            getOptionalString(
                                body,
                                "serialNumber"
                            ),
                        status:
                            parseAssetStatus(
                                body.status
                            )
                    });

                response
                    .status(201)
                    .json(asset);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/assets/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const asset =
                await assets.findById(
                    String(
                        request.params.id ?? ""
                    ),
                    requireTenantId(request)
                );

            if (!asset) {
                sendNotFound(
                    response,
                    "Asset"
                );
                return;
            }

            response.json(asset);
        }
    );

    app.get(
        "/api/v1/telemetry/sites/:siteId/assets",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await assets.findBySite(
                    String(
                        request.params.siteId ??
                        ""
                    ),
                    requireTenantId(request)
                )
            );
        }
    );

    app.post(
        "/api/v1/telemetry/devices",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const device =
                    await devices.create({
                        tenantId:
                            requireTenantId(
                                request
                            ),
                        siteId:
                            getRequiredString(
                                body,
                                "siteId"
                            ),
                        assetId:
                            getOptionalString(
                                body,
                                "assetId"
                            ),
                        code:
                            getRequiredString(
                                body,
                                "code"
                            ),
                        name:
                            getRequiredString(
                                body,
                                "name"
                            ),
                        deviceType:
                            getRequiredString(
                                body,
                                "deviceType"
                            ),
                        manufacturer:
                            getOptionalString(
                                body,
                                "manufacturer"
                            ),
                        model:
                            getOptionalString(
                                body,
                                "model"
                            ),
                        serialNumber:
                            getOptionalString(
                                body,
                                "serialNumber"
                            ),
                        protocol:
                            getOptionalString(
                                body,
                                "protocol"
                            ),
                        externalDeviceId:
                            getOptionalString(
                                body,
                                "externalDeviceId"
                            ),
                        status:
                            parseDeviceStatus(
                                body.status
                            )
                    });

                response
                    .status(201)
                    .json(device);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/devices/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const device =
                await devices.findById(
                    String(
                        request.params.id ?? ""
                    ),
                    requireTenantId(request)
                );

            if (!device) {
                sendNotFound(
                    response,
                    "Device"
                );
                return;
            }

            response.json(device);
        }
    );

    app.put(
        "/api/v1/telemetry/devices/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const tenantId =
                    requireTenantId(request);

                const id =
                    String(
                        request.params.id ?? ""
                    );

                const existing =
                    await devices.findById(
                        id,
                        tenantId
                    );

                if (!existing) {
                    sendNotFound(
                        response,
                        "Device"
                    );
                    return;
                }

                const body = getBody(request);

                const version =
                    getRequiredInteger(
                        body,
                        "version"
                    );

                const lastSeenAt =
                    getOptionalDate(
                        body,
                        "lastSeenAt"
                    );

                const result =
                    await devices.update({
                        id,
                        tenantId,
                        siteId:
                            getOptionalString(
                                body,
                                "siteId"
                            ) ??
                            existing.siteId,
                        assetId:
                            hasProperty(
                                body,
                                "assetId"
                            )
                                ? getOptionalString(
                                      body,
                                      "assetId"
                                  )
                                : existing.assetId,
                        code:
                            getOptionalString(
                                body,
                                "code"
                            ) ??
                            existing.code,
                        name:
                            getOptionalString(
                                body,
                                "name"
                            ) ??
                            existing.name,
                        deviceType:
                            getOptionalString(
                                body,
                                "deviceType"
                            ) ??
                            existing.deviceType,
                        manufacturer:
                            hasProperty(
                                body,
                                "manufacturer"
                            )
                                ? getOptionalString(
                                      body,
                                      "manufacturer"
                                  )
                                : existing.manufacturer,
                        model:
                            hasProperty(
                                body,
                                "model"
                            )
                                ? getOptionalString(
                                      body,
                                      "model"
                                  )
                                : existing.model,
                        serialNumber:
                            hasProperty(
                                body,
                                "serialNumber"
                            )
                                ? getOptionalString(
                                      body,
                                      "serialNumber"
                                  )
                                : existing.serialNumber,
                        protocol:
                            hasProperty(
                                body,
                                "protocol"
                            )
                                ? getOptionalString(
                                      body,
                                      "protocol"
                                  )
                                : existing.protocol,
                        externalDeviceId:
                            hasProperty(
                                body,
                                "externalDeviceId"
                            )
                                ? getOptionalString(
                                      body,
                                      "externalDeviceId"
                                  )
                                : existing.externalDeviceId,
                        status:
                            body.status ===
                            undefined
                                ? existing.status
                                : parseDeviceStatus(
                                      body.status
                                  ),
                        lastSeenAt:
                            hasProperty(
                                body,
                                "lastSeenAt"
                            )
                                ? lastSeenAt
                                : existing.lastSeenAt,
                        version
                    });

                if (
                    result.status ===
                    "NOT_FOUND"
                ) {
                    sendNotFound(
                        response,
                        "Device"
                    );
                    return;
                }

                if (
                    result.status ===
                    "CONFLICT"
                ) {
                    sendConflict(
                        response,
                        "Device was modified by another request. Refresh the device and retry."
                    );
                    return;
                }

                response.json(
                    result.device
                );
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/sites/:siteId/devices",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await devices.findBySite(
                    String(
                        request.params.siteId ??
                        ""
                    ),
                    requireTenantId(request)
                )
            );
        }
    );

    app.post(
        "/api/v1/telemetry/measurement-definitions",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const definition =
                    await measurementDefinitions.create({
                        tenantId:
                            requireTenantId(
                                request
                            ),
                        code:
                            getRequiredString(
                                body,
                                "code"
                            ),
                        name:
                            getRequiredString(
                                body,
                                "name"
                            ),
                        description:
                            getOptionalString(
                                body,
                                "description"
                            ),
                        unit:
                            getOptionalString(
                                body,
                                "unit"
                            ),
                        dataType:
                            parseMeasurementDataType(
                                body.dataType
                            ),
                        minimumValue:
                            getOptionalNumber(
                                body,
                                "minimumValue"
                            ),
                        maximumValue:
                            getOptionalNumber(
                                body,
                                "maximumValue"
                            )
                    });

                response
                    .status(201)
                    .json(definition);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/measurement-definitions",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await measurementDefinitions.findAll(
                    requireTenantId(request)
                )
            );
        }
    );

    app.get(
        "/api/v1/telemetry/measurement-definitions/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const definition =
                await measurementDefinitions.findById(
                    String(
                        request.params.id ?? ""
                    ),
                    requireTenantId(request)
                );

            if (!definition) {
                sendNotFound(
                    response,
                    "Measurement definition"
                );
                return;
            }

            response.json(definition);
        }
    );

    app.post(
        "/api/v1/telemetry/readings",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const observedAt =
                    new Date(
                        getRequiredString(
                            body,
                            "observedAt"
                        )
                    );

                if (
                    Number.isNaN(
                        observedAt.getTime()
                    )
                ) {
                    throw new Error(
                        "observedAt must be a valid date/time."
                    );
                }

                const reading =
                    await readings.create({
                        tenantId:
                            requireTenantId(
                                request
                            ),
                        siteId:
                            getRequiredString(
                                body,
                                "siteId"
                            ),
                        deviceId:
                            getRequiredString(
                                body,
                                "deviceId"
                            ),
                        measurementDefinitionId:
                            getRequiredString(
                                body,
                                "measurementDefinitionId"
                            ),
                        observedAt,
                        numericValue:
                            getOptionalNumber(
                                body,
                                "numericValue"
                            ),
                        booleanValue:
                            getOptionalBoolean(
                                body,
                                "booleanValue"
                            ),
                        stringValue:
                            getOptionalString(
                                body,
                                "stringValue"
                            ),
                        quality:
                            parseTelemetryQuality(
                                body.quality
                            ),
                        source:
                            getRequiredString(
                                body,
                                "source"
                            )
                    });

                response
                    .status(201)
                    .json(reading);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/telemetry/sites/:siteId/readings",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await readings.bySite(
                    String(
                        request.params.siteId ??
                        ""
                    ),
                    requireTenantId(request)
                )
            );
        }
    );

    return app;
}

function getBody(
    request: TenantRequest
): Record<string, unknown> {
    if (
        typeof request.body !== "object" ||
        request.body === null ||
        Array.isArray(request.body)
    ) {
        throw new Error(
            "Request body must be a JSON object."
        );
    }

    return request.body as
        Record<string, unknown>;
}

function hasProperty(
    body: Record<string, unknown>,
    property: string
): boolean {
    return Object.prototype.hasOwnProperty.call(
        body,
        property
    );
}

function getRequiredString(
    body: Record<string, unknown>,
    property: string
): string {
    const value = body[property];

    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        throw new Error(
            `${property} is required.`
        );
    }

    return value.trim();
}

function getOptionalString(
    body: Record<string, unknown>,
    property: string
): string | undefined {
    const value = body[property];

    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw new Error(
            `${property} must be a string.`
        );
    }

    const normalized = value.trim();

    return normalized || undefined;
}

function getOptionalNumber(
    body: Record<string, unknown>,
    property: string
): number | undefined {
    const value = body[property];

    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    if (
        typeof value !== "number" ||
        !Number.isFinite(value)
    ) {
        throw new Error(
            `${property} must be a finite number.`
        );
    }

    return value;
}

function getRequiredInteger(
    body: Record<string, unknown>,
    property: string
): number {
    const value = body[property];

    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 1
    ) {
        throw new Error(
            `${property} must be a positive integer.`
        );
    }

    return value;
}

function getOptionalBoolean(
    body: Record<string, unknown>,
    property: string
): boolean | undefined {
    const value = body[property];

    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    if (typeof value !== "boolean") {
        throw new Error(
            `${property} must be a boolean.`
        );
    }

    return value;
}

function getOptionalDate(
    body: Record<string, unknown>,
    property: string
): Date | undefined {
    const value = body[property];

    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        throw new Error(
            `${property} must be a valid date/time string.`
        );
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(
            `${property} must be a valid date/time string.`
        );
    }

    return date;
}

function parseAssetStatus(
    value: unknown
): AssetStatus {
    const allowed: readonly AssetStatus[] = [
        "ACTIVE",
        "INACTIVE",
        "MAINTENANCE",
        "RETIRED"
    ];

    if (value === undefined) {
        return "ACTIVE";
    }

    if (
        typeof value === "string" &&
        allowed.includes(
            value as AssetStatus
        )
    ) {
        return value as AssetStatus;
    }

    throw new Error(
        "status is not a valid asset status."
    );
}

function parseDeviceStatus(
    value: unknown
): DeviceStatus {
    const allowed: readonly DeviceStatus[] = [
        "ONLINE",
        "OFFLINE",
        "DEGRADED",
        "MAINTENANCE",
        "RETIRED"
    ];

    if (value === undefined) {
        return "ONLINE";
    }

    if (
        typeof value === "string" &&
        allowed.includes(
            value as DeviceStatus
        )
    ) {
        return value as DeviceStatus;
    }

    throw new Error(
        "status is not a valid device status."
    );
}

function parseMeasurementDataType(
    value: unknown
): MeasurementDataType {
    if (
        value === "NUMBER" ||
        value === "BOOLEAN" ||
        value === "STRING"
    ) {
        return value;
    }

    throw new Error(
        "dataType must be NUMBER, BOOLEAN, or STRING."
    );
}

function parseTelemetryQuality(
    value: unknown
): TelemetryQuality {
    if (value === undefined) {
        return "GOOD";
    }

    if (
        value === "GOOD" ||
        value === "UNCERTAIN" ||
        value === "BAD" ||
        value === "MISSING"
    ) {
        return value;
    }

    throw new Error(
        "quality must be GOOD, UNCERTAIN, BAD, or MISSING."
    );
}

function sendNotFound(
    response: Response,
    entityName: string
): void {
    response
        .status(404)
        .json({
            error:
                `${entityName} not found.`
        });
}

function sendConflict(
    response: Response,
    message: string
): void {
    response
        .status(409)
        .json({
            error: message
        });
}

function sendBadRequest(
    response: Response,
    error: unknown
): void {
    response
        .status(400)
        .json({
            error:
                error instanceof Error
                    ? error.message
                    : "Unexpected error."
        });
}