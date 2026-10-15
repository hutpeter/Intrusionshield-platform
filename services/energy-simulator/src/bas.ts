/** BAS phase 1: simulated single-zone HVAC telemetry and command execution. */

const baseUrl =
    process.env.TELEMETRY_ENERGY_BASE_URL ??
    "http://localhost:4401";

const tenantId =
    process.env.SIMULATOR_TENANT_ID ??
    "73c28616-633a-46b5-bd4d-2ad7971af02c";

const siteId =
    process.env.SIMULATOR_SITE_ID ??
    "138c8b96-04ae-402d-93f9-89b3677734e1";

const intervalMs =
    positive(process.env.BAS_INTERVAL_MS, 5000);

const stepMinutes =
    positive(process.env.BAS_STEP_MINUTES, 5);

const commandPollMs =
    positive(process.env.BAS_COMMAND_POLL_MS, 2000);

const deviceCode =
    process.env.BAS_DEVICE_CODE ??
    "HVAC-COMM-44092";

const defaultSetpointF =
    positive(
        process.env.BAS_DEFAULT_SETPOINT_F,
        72
    );

type RecordWithId = {
    id: string;
    code: string;
};

type State =
    | "COOLING"
    | "OFF";

interface Zone {
    temperatureF: number;
    setpointF: number;
    humidity: number;
    state: State;
    time: Date;
}

interface BasCommand {
    id: string;
    tenantId: string;
    siteId: string;
    assetId?: string;
    deviceId?: string;
    commandType: string;
    commandPayload: Record<string, unknown>;
    status:
        | "PENDING"
        | "ACCEPTED"
        | "EXECUTED"
        | "VERIFIED"
        | "FAILED";
    version: number;
}

interface PendingVerification {
    commandId: string;
    version: number;
    expectedSetpointF: number;
}

interface ProcessCommandsResult {
    zone: Zone;
    pendingVerification?: PendingVerification;
}

async function request<T>(
    path: string,
    method: "GET" | "POST" | "PATCH" = "GET",
    body?: object
): Promise<T> {
    const response =
        await fetch(
            `${baseUrl}${path}`,
            {
                method,
                headers: {
                    "x-tenant-id":
                        tenantId,
                    "Content-Type":
                        "application/json"
                },
                body:
                    body !== undefined
                        ? JSON.stringify(body)
                        : undefined
            }
        );

    const value =
        await response.text();

    if (!response.ok) {
        throw new Error(
            `${method} ${path}: ${response.status} ${value}`
        );
    }

    return value
        ? JSON.parse(value) as T
        : undefined as T;
}

async function ensure<T extends RecordWithId>(
    list: T[],
    code: string,
    endpoint: string,
    body: object
): Promise<T> {
    const found =
        list.find(
            item =>
                item.code === code
        );

    if (found) {
        return found;
    }

    const created =
        await request<T>(
            endpoint,
            "POST",
            {
                code,
                ...body
            }
        );

    list.push(created);

    return created;
}

function positive(
    raw: string | undefined,
    fallback: number
): number {
    const value =
        raw === undefined
            ? fallback
            : Number(raw);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        throw new Error(
            "BAS cadence and numeric settings must be positive numbers."
        );
    }

    return value;
}

function round(
    value: number
): number {
    return Math.round(
        value * 100
    ) / 100;
}

/**
 * Supports both:
 *
 * { setpointF: 72 }
 *
 * and:
 *
 * { setpoint: 72, unit: "F" }
 *
 * The latter is deliberately more extensible for future
 * Celsius and other engineering-unit commands.
 */
function getCommandSetpoint(
    command: BasCommand
): number {
    const payload =
        command.commandPayload;

    let rawSetpoint:
        | unknown
        | undefined;

    let unit:
        | unknown
        | undefined;

    if (
        Object.prototype.hasOwnProperty.call(
            payload,
            "setpointF"
        )
    ) {
        rawSetpoint =
            payload.setpointF;

        unit = "F";
    } else if (
        Object.prototype.hasOwnProperty.call(
            payload,
            "setpoint"
        )
    ) {
        rawSetpoint =
            payload.setpoint;

        unit =
            payload.unit;
    }

    const value =
        typeof rawSetpoint === "number"
            ? rawSetpoint
            : Number(rawSetpoint);

    if (
        !Number.isFinite(value)
    ) {
        throw new Error(
            "SET_TEMPERATURE requires a numeric setpoint."
        );
    }

    if (
        typeof unit !== "string" ||
        unit.trim().toUpperCase() !== "F"
    ) {
        throw new Error(
            "SET_TEMPERATURE currently requires unit F."
        );
    }

    if (
        value < 60 ||
        value > 85
    ) {
        throw new Error(
            "SET_TEMPERATURE setpoint must be between 60 and 85 F."
        );
    }

    return value;
}

