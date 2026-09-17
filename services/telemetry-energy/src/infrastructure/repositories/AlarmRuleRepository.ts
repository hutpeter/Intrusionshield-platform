import { normalizeUuid, type IDatabaseProvider } from "@intrusionshield/database";
import {
    createAlarmRule,
    type AlarmOperator,
    type AlarmRule,
    type AlarmSeverity
} from "@intrusionshield/energy";

export interface CreateAlarmRuleRepositoryInput {
    readonly tenantId: string;
    readonly siteId?: string;
    readonly measurementCode: string;
    readonly name: string;
    readonly description?: string;
    readonly operator: AlarmOperator;
    readonly threshold: number;
    readonly severity: AlarmSeverity;
    readonly enabled: boolean;
    readonly durationSeconds: number;
}

export class SqlAlarmRuleRepository {
    public constructor(private readonly database: IDatabaseProvider) {}

    public async create(input: CreateAlarmRuleRepositoryInput): Promise<AlarmRule> {
        const rule = createAlarmRule(input);
        await this.database.execute(
            `INSERT INTO Energy.AlarmRules
             (id, tenant_id, site_id, name, description, measurement_code,
              operator, threshold_value, severity, enabled, duration_seconds,
              created_at, updated_at, version)
             VALUES
             (@id, @tenantId, @siteId, @name, @description, @measurementCode,
              @operator, @threshold, @severity, @enabled, @durationSeconds,
              @createdAt, @updatedAt, @version)`,
            [
                { name: "id", value: rule.id },
                { name: "tenantId", value: rule.tenantId },
                { name: "siteId", value: rule.siteId ?? null },
                { name: "name", value: rule.name },
                { name: "description", value: rule.description ?? null },
                { name: "measurementCode", value: rule.measurementCode },
                { name: "operator", value: rule.operator },
                { name: "threshold", value: rule.threshold },
                { name: "severity", value: rule.severity },
                { name: "enabled", value: rule.enabled },
                { name: "durationSeconds", value: rule.durationSeconds },
                { name: "createdAt", value: rule.createdAt },
                { name: "updatedAt", value: rule.updatedAt },
                { name: "version", value: rule.version }
            ]
        );
        return rule;
    }

    public async findApplicable(
        tenantId: string,
        siteId: string,
        measurementCode: string
    ): Promise<readonly AlarmRule[]> {
        const result = await this.database.query<AlarmRuleRow>(
            `SELECT id, tenant_id AS tenantId, site_id AS siteId, name, description,
                    measurement_code AS measurementCode, operator,
                    threshold_value AS threshold, severity, enabled,
                    duration_seconds AS durationSeconds, created_at AS createdAt,
                    updated_at AS updatedAt, version
             FROM Energy.AlarmRules
             WHERE tenant_id = @tenantId
               AND enabled = 1
               AND measurement_code = @measurementCode
               AND (site_id IS NULL OR site_id = @siteId)
             ORDER BY severity DESC, name`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId },
                { name: "measurementCode", value: measurementCode }
            ]
        );
        return result.rows.map(mapRule);
    }

    public async findBySite(
        tenantId: string,
        siteId: string
    ): Promise<readonly AlarmRule[]> {
        const result = await this.database.query<AlarmRuleRow>(
            `SELECT id, tenant_id AS tenantId, site_id AS siteId, name, description,
                    measurement_code AS measurementCode, operator,
                    threshold_value AS threshold, severity, enabled,
                    duration_seconds AS durationSeconds, created_at AS createdAt,
                    updated_at AS updatedAt, version
             FROM Energy.AlarmRules
             WHERE tenant_id = @tenantId
               AND (site_id IS NULL OR site_id = @siteId)
             ORDER BY name`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId }
            ]
        );
        return result.rows.map(mapRule);
    }
}

interface AlarmRuleRow {
    readonly id: string; readonly tenantId: string; readonly siteId: string | null;
    readonly name: string; readonly description: string | null;
    readonly measurementCode: string; readonly operator: AlarmOperator;
    readonly threshold: number; readonly severity: AlarmSeverity;
    readonly enabled: boolean; readonly durationSeconds: number;
    readonly createdAt: Date; readonly updatedAt: Date; readonly version: number;
}
function mapRule(row: AlarmRuleRow): AlarmRule {
    return {
        ...row,
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: row.siteId ? normalizeUuid(row.siteId) : undefined,
        description: row.description ?? undefined,
        threshold: Number(row.threshold)
    };
}
