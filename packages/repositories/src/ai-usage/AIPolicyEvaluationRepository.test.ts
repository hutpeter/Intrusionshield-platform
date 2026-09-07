
import {
    jest,
    describe,
    beforeEach,
    expect,
    test
} from "@jest/globals";
import type { DatabaseManager } from "@intrusionshield/database";
import type { AIPolicyEvaluation } from "@intrusionshield/contracts";
import { AIPolicyEvaluationRepository } from "./AIPolicyEvaluationRepository.js";

describe("AIPolicyEvaluationRepository", () => {
    let database: {
        query: jest.Mock;
        execute: jest.Mock;
    };

    let repository: AIPolicyEvaluationRepository;

    beforeEach(() => {
        database = {
            query: jest.fn(),
            execute: jest.fn()
        };

        repository = new AIPolicyEvaluationRepository(
            database as unknown as DatabaseManager
        );
    });

    test("creates a policy evaluation", async () => {
        database.execute.mockResolvedValue(1);

        const evaluation: AIPolicyEvaluation = {
            id: "evaluation-1",
            usageRecordId: "usage-1",
            tenantId: "tenant-1",
            policyId: "policy-1",
            policyVersion: "1.0",
            decision: "allow",
            reason: "Request complies with policy.",
            evaluatedAt: "2026-09-02T12:00:00.000Z",
            evaluationLatencyMs: 12
        };

        await repository.create(evaluation);

        const [sql, parameters] =
            database.execute.mock.calls[0];

        expect(sql).toContain(
            "INSERT INTO core.AIPolicyEvaluations"
        );

        expect(parameters).toEqual(
            expect.arrayContaining([
                {
                    name: "id",
                    value: "evaluation-1"
                },
                {
                    name: "usageRecordId",
                    value: "usage-1"
                },
                {
                    name: "tenantId",
                    value: "tenant-1"
                },
                {
                    name: "policyId",
                    value: "policy-1"
                },
                {
                    name: "policyVersion",
                    value: "1.0"
                },
                {
                    name: "decision",
                    value: "allow"
                },
                {
                    name: "reason",
                    value: "Request complies with policy."
                },
                {
                    name: "evaluatedAt",
                    value: "2026-09-02T12:00:00.000Z"
                },
                {
                    name: "evaluationLatencyMs",
                    value: 12
                }
            ])
        );
    });

    test("creates a policy evaluation with nullable fields as null", async () => {
        database.execute.mockResolvedValue(1);

        const evaluation: AIPolicyEvaluation = {
            id: "evaluation-2",
            usageRecordId: "usage-2",
            tenantId: "tenant-1",
            policyId: "policy-2",
            decision: "deny",
            evaluatedAt: "2026-09-02T12:01:00.000Z"
        };

        await repository.create(evaluation);

        const [, parameters] =
            database.execute.mock.calls[0];

        expect(parameters).toEqual(
            expect.arrayContaining([
                {
                    name: "policyVersion",
                    value: null
                },
                {
                    name: "reason",
                    value: null
                },
                {
                    name: "evaluationLatencyMs",
                    value: null
                }
            ])
        );
    });

    test("lists policy evaluations for a usage record", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "evaluation-1",
                    usage_record_id: "usage-1",
                    tenant_id: "tenant-1",
                    policy_id: "policy-1",
                    policy_version: "1.0",
                    decision: "allow",
                    reason: "Allowed",
                    evaluated_at: new Date(
                        "2026-09-02T12:00:00.000Z"
                    ),
                    evaluation_latency_ms: 10
                },
                {
                    id: "evaluation-2",
                    usage_record_id: "usage-1",
                    tenant_id: "tenant-1",
                    policy_id: "policy-2",
                    policy_version: "2.0",
                    decision: "deny",
                    reason: "Policy violation",
                    evaluated_at: "2026-09-02T12:00:01.000Z",
                    evaluation_latency_ms: 15
                }
            ],
            rowCount: 2
        });

        const result =
            await repository.listByUsageRecord(
                "tenant-1",
                "usage-1"
            );

        expect(result).toEqual([
            {
                id: "evaluation-1",
                usageRecordId: "usage-1",
                tenantId: "tenant-1",
                policyId: "policy-1",
                policyVersion: "1.0",
                decision: "allow",
                reason: "Allowed",
                evaluatedAt: "2026-09-02T12:00:00.000Z",
                evaluationLatencyMs: 10
            },
            {
                id: "evaluation-2",
                usageRecordId: "usage-1",
                tenantId: "tenant-1",
                policyId: "policy-2",
                policyVersion: "2.0",
                decision: "deny",
                reason: "Policy violation",
                evaluatedAt: "2026-09-02T12:00:01.000Z",
                evaluationLatencyMs: 15
            }
        ]);

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "usage_record_id = @usageRecordId"
        );
        expect(sql).toContain(
            "ORDER BY evaluated_at ASC, id ASC"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "usageRecordId",
                value: "usage-1"
            }
        ]);
    });

    test("maps nullable database fields correctly", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "evaluation-3",
                    usage_record_id: "usage-3",
                    tenant_id: "tenant-1",
                    policy_id: "policy-3",
                    policy_version: null,
                    decision: "deny",
                    reason: null,
                    evaluated_at: "2026-09-02T12:02:00.000Z",
                    evaluation_latency_ms: null
                }
            ],
            rowCount: 1
        });

        const result =
            await repository.listByUsageRecord(
                "tenant-1",
                "usage-3"
            );

        expect(result).toEqual([
            {
                id: "evaluation-3",
                usageRecordId: "usage-3",
                tenantId: "tenant-1",
                policyId: "policy-3",
                decision: "deny",
                evaluatedAt: "2026-09-02T12:02:00.000Z"
            }
        ]);
    });

    test("returns an empty list when no usage-record evaluations exist", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await expect(
            repository.listByUsageRecord(
                "tenant-1",
                "usage-1"
            )
        ).resolves.toEqual([]);
    });

    test("enforces tenant isolation for usage-record evaluations", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByUsageRecord(
            "tenant-b",
            "usage-1"
        );

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-b"
            },
            {
                name: "usageRecordId",
                value: "usage-1"
            }
        ]);
    });

    test("lists policy evaluations for a tenant without period filters", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByTenant(
            "tenant-1"
        );

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "ORDER BY evaluated_at DESC, id DESC"
        );
        expect(sql).not.toContain(
            "evaluated_at >= @periodStart"
        );
        expect(sql).not.toContain(
            "evaluated_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            }
        ]);
    });

    test("applies both period filters when listing evaluations", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByTenant(
            "tenant-1",
            "2026-09-01T00:00:00.000Z",
            "2026-09-02T23:59:59.999Z"
        );

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "evaluated_at >= @periodStart"
        );
        expect(sql).toContain(
            "evaluated_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodStart",
                value: "2026-09-01T00:00:00.000Z"
            },
            {
                name: "periodEnd",
                value: "2026-09-02T23:59:59.999Z"
            }
        ]);
    });

    test("applies only the period start filter", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByTenant(
            "tenant-1",
            "2026-09-01T00:00:00.000Z"
        );

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "evaluated_at >= @periodStart"
        );
        expect(sql).not.toContain(
            "evaluated_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodStart",
                value: "2026-09-01T00:00:00.000Z"
            }
        ]);
    });

    test("applies only the period end filter", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByTenant(
            "tenant-1",
            undefined,
            "2026-09-02T23:59:59.999Z"
        );

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).not.toContain(
            "evaluated_at >= @periodStart"
        );
        expect(sql).toContain(
            "evaluated_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodEnd",
                value: "2026-09-02T23:59:59.999Z"
            }
        ]);
    });
});