export function advance(
    zone: Zone,
    minutes: number
): Zone {
    const deadband =
        0.5;

    let state: State;

    if (
        zone.state ===
        "COOLING"
    ) {
        state =
            zone.temperatureF <=
            zone.setpointF +
                deadband
                ? "OFF"
                : "COOLING";
    } else {
        state =
            zone.temperatureF >=
            zone.setpointF +
                deadband
                ? "COOLING"
                : "OFF";
    }

    const hours =
        minutes / 60;

    const temperatureF =
        Math.max(
            65,
            Math.min(
                85,
                zone.temperatureF +
                    (
                        state ===
                        "COOLING"
                            ? -1.9
                            : 1.15
                    ) *
                    hours
            )
        );

    const humidity =
        Math.max(
            25,
            Math.min(
                70,
                zone.humidity +
                    (
                        state ===
                        "COOLING"
                            ? -2.3
                            : 0.85
                    ) *
                    hours
            )
        );

    return {
        temperatureF,
        setpointF:
            zone.setpointF,
        humidity,
        state,
        time:
            new Date(
                zone.time.getTime() +
                minutes * 60000
            )
    };
}

async function findPendingCommands(
    deviceId: string,
    assetId: string
): Promise<BasCommand[]> {
    const commands =
        await request<BasCommand[]>(
            `/api/v1/energy/bas/commands?siteId=${encodeURIComponent(siteId)}`
        );

    const normalizedDeviceId =
        deviceId.toLowerCase();

    const normalizedAssetId =
        assetId.toLowerCase();

    return commands.filter(
        command => {
            if (
                command.status !==
                "PENDING"
            ) {
                return false;
            }

            const targetsDevice =
                command.deviceId
                    ?.toLowerCase() ===
                normalizedDeviceId;

            const targetsAsset =
                command.assetId
                    ?.toLowerCase() ===
                normalizedAssetId;

            return (
                targetsDevice ||
                targetsAsset
            );
        }
    );
}

async function acceptCommand(
    commandId: string,
    version: number
): Promise<BasCommand> {
    return request<BasCommand>(
        `/api/v1/energy/bas/commands/${commandId}/accept`,
        "POST",
        {
            version
        }
    );
}

async function executeCommand(
    commandId: string,
    version: number
): Promise<BasCommand> {
    return request<BasCommand>(
        `/api/v1/energy/bas/commands/${commandId}/execute`,
        "POST",
        {
            version
        }
    );
}

async function verifyCommand(
    commandId: string,
    version: number
): Promise<BasCommand> {
    return request<BasCommand>(
        `/api/v1/energy/bas/commands/${commandId}/verify`,
        "POST",
        {
            version
        }
    );
}

async function failCommand(
    commandId: string,
    version: number,
    failureMessage: string
): Promise<BasCommand> {
    return request<BasCommand>(
        `/api/v1/energy/bas/commands/${commandId}/fail`,
        "POST",
        {
            version,
            failureCode:
                "SIMULATOR_COMMAND_FAILURE",
            failureMessage
        }
    );
}

