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
import type {
    EnergyFlowDirection
} from "@intrusionshield/energy";
import type {
    AlarmOperator,
    AlarmSeverity
} from "@intrusionshield/energy";
import {
    SqlBasEquipmentCommandRepository
} from "./infrastructure/repositories/BasEquipmentCommandRepository.js";
import {
    SqlTelemetryStoragePolicyRepository,
    type TelemetryStoragePolicyScope
} from "./infrastructure/repositories/TelemetryStoragePolicyRepository.js";
import {
    SqlAlarmRuleRepository
} from "./infrastructure/repositories/AlarmRuleRepository.js";
import {
    SqlAlarmEventRepository
} from "./infrastructure/repositories/AlarmEventRepository.js";
import {
    SqlPerformanceMetricRepository
} from "./infrastructure/repositories/PerformanceMetricRepository.js";
import {
    AlarmEvaluator
} from "./application/AlarmEvaluator.js";
import {
    PerformanceEngine
} from "./application/PerformanceEngine.js";
import {
    SiteEventStream
} from "./application/SiteEventStream.js";
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
    SqlEnergyFlowRepository
} from "./infrastructure/repositories/EnergyFlowRepository.js";
import {
    SqlEnergyContractRepository,
    type EnergyContractStatus,
    type MaintenanceStatus
} from "./infrastructure/repositories/EnergyContractRepository.js";
import {
    SqlTradeResourceRepository,
    type CalendarEntryStatus,
    type CalendarEntryType,
    type SkillProficiency,
    type TradeResourceStatus,
    type TradeResourceType
} from "./infrastructure/repositories/TradeResourceRepository.js";
import {
    requireTenantId,
    tenantContext,
    type TenantRequest
} from "./middleware/tenantContext.js";
export function createApp(
    database: IDatabaseProvider,
    energyDatabase: IDatabaseProvider = database
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
    const energyFlows =
        new SqlEnergyFlowRepository(energyDatabase);
    const alarmRules =
        new SqlAlarmRuleRepository(energyDatabase);
    const alarmEvents =
        new SqlAlarmEventRepository(energyDatabase);
    const performanceMetrics =
        new SqlPerformanceMetricRepository(energyDatabase);
    const performanceEngine =
        new PerformanceEngine(
            energyDatabase,
            performanceMetrics
        );
    const alarmEvaluator =
        new AlarmEvaluator(
            alarmRules,
            alarmEvents
        );
    const liveStream =
        new SiteEventStream();
    const energyContracts =
        new SqlEnergyContractRepository(energyDatabase);

    const tradeResources =
        new SqlTradeResourceRepository(energyDatabase);
    const basCommands =
        new SqlBasEquipmentCommandRepository(energyDatabase);
    const storagePolicies =
        new SqlTelemetryStoragePolicyRepository(database);
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
    app.use(
        "/api/v1/energy",
        tenantContext
    );
    app.get(
        "/api/v1/telemetry/sites/:siteId/stream",
        (
            request: TenantRequest,
            response: Response
        ) => {
            const tenantId =
                requireTenantId(request);
            const siteId = String(
                request.params.siteId ?? ""
            );
            if (!siteId) {
                sendBadRequest(
                    response,
                    new Error("siteId is required.")
                );
                return;
            }
            liveStream.connect({
                tenantId,
                siteId,
                request,
                response
            });
        }
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
    app.get(
        "/api/v1/telemetry/assets",
        async (request: TenantRequest, response: Response) => {
            response.json(await assets.findAll(requireTenantId(request)));
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
    app.get(
        "/api/v1/telemetry/storage-policies/effective",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const tenantId =
                    requireTenantId(request);
                const siteId =
                    getRequiredQueryString(
                        request.query.siteId,
                        "siteId"
                    );
                const deviceId =
                    getRequiredQueryString(
                        request.query.deviceId,
                        "deviceId"
                    );
                const measurementDefinitionId =
                    getRequiredQueryString(
                        request.query.measurementDefinitionId,
                        "measurementDefinitionId"
                    );

                response.json(
                    await storagePolicies.resolve({
                        tenantId,
                        siteId,
                        deviceId,
                        measurementDefinitionId
                    })
                );
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.get(
        "/api/v1/telemetry/storage-policies",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await storagePolicies.list(
                    requireTenantId(request)
                )
            );
        }
    );

    app.get(
        "/api/v1/telemetry/storage-policies/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const policy =
                await storagePolicies.getById(
                    String(request.params.id ?? ""),
                    requireTenantId(request)
                );

            if (!policy) {
                sendNotFound(
                    response,
                    "Telemetry storage policy"
                );
                return;
            }

            response.json(policy);
        }
    );

    app.post(
        "/api/v1/telemetry/storage-policies",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const tenantId =
                    requireTenantId(request);
                const body = getBody(request);

                const policy =
                    await storagePolicies.create({
                        tenantId,
                        scopeType:
                            parseTelemetryStoragePolicyScope(
                                body.scopeType
                            ),
                        siteId:
                            getOptionalString(
                                body,
                                "siteId"
                            ),
                        deviceId:
                            getOptionalString(
                                body,
                                "deviceId"
                            ),
                        measurementDefinitionId:
                            getOptionalString(
                                body,
                                "measurementDefinitionId"
                            ),
                        enabled:
                            getOptionalBoolean(
                                body,
                                "enabled"
                            ) ?? true,
                        storageIntervalSeconds:
                            getRequiredInteger(
                                body,
                                "storageIntervalSeconds"
                            ),
                        createdBy:
                            getRequiredString(
                                body,
                                "createdBy"
                            )
                    });

                response
                    .status(201)
                    .json(policy);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.put(
        "/api/v1/telemetry/storage-policies/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);
                const result =
                    await storagePolicies.update({
                        id: String(
                            request.params.id ?? ""
                        ),
                        tenantId:
                            requireTenantId(request),
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            ),
                        enabled:
                            getRequiredBoolean(
                                body,
                                "enabled"
                            ),
                        storageIntervalSeconds:
                            getRequiredInteger(
                                body,
                                "storageIntervalSeconds"
                            ),
                        updatedBy:
                            getRequiredString(
                                body,
                                "updatedBy"
                            )
                    });

                if (
                    result.outcome ===
                    "NOT_FOUND"
                ) {
                    sendNotFound(
                        response,
                        "Telemetry storage policy"
                    );
                    return;
                }

                if (
                    result.outcome ===
                    "VERSION_CONFLICT"
                ) {
                    sendConflict(
                        response,
                        "Telemetry storage policy was modified by another request. Refresh the policy and retry."
                    );
                    return;
                }

                response.json(result.policy);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.delete(
        "/api/v1/telemetry/storage-policies/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);
                const result =
                    await storagePolicies.delete({
                        id: String(
                            request.params.id ?? ""
                        ),
                        tenantId:
                            requireTenantId(request),
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            )
                    });

                if (
                    result.outcome ===
                    "NOT_FOUND"
                ) {
                    sendNotFound(
                        response,
                        "Telemetry storage policy"
                    );
                    return;
                }

                if (
                    result.outcome ===
                    "VERSION_CONFLICT"
                ) {
                    sendConflict(
                        response,
                        "Telemetry storage policy was modified by another request. Refresh the policy and retry."
                    );
                    return;
                }

                response.status(204).send();
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.get(
        "/api/v1/telemetry/assets/:assetId/latest",
        async (request: TenantRequest, response: Response) => {
            const tenantId = requireTenantId(request);
            const assetId = String(request.params.assetId ?? "");
            const asset = await assets.findById(assetId, tenantId);
            if (!asset) {
                sendNotFound(response, "Asset");
                return;
            }
            const siteDevices = await devices.findBySite(asset.siteId, tenantId);
            const assetDevices = siteDevices.filter(
                (device) => device.assetId?.toLowerCase() === asset.id.toLowerCase()
            );
            const latestByMeasurement = new Map<
                string,
                {
                    reading: (Awaited<ReturnType<typeof readings.byDevice>>)[number];
                    deviceId: string;
                    deviceCode: string;
                    deviceName: string;
                }
            >();
            for (const device of assetDevices) {
                const deviceReadings = await readings.byDevice(
                    asset.siteId,
                    device.id,
                    tenantId
                );
                for (const reading of deviceReadings) {
                    const existing = latestByMeasurement.get(
                        reading.measurementDefinitionId
                    );
                    if (
                        !existing ||
                        reading.observedAt > existing.reading.observedAt
                    ) {
                        latestByMeasurement.set(
                            reading.measurementDefinitionId,
                            {
                                reading,
                                deviceId: device.id,
                                deviceCode: device.code,
                                deviceName: device.name
                            }
                        );
                    }
                }
            }
            response.json({
                asset,
                devices: assetDevices.map((device) => ({
                    id: device.id,
                    code: device.code,
                    name: device.name,
                    deviceType: device.deviceType,
                    status: device.status
                })),
                readings: Array.from(latestByMeasurement.values())
                    .sort(
                        (left, right) =>
                            right.reading.observedAt.getTime() -
                            left.reading.observedAt.getTime()
                    )
                    .map(({ reading, deviceId, deviceCode, deviceName }) => ({
                        ...reading,
                        deviceId,
                        deviceCode,
                        deviceName
                    }))
            });
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
                let measurementCode:
                    string | undefined;
                if (
                    reading.numericValue !== undefined
                ) {
                    const definition =
                        await measurementDefinitions.findById(
                            reading.measurementDefinitionId,
                            reading.tenantId
                        );
                    measurementCode = definition?.code;
                    const device =
                        await devices.findById(
                            reading.deviceId,
                            reading.tenantId
                        );
                    if (definition && device) {
                        await alarmEvaluator.evaluate({
                            tenantId: reading.tenantId,
                            siteId: reading.siteId,
                            assetId: device.assetId,
                            deviceId: reading.deviceId,
                            measurementCode: definition.code,
                            value: reading.numericValue,
                            observedAt: reading.observedAt,
                            source: reading.source
                        });
                    }
                }
                liveStream.publish({
                    tenantId: reading.tenantId,
                    siteId: reading.siteId,
                    type: "telemetry-reading",
                    data: {
                        reading,
                        measurementCode
                    }
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
    app.get(
        "/api/v1/telemetry/sites/:siteId/devices/:deviceId/readings",
        async (request: TenantRequest, response: Response) => {
            const tenantId = requireTenantId(request);
            const siteId = String(request.params.siteId ?? "");
            const deviceId = String(request.params.deviceId ?? "");
            const device = await devices.findById(deviceId, tenantId);
            if (!device || device.siteId.toLowerCase() !== siteId.toLowerCase()) {
                sendNotFound(response, "Device");
                return;
            }
            response.json(await readings.byDevice(siteId, deviceId, tenantId));
        }
    );
    app.post(
        "/api/v1/energy/flows",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);
                const tenantId = requireTenantId(request);
                const siteId = getRequiredString(body, "siteId");
                const sourceAssetId =
                    getOptionalString(body, "sourceAssetId");
                const destinationAssetId =
                    getOptionalString(body, "destinationAssetId");
                await validateEnergyFlowAsset(
                    assets,
                    sourceAssetId,
                    siteId,
                    tenantId,
                    "sourceAssetId"
                );
                await validateEnergyFlowAsset(
                    assets,
                    destinationAssetId,
                    siteId,
                    tenantId,
                    "destinationAssetId"
                );
                const flow =
                    await energyFlows.create({
                        tenantId,
                        siteId,
                        sourceAssetId,
                        destinationAssetId,
                        direction:
                            parseEnergyFlowDirection(
                                body.direction
                            ),
                        powerKw:
                            getRequiredNumber(
                                body,
                                "powerKw"
                            ),
                        energyKwh:
                            getOptionalNumber(
                                body,
                                "energyKwh"
                            ),
                        observedAt:
                            getRequiredDate(
                                body,
                                "observedAt"
                            ),
                        source:
                            getRequiredString(
                                body,
                                "source"
                            )
                    });
                liveStream.publish({
                    tenantId: flow.tenantId,
                    siteId: flow.siteId,
                    type: "energy-flow",
                    data: flow
                });
                response
                    .status(201)
                    .json(flow);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );
    app.get(
        "/api/v1/energy/flows/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const flow =
                await energyFlows.findById(
                    String(
                        request.params.id ?? ""
                    ),
                    requireTenantId(request)
                );
            if (!flow) {
                sendNotFound(
                    response,
                    "Energy flow"
                );
                return;
            }
            response.json(flow);
        }
    );
    app.get(
        "/api/v1/energy/sites/:siteId/flows",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const limit =
                    getOptionalPositiveIntegerQuery(
                        request.query.limit,
                        "limit",
                        100,
                        1000
                    );
                response.json(
                    await energyFlows.findBySite(
                        String(
                            request.params.siteId ?? ""
                        ),
                        requireTenantId(request),
                        limit
                    )
                );
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );
    app.post(
        "/api/v1/energy/alarm-rules",
        async (request: TenantRequest, response: Response) => {
            try {
                const body = getBody(request);
                const rule = await alarmRules.create({
                    tenantId: requireTenantId(request),
                    siteId: getOptionalString(body, "siteId"),
                    measurementCode: getRequiredString(body, "measurementCode"),
                    name: getRequiredString(body, "name"),
                    description: getOptionalString(body, "description"),
                    operator: parseAlarmOperator(body.operator),
                    threshold: getRequiredNumber(body, "threshold"),
                    severity: parseAlarmSeverity(body.severity),
                    enabled: getOptionalBoolean(body, "enabled") ?? true,
                    durationSeconds: getOptionalNonNegativeInteger(body, "durationSeconds") ?? 0
                });
                response.status(201).json(rule);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.get(
        "/api/v1/energy/sites/:siteId/alarm-rules",
        async (request: TenantRequest, response: Response) => {
            response.json(await alarmRules.findBySite(
                requireTenantId(request),
                String(request.params.siteId ?? "")
            ));
        }
    );
    app.get(
        "/api/v1/energy/sites/:siteId/alarm-events",
        async (request: TenantRequest, response: Response) => {
            response.json(await alarmEvents.findBySite(
                requireTenantId(request),
                String(request.params.siteId ?? "")
            ));
        }
    );
    app.post(
        "/api/v1/energy/alarm-events/:id/acknowledge",
        async (request: TenantRequest, response: Response) => {
            try {
                const event = await alarmEvents.acknowledge(
                    String(request.params.id ?? ""),
                    requireTenantId(request),
                    getRequiredString(getBody(request), "acknowledgedBy")
                );
                if (!event) {
                    sendNotFound(response, "Alarm event");
                    return;
                }
                response.json(event);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.post(
        "/api/v1/energy/alarm-events/:id/resolve",
        async (request: TenantRequest, response: Response) => {
            try {
                const event = await alarmEvents.resolve(
                    String(request.params.id ?? ""),
                    requireTenantId(request),
                    getRequiredString(getBody(request), "resolvedBy")
                );
                if (!event) {
                    sendNotFound(response, "Alarm event");
                    return;
                }
                response.json(event);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.post(
        "/api/v1/energy/sites/:siteId/performance/calculate",
        async (request: TenantRequest, response: Response) => {
            try {
                const body = getBody(request);
                const metrics = await performanceEngine.calculate({
                    tenantId: requireTenantId(request),
                    siteId: String(request.params.siteId ?? ""),
                    periodStart: getRequiredDate(body, "periodStart"),
                    periodEnd: getRequiredDate(body, "periodEnd")
                });
                response.status(201).json(metrics);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.post(
        "/api/v1/energy/performance-metrics",
        async (request: TenantRequest, response: Response) => {
            try {
                const body = getBody(request);
                const metric = await performanceMetrics.create({
                    tenantId: requireTenantId(request),
                    siteId: getRequiredString(body, "siteId"),
                    assetId: getOptionalString(body, "assetId"),
                    metricCode: getRequiredString(body, "metricCode"),
                    value: getRequiredNumber(body, "value"),
                    unit: getOptionalString(body, "unit"),
                    periodStart: getRequiredDate(body, "periodStart"),
                    periodEnd: getRequiredDate(body, "periodEnd"),
                    source: getRequiredString(body, "source")
                });
                response.status(201).json(metric);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.get(
        "/api/v1/energy/sites/:siteId/performance-metrics",
        async (request: TenantRequest, response: Response) => {
            response.json(await performanceMetrics.findBySite(
                requireTenantId(request),
                String(request.params.siteId ?? ""),
                getOptionalPositiveIntegerQuery(request.query.limit, "limit", 100, 1000)
            ));
        }
    );
    app.get("/api/v1/energy/contracts", async (request: TenantRequest, response: Response) => {
        response.json(await energyContracts.findAll(requireTenantId(request)));
    });
    app.get("/api/v1/energy/contracts/:id", async (request: TenantRequest, response: Response) => {
        const contract = await energyContracts.findById(String(request.params.id ?? ""), requireTenantId(request));
        if (!contract) { sendNotFound(response, "Energy contract"); return; }
        response.json(contract);
    });
    app.post("/api/v1/energy/contracts", async (request: TenantRequest, response: Response) => {
        try {
            const body=getBody(request);
            const contract=await energyContracts.create({
                tenantId:requireTenantId(request), contractNumber:getRequiredString(body,"contractNumber"),
                name:getRequiredString(body,"name"), vendorName:getRequiredString(body,"vendorName"),
                contractType:getRequiredString(body,"contractType"), siteId:getOptionalString(body,"siteId"),
                owner:getOptionalString(body,"owner"), startDate:getRequiredDate(body,"startDate"), endDate:getRequiredDate(body,"endDate"),
                renewalDate:getOptionalDate(body,"renewalDate"), noticeDate:getOptionalDate(body,"noticeDate"),
                valueAmount:getOptionalNumber(body,"valueAmount"), currency:getOptionalString(body,"currency"),
                rateDescription:getOptionalString(body,"rateDescription"), status:parseEnergyContractStatus(body.status),
                description:getOptionalString(body,"description"), notes:getOptionalString(body,"notes")
            });
            response.status(201).json(contract);
        } catch(error){ sendBadRequest(response,error); }
    });
    app.get("/api/v1/energy/contracts/:id/coverage", async (request: TenantRequest, response: Response) => {
        const tenantId=requireTenantId(request); const contractId=String(request.params.id ?? "");
        if (!await energyContracts.findById(contractId,tenantId)){sendNotFound(response,"Energy contract");return;}
        response.json(await energyContracts.findCoverage(contractId,tenantId));
    });
    app.post("/api/v1/energy/contracts/:id/coverage", async (request: TenantRequest, response: Response) => {
        try {
            const tenantId=requireTenantId(request); const contractId=String(request.params.id ?? "");
            if (!await energyContracts.findById(contractId,tenantId)){sendNotFound(response,"Energy contract");return;}
            const body=getBody(request);
            const assetId=getOptionalString(body,"assetId"); const siteId=getOptionalString(body,"siteId");
            if (!assetId && !siteId) throw new Error("assetId or siteId is required.");
            if (assetId && !await assets.findById(assetId,tenantId)) throw new Error("assetId does not identify an asset for this tenant.");
            const item=await energyContracts.addCoverage({tenantId,contractId,assetId,siteId});
            response.status(201).json(item);
        } catch(error){sendBadRequest(response,error);}
    });
    app.get("/api/v1/energy/contracts/:id/maintenance", async (request: TenantRequest, response: Response) => {
        const tenantId=requireTenantId(request); const contractId=String(request.params.id ?? "");
        if (!await energyContracts.findById(contractId,tenantId)){sendNotFound(response,"Energy contract");return;}
        response.json(await energyContracts.findMaintenance(contractId,tenantId));
    });
    app.post("/api/v1/energy/contracts/:id/maintenance", async (request: TenantRequest, response: Response) => {
        try {
            const tenantId=requireTenantId(request); const contractId=String(request.params.id ?? "");
            if (!await energyContracts.findById(contractId,tenantId)){sendNotFound(response,"Energy contract");return;}
            const body=getBody(request);
            const item=await energyContracts.createMaintenance({tenantId,contractId,assetId:getOptionalString(body,"assetId"),
                activity:getRequiredString(body,"activity"),frequency:getOptionalString(body,"frequency"),
                nextDueDate:getOptionalDate(body,"nextDueDate"),responsibleParty:getOptionalString(body,"responsibleParty"),
                sla:getOptionalString(body,"sla"),status:parseMaintenanceStatus(body.status),lastCompletedAt:getOptionalDate(body,"lastCompletedAt"),notes:getOptionalString(body,"notes")});
            response.status(201).json(item);
        } catch(error){sendBadRequest(response,error);}
    });

    /*
     * Ruby Trade Resources / Workforce
     */

    app.get(
        "/api/v1/energy/skills",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await tradeResources.findSkills(
                    requireTenantId(request)
                )
            );
        }
    );

    app.get(
        "/api/v1/energy/trade-resources",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            response.json(
                await tradeResources.findAll(
                    requireTenantId(request)
                )
            );
        }
    );

    app.get(
        "/api/v1/energy/trade-resources/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const resource =
                await tradeResources.findById(
                    String(request.params.id ?? ""),
                    requireTenantId(request)
                );

            if (!resource) {
                sendNotFound(
                    response,
                    "Trade resource"
                );
                return;
            }

            response.json(resource);
        }
    );

    app.put(
        "/api/v1/energy/trade-resources/:id",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const tenantId =
                    requireTenantId(request);

                const id =
                    String(request.params.id ?? "");

                const existing =
                    await tradeResources.findById(
                        id,
                        tenantId
                    );

                if (!existing) {
                    sendNotFound(
                        response,
                        "Trade resource"
                    );
                    return;
                }

                const body = getBody(request);

                const resource =
                    await tradeResources.update({
                        tenantId,
                        id,
                        resourceNumber:
                            getRequiredString(body, "resourceNumber"),
                        firstName:
                            getRequiredString(body, "firstName"),
                        lastName:
                            getRequiredString(body, "lastName"),
                        trade:
                            getRequiredString(body, "trade"),
                        resourceType:
                            parseTradeResourceType(body.resourceType),
                        employerName:
                            getOptionalString(body, "employerName"),
                        email:
                            getOptionalString(body, "email"),
                        phone:
                            getOptionalString(body, "phone"),
                        serviceRegion:
                            getOptionalString(body, "serviceRegion"),
                        hourlyRate:
                            getOptionalNumber(body, "hourlyRate"),
                        currency:
                            getOptionalString(body, "currency"),
                        status:
                            parseTradeResourceStatus(body.status),
                        notes:
                            getOptionalString(body, "notes"),
                        version:
                            getRequiredInteger(body, "version")
                    });

                response.json(resource);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.post(
        "/api/v1/energy/trade-resources",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const resource =
                    await tradeResources.create({
                        tenantId:
                            requireTenantId(request),

                                    resourceNumber:
                            getRequiredString(
                                body,
                                "resourceNumber"
                            ),

                        firstName:
                            getRequiredString(
                                body,
                                "firstName"
                            ),

                        lastName:
                            getRequiredString(
                                body,
                                "lastName"
                            ),

                        trade:
                            getRequiredString(
                                body,
                                "trade"
                            ),

                        resourceType:
                            parseTradeResourceType(
                                body.resourceType
                            ),

                        employerName:
                            getOptionalString(
                                body,
                                "employerName"
                            ),

                        email:
                            getOptionalString(
                                body,
                                "email"
                            ),

                        phone:
                            getOptionalString(
                                body,
                                "phone"
                            ),

                        serviceRegion:
                            getOptionalString(
                                body,
                                "serviceRegion"
                            ),

                        hourlyRate:
                            getOptionalNumber(
                                body,
                                "hourlyRate"
                            ),

                        currency:
                            getOptionalString(
                                body,
                                "currency"
                            ),

                        status:
                            parseTradeResourceStatus(
                                body.status
                            ),

                        notes:
                            getOptionalString(
                                body,
                                "notes"
                            )
                    });

                response
                    .status(201)
                    .json(resource);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.post(
        "/api/v1/energy/trade-resources/:id/skills",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const item =
                    await tradeResources.assignSkill({
                        tenantId:
                            requireTenantId(request),

                        resourceId:
                            String(
                                request.params.id ??
                                ""
                            ),

                        skillId:
                            getRequiredString(
                                body,
                                "skillId"
                            ),

                        proficiency:
                            parseSkillProficiency(
                                body.proficiency
                            ),

                        certificationName:
                            getOptionalString(
                                body,
                                "certificationName"
                            ),

                        certificationNumber:
                            getOptionalString(
                                body,
                                "certificationNumber"
                            ),

                        certificationExpiresAt:
                            getOptionalDate(
                                body,
                                "certificationExpiresAt"
                            ),

                        notes:
                            getOptionalString(
                                body,
                                "notes"
                            )
                    });

                response
                    .status(201)
                    .json(item);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.delete(
        "/api/v1/energy/trade-resources/:id/skills/:skillId",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const tenantId =
                    requireTenantId(request);

                const resourceId =
                    String(request.params.id ?? "");

                const skillId =
                    String(request.params.skillId ?? "");

                const resource =
                    await tradeResources.findById(
                        resourceId,
                        tenantId
                    );

                if (!resource) {
                    sendNotFound(
                        response,
                        "Trade resource"
                    );
                    return;
                }

                await tradeResources.removeSkill(
                    resourceId,
                    skillId,
                    tenantId
                );

                response.status(204).send();
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    app.get(
        "/api/v1/energy/trade-resources/:id/calendar",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            const tenantId =
                requireTenantId(request);

            const resourceId =
                String(
                    request.params.id ?? ""
                );

            const resource =
                await tradeResources.findById(
                    resourceId,
                    tenantId
                );

            if (!resource) {
                sendNotFound(
                    response,
                    "Trade resource"
                );
                return;
            }

            response.json(
                await tradeResources.findCalendar(
                    resourceId,
                    tenantId
                )
            );
        }
    );

    app.get(
        "/api/v1/energy/trade-resources/:id/availability",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const startValue =
                    request.query.startAt;

                const endValue =
                    request.query.endAt;

                if (
                    typeof startValue !== "string" ||
                    !startValue.trim()
                ) {
                    throw new Error(
                        "startAt is required."
                    );
                }

                if (
                    typeof endValue !== "string" ||
                    !endValue.trim()
                ) {
                    throw new Error(
                        "endAt is required."
                    );
                }

                const startAt =
                    new Date(startValue);

                const endAt =
                    new Date(endValue);

                if (
                    Number.isNaN(
                        startAt.getTime()
                    )
                ) {
                    throw new Error(
                        "startAt must be a valid date/time."
                    );
                }

                if (
                    Number.isNaN(
                        endAt.getTime()
                    )
                ) {
                    throw new Error(
                        "endAt must be a valid date/time."
                    );
                }

                response.json(
                    await tradeResources.checkAvailability(
                        String(
                            request.params.id ??
                            ""
                        ),
                        requireTenantId(request),
                        startAt,
                        endAt
                    )
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
        "/api/v1/energy/bas/commands",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId = requireTenantId(request);

                const siteId =
                    typeof request.query.siteId === "string"
                        ? request.query.siteId.trim()
                        : "";

                const deviceId =
                    typeof request.query.deviceId === "string"
                        ? request.query.deviceId.trim()
                        : "";

                const status =
                    typeof request.query.status === "string"
                        ? request.query.status.trim().toUpperCase()
                        : "";

                let commands;

                if (status === "PENDING") {
                    if (siteId) {
                        commands =
                            await basCommands.findPendingBySite(
                                siteId,
                                tenantId
                            );
                    } else if (deviceId) {
                        const device =
                            await devices.findById(
                                deviceId,
                                tenantId
                            );

                        if (!device) {
                            throw new Error(
                                "deviceId does not identify a device for this tenant."
                            );
                        }

                        commands =
                            await basCommands.findPendingBySite(
                                device.siteId,
                                tenantId
                            );
                    } else {
                        throw new Error(
                            "siteId or deviceId is required when requesting pending BAS commands."
                        );
                    }
                } else {
                    if (!siteId) {
                        throw new Error(
                            "siteId is required when requesting BAS command history."
                        );
                    }

                    commands =
                        await basCommands.findBySite(
                            siteId,
                            tenantId
                        );
                }

                const filtered =
                    deviceId
                        ? commands.filter(
                              command =>
                                  command.deviceId === deviceId
                          )
                        : commands;

                response.json(filtered);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    const sendBasCommandUpdate =
        (
            response: Response,
            result: Awaited<
                ReturnType<
                    typeof basCommands.accept
                >
            >
        ): void => {
            switch (result.status) {
                case "UPDATED":
                    response.json(result.command);
                    return;

                case "NOT_FOUND":
                    response
                        .status(404)
                        .json({
                            error:
                                "BAS equipment command was not found."
                        });
                    return;

                case "CONFLICT":
                    response
                        .status(409)
                        .json({
                            error:
                                "BAS equipment command version conflict."
                        });
                    return;

                case "INVALID_STATE":
                    response
                        .status(409)
                        .json({
                            error:
                                "BAS equipment command is not in a valid state for this transition.",
                            command:
                                result.command
                        });
                    return;
            }
        };

    app.post(
        "/api/v1/energy/bas/commands/:id/accept",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId = requireTenantId(request);
                const body = getBody(request);

                const result =
                    await basCommands.accept({
                        id: String(request.params.id ?? ""),
                        tenantId,
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            )
                    });

                sendBasCommandUpdate(
                    response,
                    result
                );
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.post(
        "/api/v1/energy/bas/commands/:id/execute",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId = requireTenantId(request);
                const body = getBody(request);

                const result =
                    await basCommands.execute({
                        id: String(request.params.id ?? ""),
                        tenantId,
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            )
                    });

                sendBasCommandUpdate(
                    response,
                    result
                );
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );

    app.post(
        "/api/v1/energy/bas/commands/:id/verify",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId =
                    requireTenantId(request);

                const body =
                    getBody(request);

                const result =
                    await basCommands.verify({
                        id:
                            String(
                                request.params.id ??
                                ""
                            ),
                        tenantId,
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            )
                    });

                sendBasCommandUpdate(
                    response,
                    result
                );
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );
    
    app.post(
        "/api/v1/energy/bas/commands/:id/fail",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId = requireTenantId(request);
                const body = getBody(request);

                const result =
                    await basCommands.fail({
                        id: String(request.params.id ?? ""),
                        tenantId,
                        version:
                            getRequiredInteger(
                                body,
                                "version"
                            ),
                        failureCode:
                            getOptionalString(
                                body,
                                "failureCode"
                            ),
                        failureMessage:
                            getOptionalString(
                                body,
                                "failureMessage"
                            )
                    });

                sendBasCommandUpdate(
                    response,
                    result
                );
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.post(
        "/api/v1/energy/bas/commands",
        async (request: TenantRequest, response: Response) => {
            try {
                const tenantId = requireTenantId(request);
                const body = getBody(request);

                const siteId = getRequiredString(body, "siteId");
                const assetId = getOptionalString(body, "assetId");
                const deviceId = getOptionalString(body, "deviceId");

                if (!await sites.findById(siteId, tenantId)) {
                    throw new Error(
                        "siteId does not identify a site for this tenant."
                    );
                }

                if (assetId && !await assets.findById(assetId, tenantId)) {
                    throw new Error(
                        "assetId does not identify an asset for this tenant."
                    );
                }

                if (deviceId && !await devices.findById(deviceId, tenantId)) {
                    throw new Error(
                        "deviceId does not identify a device for this tenant."
                    );
                }

                const command = await basCommands.create({
                    tenantId,
                    siteId,
                    assetId,
                    deviceId,
                    commandType: getRequiredString(body, "commandType"),
                    commandPayload:
                        typeof body.commandPayload === "object" &&
                        body.commandPayload !== null &&
                        !Array.isArray(body.commandPayload)
                            ? body.commandPayload as Record<string, unknown>
                            : (() => {
                                throw new Error("commandPayload must be a JSON object.");
                            })(),
                    requestedBy: getOptionalString(body, "requestedBy"),
                    correlationId: getOptionalString(body, "correlationId")
                });

                response.status(201).json(command);
            } catch (error) {
                sendBadRequest(response, error);
            }
        }
    );
    app.post(
        "/api/v1/energy/trade-resources/:id/calendar",
        async (
            request: TenantRequest,
            response: Response
        ) => {
            try {
                const body = getBody(request);

                const item =
                    await tradeResources.createCalendarEntry({
                        tenantId:
                            requireTenantId(request),

                        resourceId:
                            String(
                                request.params.id ??
                                ""
                            ),

                        maintenanceActivityId:
                            getOptionalString(
                                body,
                                "maintenanceActivityId"
                            ),

                        entryType:
                            parseCalendarEntryType(
                                body.entryType
                            ),

                        title:
                            getRequiredString(
                                body,
                                "title"
                            ),

                        startAt:
                            getRequiredDate(
                                body,
                                "startAt"
                            ),

                        endAt:
                            getRequiredDate(
                                body,
                                "endAt"
                            ),

                        status:
                            parseCalendarEntryStatus(
                                body.status
                            ),

                        notes:
                            getOptionalString(
                                body,
                                "notes"
                            )
                    });

                response
                    .status(201)
                    .json(item);
            } catch (error) {
                sendBadRequest(
                    response,
                    error
                );
            }
        }
    );

    return app;
}
function parseTelemetryStoragePolicyScope(
    value: unknown
): TelemetryStoragePolicyScope {
    if (
        value === "TENANT" ||
        value === "SITE" ||
        value === "DEVICE" ||
        value === "MEASUREMENT"
    ) {
        return value;
    }

    throw new Error(
        "scopeType must be TENANT, SITE, DEVICE, or MEASUREMENT."
    );
}

function getRequiredQueryString(
    value: unknown,
    property: string
): string {
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

function getRequiredBoolean(
    body: Record<string, unknown>,
    property: string
): boolean {
    const value = body[property];

    if (typeof value !== "boolean") {
        throw new Error(
            `${property} must be a boolean.`
        );
    }

    return value;
}

function parseEnergyContractStatus(value: unknown): EnergyContractStatus {
    if (value === undefined || value === null) return "ACTIVE";
    if (value === "DRAFT" || value === "ACTIVE" || value === "EXPIRING" || value === "EXPIRED" || value === "TERMINATED") return value;
    throw new Error("status must be DRAFT, ACTIVE, EXPIRING, EXPIRED, or TERMINATED.");
}
function parseMaintenanceStatus(value: unknown): MaintenanceStatus {
    if (value === undefined || value === null) return "UPCOMING";
    if (value === "UPCOMING" || value === "DUE" || value === "OVERDUE" || value === "COMPLETED") return value;
    throw new Error("status must be UPCOMING, DUE, OVERDUE, or COMPLETED.");
}
function getOptionalNonNegativeInteger(
    body: Record<string, unknown>,
    property: string
): number | undefined {
    const value = body[property];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        throw new Error(`${property} must be a non-negative integer.`);
    }
    return value;
}
function parseAlarmOperator(value: unknown): AlarmOperator {
    if (
        value === "GT" || value === "GTE" || value === "LT" ||
        value === "LTE" || value === "EQ" || value === "NEQ"
    ) return value;
    throw new Error("operator must be GT, GTE, LT, LTE, EQ, or NEQ.");
}
function parseAlarmSeverity(value: unknown): AlarmSeverity {
    if (value === "INFO" || value === "WARNING" || value === "CRITICAL") {
        return value;
    }
    throw new Error("severity must be INFO, WARNING, or CRITICAL.");
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
function getRequiredNumber(
    body: Record<string, unknown>,
    property: string
): number {
    const value = body[property];
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
function getRequiredDate(
    body: Record<string, unknown>,
    property: string
): Date {
    const value =
        getRequiredString(
            body,
            property
        );
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(
            `${property} must be a valid date/time string.`
        );
    }
    return date;
}
function getOptionalPositiveIntegerQuery(
    value: unknown,
    property: string,
    defaultValue: number,
    maximum: number
): number {
    if (value === undefined) {
        return defaultValue;
    }
    if (
        typeof value !== "string" ||
        !/^\d+$/.test(value)
    ) {
        throw new Error(
            `${property} must be a positive integer.`
        );
    }
    const parsed = Number(value);
    if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > maximum
    ) {
        throw new Error(
            `${property} must be between 1 and ${maximum}.`
        );
    }
    return parsed;
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
function parseEnergyFlowDirection(
    value: unknown
): EnergyFlowDirection {
    const allowed:
        readonly EnergyFlowDirection[] = [
            "PRODUCTION",
            "CONSUMPTION",
            "IMPORT",
            "EXPORT",
            "CHARGE",
            "DISCHARGE",
            "TRANSFER"
        ];
    if (
        typeof value === "string" &&
        allowed.includes(
            value as EnergyFlowDirection
        )
    ) {
        return value as EnergyFlowDirection;
    }
    throw new Error(
        "direction must be PRODUCTION, CONSUMPTION, IMPORT, EXPORT, CHARGE, DISCHARGE, or TRANSFER."
    );
}
async function validateEnergyFlowAsset(
    assets: SqlAssetRepository,
    assetId: string | undefined,
    siteId: string,
    tenantId: string,
    property: string
): Promise<void> {
    if (!assetId) {
        return;
    }
    const asset =
        await assets.findById(
            assetId,
            tenantId
        );
    if (
        !asset ||
        asset.siteId !== siteId
    ) {
        throw new Error(
            `${property} must identify an asset in the same tenant and site as the energy flow.`
        );
    }
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




function parseTradeResourceType(
    value: unknown
): TradeResourceType {
    if (
        value === "EMPLOYEE" ||
        value === "VENDOR" ||
        value === "CONTRACTOR"
    ) {
        return value;
    }

    throw new Error(
        "resourceType must be EMPLOYEE, VENDOR, or CONTRACTOR."
    );
}

function parseTradeResourceStatus(
    value: unknown
): TradeResourceStatus {
    if (
        value === undefined ||
        value === null
    ) {
        return "ACTIVE";
    }

    if (
        value === "ACTIVE" ||
        value === "INACTIVE"
    ) {
        return value;
    }

    throw new Error(
        "status must be ACTIVE or INACTIVE."
    );
}

function parseSkillProficiency(
    value: unknown
): SkillProficiency | undefined {
    if (
        value === undefined ||
        value === null
    ) {
        return undefined;
    }

    if (
        value === "APPRENTICE" ||
        value === "QUALIFIED" ||
        value === "EXPERT"
    ) {
        return value;
    }

    throw new Error(
        "proficiency must be APPRENTICE, QUALIFIED, or EXPERT."
    );
}

function parseCalendarEntryType(
    value: unknown
): CalendarEntryType {
    if (
        value === "MAINTENANCE" ||
        value === "WORK_ORDER" ||
        value === "INSPECTION" ||
        value === "UNAVAILABLE" ||
        value === "OTHER"
    ) {
        return value;
    }

    throw new Error(
        "entryType must be MAINTENANCE, WORK_ORDER, INSPECTION, UNAVAILABLE, or OTHER."
    );
}

function parseCalendarEntryStatus(
    value: unknown
): CalendarEntryStatus {
    if (
        value === undefined ||
        value === null
    ) {
        return "CONFIRMED";
    }

    if (
        value === "TENTATIVE" ||
        value === "CONFIRMED" ||
        value === "COMPLETED" ||
        value === "CANCELLED"
    ) {
        return value;
    }

    throw new Error(
        "status must be TENTATIVE, CONFIRMED, COMPLETED, or CANCELLED."
    );
}

