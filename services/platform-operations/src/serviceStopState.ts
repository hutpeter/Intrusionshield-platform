import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    renameSync,
    unlinkSync
} from "node:fs";

import { join } from "node:path";

const localAppData = process.env.LOCALAPPDATA;

if (!localAppData) {
    throw new Error(
        "LOCALAPPDATA is required for Ruby service state."
    );
}

const stateDirectory = join(
    localAppData,
    "Ruby",
    "State"
);

const validServiceIds = new Set([
    "gateway",
    "authentication",
    "his",
    "telemetry-energy"
]);

function getStatePath(serviceId: string): string {
    if (!validServiceIds.has(serviceId)) {
        throw new Error(
            `Invalid Ruby service ID '${serviceId}'.`
        );
    }

    return join(
        stateDirectory,
        `${serviceId}.intentional-stop.json`
    );
}

export function isServiceIntentionallyStopped(
    serviceId: string
): boolean {
    return existsSync(getStatePath(serviceId));
}

export function markServiceIntentionallyStopped(
    serviceId: string
): void {
    const path = getStatePath(serviceId);

    mkdirSync(stateDirectory, {
        recursive: true
    });

    const temporaryPath =
        `${path}.${process.pid}.${Date.now()}.tmp`;

    const record = {
        serviceId,
        stoppedAt: new Date().toISOString(),
        reason: "administrator-requested"
    };

    writeFileSync(
        temporaryPath,
        JSON.stringify(record, null, 2),
        { flag: "wx", mode: 0o600 }
    );

    try {
        renameSync(temporaryPath, path);
    } catch (error) {
        try {
            unlinkSync(temporaryPath);
        } catch {
            // Preserve the original error.
        }

        throw error;
    }
}

export function clearServiceIntentionalStop(
    serviceId: string
): void {
    const path = getStatePath(serviceId);

    if (existsSync(path)) {
        unlinkSync(path);
    }
}

export function getServiceIntentionalStopRecord(
    serviceId: string
): unknown | null {
    const path = getStatePath(serviceId);

    if (!existsSync(path)) {
        return null;
    }

    return JSON.parse(
        readFileSync(path, "utf8")
    ) as unknown;
}