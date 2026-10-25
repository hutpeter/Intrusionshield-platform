import { describe, expect, it } from "@jest/globals";
import type { IDatabaseProvider, SqlParameter } from "@intrusionshield/database";
import { SqlTelemetryHistoryRepository } from "../infrastructure/repositories/TelemetryHistoryRepository.js";

const tenantId = "73c28616-633a-46b5-bd4d-2ad7971af02c";
const siteId = "138c8b96-04ae-402d-93f9-89b3677734e1";
const deviceId = "2ae890eb-2646-4727-9606-3020ba6afa4c";
const measurementDefinitionId = "bf8f9f16-d74a-447a-97b1-9fed76f4862e";

type QueryCall = { sql: string; parameters: SqlParameter[] };

function harness(rows: Record<string, unknown>[] = []) {
    const calls: QueryCall[] = [];
    const database = {
        async query<T>(sql: string, parameters: SqlParameter[] = []) {
            calls.push({ sql, parameters });
            return { rows: rows as T[], rowCount: rows.length };
        }
    } as unknown as IDatabaseProvider;
    return {
        repository: new SqlTelemetryHistoryRepository(database),
        calls
    };
}

function parameters(call: QueryCall): Map<string, unknown> {
    return new Map(call.parameters.map(({ name, value }) => [name, value]));
}

function row(id: string) {
    return {
        id,
        tenantId,
        siteId,
        deviceId,
        measurementDefinitionId,
        observedAt: new Date("2026-10-24T12:00:00.000Z"),
        receivedAt: new Date("2026-10-24T12:00:01.000Z"),
        numericValue: 21.5,
        booleanValue: null,
        stringValue: null,
        quality: "GOOD",
        source: "test"
    };
}

describe("SqlTelemetryHistoryRepository", () => {
    it("always scopes queries to tenant and site", async () => {
        const { repository, calls } = harness();
        await repository.queryHistory({ tenantId, siteId, page: 1, pageSize: 25 });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.sql).toMatch(/tenant_id\s*=\s*@tenantId/i);
        expect(calls[0]!.sql).toMatch(/site_id\s*=\s*@siteId/i);
        expect(parameters(calls[0]!).get("tenantId")).toBe(tenantId);
        expect(parameters(calls[0]!).get("siteId")).toBe(siteId);
    });

    it("applies optional device and measurement filters using SQL parameters", async () => {
        const { repository, calls } = harness();
        await repository.queryHistory({
            tenantId, siteId, deviceId, measurementDefinitionId,
            page: 1, pageSize: 25
        });
        const call = calls[0]!;
        expect(call.sql).toMatch(/device_id\s*=\s*@deviceId/i);
        expect(call.sql).toMatch(/measurement_definition_id\s*=\s*@measurementDefinitionId/i);
        expect(parameters(call).get("deviceId")).toBe(deviceId);
        expect(parameters(call).get("measurementDefinitionId")).toBe(measurementDefinitionId);
    });

    it("applies inclusive date bounds to the observation timestamp", async () => {
        const from = new Date("2026-10-01T00:00:00.000Z");
        const to = new Date("2026-10-24T23:59:59.000Z");
        const { repository, calls } = harness();
        await repository.queryHistory({ tenantId, siteId, from, to, page: 1, pageSize: 25 });
        const call = calls[0]!;
        expect(call.sql).toMatch(/observed_at\s*>=\s*@from/i);
        expect(call.sql).toMatch(/observed_at\s*<=\s*@to/i);
        expect(parameters(call).get("from")).toEqual(from);
        expect(parameters(call).get("to")).toEqual(to);
    });

    it("uses a deterministic order and fetches an extra row for hasMore", async () => {
        const { repository, calls } = harness([row("00000000-0000-4000-8000-000000000001"), row("00000000-0000-4000-8000-000000000002"), row("00000000-0000-4000-8000-000000000003")]);
        const result = await repository.queryHistory({ tenantId, siteId, page: 2, pageSize: 2 });
        const call = calls[0]!;
        expect(call.sql).toMatch(/ORDER BY\s+observed_at\s+DESC\s*,\s*id\s+DESC/i);
        expect(parameters(call).get("offset")).toBe(2);
        expect(parameters(call).get("fetchCount")).toBe(3);
        expect(result.items).toHaveLength(2);
        expect(result.hasMore).toBe(true);
        expect(result.page).toBe(2);
        expect(result.pageSize).toBe(2);
    });

    it("returns no next page when the result count fits", async () => {
        const { repository } = harness([row("00000000-0000-4000-8000-000000000001")]);
        const result = await repository.queryHistory({ tenantId, siteId, page: 1, pageSize: 10 });
        expect(result.items).toHaveLength(1);
        expect(result.hasMore).toBe(false);
    });
});