async function processCommands(
    deviceId: string,
    assetId: string,
    zone: Zone
): Promise<ProcessCommandsResult> {
    const commands =
        await findPendingCommands(
            deviceId,
            assetId
        );

    let currentZone =
        zone;

    for (
        const command of commands
    ) {
        let currentVersion =
            command.version;

        let executedSuccessfully =
            false;

        try {
            if (
                command.commandType !==
                "SET_TEMPERATURE"
            ) {
                await failCommand(
                    command.id,
                    currentVersion,
                    `Unsupported BAS command type: ${command.commandType}`
                );

                continue;
            }

            const accepted =
                await acceptCommand(
                    command.id,
                    currentVersion
                );

            currentVersion =
                accepted.version;

            const setpointF =
                getCommandSetpoint(
                    command
                );

            currentZone = {
                ...currentZone,
                setpointF
            };

            const executed =
                await executeCommand(
                    command.id,
                    currentVersion
                );

            currentVersion =
                executed.version;

            executedSuccessfully =
                true;

            console.log(
                `BAS command executed: ${command.id} ` +
                `SET_TEMPERATURE ${setpointF} F`
            );

            return {
                zone:
                    currentZone,
                pendingVerification: {
                    commandId:
                        command.id,
                    version:
                        executed.version,
                    expectedSetpointF:
                        setpointF
                }
            };
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            console.error(
                `BAS command failed: ${command.id}: ${message}`
            );

            /*
             * Once a command is EXECUTED it must not be transitioned
             * to FAILED. An executed command waits for telemetry
             * verification instead.
             */
            if (!executedSuccessfully) {
                try {
                    await failCommand(
                        command.id,
                        currentVersion,
                        message
                    );
                } catch (
                    failureError
                ) {
                    console.error(
                        `Unable to mark BAS command ${command.id} FAILED:`,
                        failureError
                    );
                }
            }

            /*
             * If execution succeeded but something unexpected happened
             * afterward, leave the command EXECUTED rather than attempting
             * an invalid EXECUTED -> FAILED transition.
             */
            if (executedSuccessfully) {
                return {
                    zone:
                        currentZone
                };
            }
        }
    }

    return {
        zone:
            currentZone
    };
}

