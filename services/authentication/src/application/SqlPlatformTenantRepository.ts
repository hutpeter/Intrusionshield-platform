import { randomUUID } from "node:crypto";
import type { IDatabaseProvider } from "@intrusionshield/database";

export type TenantStatus = "ACTIVE" | "SUSPENDED" | "DISABLED";

export interface TenantRecord {
    id: string;
    code: string;
    displayName: string;
    countryCode: string;
    status: TenantStatus;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}

export interface CreateTenantInput {
    code: string;
    displayName: string;
    countryCode: string;
}

export class TenantValidationError extends Error {}
export class TenantConflictError extends Error {}

export function validateTenantInput(value: unknown): CreateTenantInput {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new TenantValidationError("Tenant input must be an object.");
    }
    const input = value as Record<string, unknown>;
    if (typeof input.code !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{1,79}$/.test(input.code)) {
        throw new TenantValidationError("code must be 2–80 ASCII letters, digits, hyphens or underscores and start with a letter.");
    }
    if (typeof input.displayName !== "string" || input.displayName.trim().length < 2 || input.displayName.trim().length > 200) {
        throw new TenantValidationError("displayName must contain 2–200 characters.");
    }
    if (typeof input.countryCode !== "string" || !/^[A-Za-z]{2}$/.test(input.countryCode)) {
        throw new TenantValidationError("countryCode must be a two-letter ISO country code.");
    }
    return {
        code: input.code.trim(),
        displayName: input.displayName.trim(),
        countryCode: input.countryCode.toUpperCase()
    };
}

export class SqlPlatformTenantRepository {
    public constructor(private readonly database: IDatabaseProvider) {}

    public async list(limit = 50, offset = 0): Promise<TenantRecord[]> {
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
            throw new TenantValidationError("Invalid pagination.");
        }
        const result = await this.database.query<TenantRecord>(
            `SELECT Id AS id, Code AS code, DisplayName AS displayName,
                    CountryCode AS countryCode, Status AS status,
                    CreatedAt AS createdAt, UpdatedAt AS updatedAt, Version AS version
               FROM [Platform].[Tenants]
              ORDER BY DisplayName, Id
              OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
            [{ name: "offset", value: offset }, { name: "limit", value: limit }]
        );
        return result.rows;
    }

    public async create(input: CreateTenantInput): Promise<TenantRecord> {
        const validated = validateTenantInput(input);
        const id = randomUUID();
        const normalizedCode = validated.code.toUpperCase();
        const now = new Date();
        const record: TenantRecord = {
            id, ...validated, status: "ACTIVE", createdAt: now, updatedAt: now, version: 1
        };
        // Caller must wrap this operation and initial tenant configuration in
        // a single transaction before enabling the public onboarding endpoint.
        try {
            await this.database.execute(
                `INSERT INTO [Platform].[Tenants]
                    (Id, Code, NormalizedCode, DisplayName, CountryCode, Status, CreatedAt, UpdatedAt, Version)
                  VALUES
                    (@id, @code, @normalizedCode, @displayName, @countryCode, @status, @createdAt, @updatedAt, @version)`,
                [
                    { name: "id", value: id },
                    { name: "code", value: validated.code },
                    { name: "normalizedCode", value: normalizedCode },
                    { name: "displayName", value: validated.displayName },
                    { name: "countryCode", value: validated.countryCode },
                    { name: "status", value: record.status },
                    { name: "createdAt", value: now },
                    { name: "updatedAt", value: now },
                    { name: "version", value: 1 }
                ]
            );
        } catch (error) {
            // SQL Server unique constraint/index violation codes.
            const sqlError = error as { number?: number; originalError?: { info?: { number?: number } } };
            const number = sqlError.number ?? sqlError.originalError?.info?.number;
            if (number === 2601 || number === 2627) {
                throw new TenantConflictError("Tenant code already exists.");
            }
            throw error;
        }
        return record;
    }
}