async function main(): Promise<void> {
    await request(
        `/api/v1/telemetry/sites/${siteId}`
    );

    const assets =
        await request<RecordWithId[]>(
            `/api/v1/telemetry/sites/${siteId}/assets`
        );

    const asset =
        await ensure(
            assets,
            "BAS-ZONE-001",
            "/api/v1/telemetry/assets",
            {
                siteId,
                name:
                    "BAS Sample Zone",
                assetType:
                    "HVAC_ZONE",
                status:
                    "ACTIVE"
            }
        );

    const devices =
        await request<RecordWithId[]>(
            `/api/v1/telemetry/sites/${siteId}/devices`
        );

    const device =
        await ensure(
            devices,
            deviceCode,
            "/api/v1/telemetry/devices",
            {
                siteId,
                assetId:
                    asset.id,
                name:
                    "Sample HVAC Controller",
                deviceType:
                    "HVAC_CONTROLLER",
                protocol:
                    "SIMULATOR",
                externalDeviceId:
                    deviceCode,
                status:
                    "ONLINE"
            }
        );

    const definitions =
        await request<RecordWithId[]>(
            "/api/v1/telemetry/measurement-definitions"
        );

    const temperature =
        await ensure(
            definitions,
            "bas.zone.temperature",
            "/api/v1/telemetry/measurement-definitions",
            {
                name:
                    "Zone Temperature",
                unit:
                    "F",
                dataType:
                    "NUMBER",
                minimumValue:
                    -40,
                maximumValue:
                    140
            }
        );

    const humidity =
        await ensure(
            definitions,
            "bas.zone.humidity",
            "/api/v1/telemetry/measurement-definitions",
            {
                name:
                    "Zone Relative Humidity",
                unit:
                    "%",
                dataType:
                    "NUMBER",
                minimumValue:
                    0,
                maximumValue:
                    100
            }
        );

    const setpoint =
        await ensure(
            definitions,
            "bas.zone.setpoint",
            "/api/v1/telemetry/measurement-definitions",
            {
                name:
                    "Zone Temperature Setpoint",
                description:
                    "Observed HVAC zone temperature setpoint reported by the BAS controller or edge device.",
                unit:
                    "F",
                dataType:
                    "NUMBER",
                minimumValue:
                    40,
                maximumValue:
                    100
            }
        );

    const operatingState =
        await ensure(
            definitions,
            "hvac.operating_state",
            "/api/v1/telemetry/measurement-definitions",
            {
                name:
                    "HVAC Operating State",
                dataType:
                    "STRING"
            }
        );

    let zone: Zone = {
        temperatureF:
            72.5,
        setpointF:
            defaultSetpointF,
        humidity:
            45.2,
        state:
            "COOLING",
        time:
            new Date()
    };

    let telemetryBusy =
        false;

    let commandBusy =
        false;

    let pendingVerification:
        | PendingVerification
        | undefined;

    const processPendingCommands =
        async (): Promise<void> => {
            if (
                commandBusy ||
                pendingVerification
            ) {
                return;
            }

            commandBusy =
                true;

            try {
                const result =
                    await processCommands(
                        device.id,
                        asset.id,
                        zone
                    );

                zone =
                    result.zone;

                if (
                    result.pendingVerification
                ) {
                    pendingVerification =
                        result.pendingVerification;
                }
            } catch (error) {
                console.error(
                    "BAS command polling failed:",
                    error
                );
            } finally {
                commandBusy =
                    false;
            }
        };

    const tick =
        async (): Promise<void> => {
            if (telemetryBusy) {
                return;
            }

            telemetryBusy =
                true;

            try {
                /*
                 * Snapshot the controller state for this telemetry
                 * observation. All readings in this cycle therefore
                 * describe the same controller state.
                 */
                const observedZone: Zone = {
                    ...zone,
                    time:
                        new Date(
                            zone.time.getTime()
                        )
                };

                const observedAt =
                    observedZone.time.toISOString();

                for (
                    const [
                        definition,
                        value
                    ] of [
                        [
                            temperature,
                            {
                                numericValue:
                                    round(
                                        observedZone.temperatureF
                                    )
                            }
                        ],
                        [
                            humidity,
                            {
                                numericValue:
                                    round(
                                        observedZone.humidity
                                    )
                            }
                        ],
                        [
                            setpoint,
                            {
                                numericValue:
                                    round(
                                        observedZone.setpointF
                                    )
                            }
                        ],
                        [
                            operatingState,
                            {
                                stringValue:
                                    observedZone.state
                            }
                        ]
                    ] as const
                ) {
                    await request(
                        "/api/v1/telemetry/readings",
                        "POST",
                        {
                            siteId,
                            deviceId:
                                device.id,
                            measurementDefinitionId:
                                definition.id,
                            observedAt,
                            ...value,
                            quality:
                                "GOOD",
                            source:
                                "simulator.bas"
                        }
                    );
                }

                console.log(
                    `${observedAt} ` +
                    `${deviceCode} ` +
                    `${round(observedZone.temperatureF)} F ` +
                    `${round(observedZone.humidity)} % ` +
                    `${observedZone.state} ` +
                    `SETPOINT ${round(observedZone.setpointF)} F`
                );

                /*
                 * Verification happens only after the complete telemetry
                 * cycle has been successfully accepted by Ruby.
                 *
                 * This means bas.zone.setpoint has been persisted before
                 * the command can transition from EXECUTED to VERIFIED.
                 */
                if (pendingVerification) {
                    const verification =
                        pendingVerification;

                    const observedSetpointF =
                        round(
                            observedZone.setpointF
                        );

                    const expectedSetpointF =
                        round(
                            verification.expectedSetpointF
                        );

                    if (
                        observedSetpointF ===
                        expectedSetpointF
                    ) {
                        try {
                            const verified =
                                await verifyCommand(
                                    verification.commandId,
                                    verification.version
                                );

                            console.log(
                                `BAS command verified: ${verified.id} ` +
                                `SET_TEMPERATURE ${expectedSetpointF} F ` +
                                `status ${verified.status} ` +
                                `version ${verified.version}`
                            );

                            pendingVerification =
                                undefined;
                        } catch (
                            verificationError
                        ) {
                            /*
                             * Keep the pending verification so a later
                             * successful telemetry cycle can retry it.
                             */
                            console.error(
                                `Unable to verify BAS command ${verification.commandId}:`,
                                verificationError
                            );
                        }
                    } else {
                        console.log(
                            `BAS command awaiting verification: ` +
                            `${verification.commandId}; ` +
                            `expected ${expectedSetpointF} F, ` +
                            `observed ${observedSetpointF} F`
                        );
                    }
                }

                zone =
                    advance(
                        zone,
                        stepMinutes
                    );
            } catch (error) {
                console.error(
                    "BAS sample failed:",
                    error
                );
            } finally {
                telemetryBusy =
                    false;
            }
        };

    console.log(
        `BAS simulator: ${deviceCode}, ` +
        `site ${siteId}, ` +
        `telemetry every ${intervalMs} ms, ` +
        `command polling every ${commandPollMs} ms`
    );

    await processPendingCommands();

    await tick();

    setInterval(
        () => {
            void tick();
        },
        intervalMs
    );

    setInterval(
        () => {
            void processPendingCommands();
        },
        commandPollMs
    );
}

if (
    process.env.BAS_SIMULATOR_TEST !==
    "1"
) {
    void main().catch(
        error => {
            console.error(
                error
            );

            process.exitCode =
                1;
        }
    );
}