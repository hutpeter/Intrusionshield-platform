import { normalizeUuid, type IDatabaseProvider } from "@intrusionshield/database";
import {
    createAlarmEvent,
    type AlarmEvent,
    type AlarmSeverity,
    type AlarmState
} from "@intrusionshield/energy";

export interface CreateAlarmEventRepositoryInput {
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly deviceId?: string;
    readonly alarmRuleId?: string;
    readonly severity: AlarmSeverity;
    readonly state: AlarmState;
    readonly title: string;
    readonly message: string;
    readonly measurementCode?: string;
    readonly measuredValue?: number;
    readonly thresholdValue?: number;
    readonly source: string;
    readonly occurredAt: Date;
}

export class SqlAlarmEventRepository {
    public constructor(private readonly database: IDatabaseProvider) {}

    public async create(
        input: CreateAlarmEventRepositoryInput
    ): Promise<AlarmEvent> {
        const event = createAlarmEvent(input);

        await this.database.execute(
            `INSERT INTO Energy.AlarmEvents
             (id, tenant_id, site_id, asset_id, device_id, rule_id, measurement_code,
              severity, state, title, message, observed_value, threshold_value, source,
              occurred_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by,
              created_at, updated_at, version)
             VALUES
             (@id,@tenantId,@siteId,@assetId,@deviceId,@alarmRuleId,@measurementCode,
              @severity,@state,@title,@message,@measuredValue,@thresholdValue,@source,
              @occurredAt,NULL,NULL,NULL,NULL,@createdAt,@updatedAt,@version)`,
            [
                { name: "id", value: event.id },
                { name: "tenantId", value: event.tenantId },
                { name: "siteId", value: event.siteId },
                { name: "assetId", value: event.assetId ?? null },
                { name: "deviceId", value: event.deviceId ?? null },
                { name: "alarmRuleId", value: event.alarmRuleId ?? null },
                { name: "measurementCode", value: event.measurementCode ?? null },
                { name: "severity", value: event.severity },
                { name: "state", value: event.state },
                { name: "title", value: event.title },
                { name: "message", value: event.message },
                { name: "measuredValue", value: event.measuredValue ?? null },
                { name: "thresholdValue", value: event.thresholdValue ?? null },
                { name: "source", value: event.source },
                { name: "occurredAt", value: event.occurredAt },
                { name: "createdAt", value: event.createdAt },
                { name: "updatedAt", value: event.updatedAt },
                { name: "version", value: event.version }
            ]
        );

        return event;
    }

    public async findOpenForRule(
        tenantId: string,
        siteId: string,
        alarmRuleId: string,
        deviceId?: string
    ): Promise<AlarmEvent | null> {
        const result = await this.database.query<AlarmEventRow>(
            `${selectSql}
             WHERE tenant_id=@tenantId AND site_id=@siteId AND rule_id=@alarmRuleId
               AND state IN (N'OPEN',N'ACKNOWLEDGED')
               AND ((@deviceId IS NULL AND device_id IS NULL) OR device_id=@deviceId)
             ORDER BY occurred_at DESC`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId },
                { name: "alarmRuleId", value: alarmRuleId },
                { name: "deviceId", value: deviceId ?? null }
            ]
        );

        return result.rows[0] ? mapEvent(result.rows[0]) : null;
    }

    public async findBySite(
        tenantId: string,
        siteId: string
    ): Promise<readonly AlarmEvent[]> {
        const result = await this.database.query<AlarmEventRow>(
            `${selectSql}
             WHERE tenant_id=@tenantId AND site_id=@siteId
             ORDER BY occurred_at DESC`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId }
            ]
        );

        return result.rows.map(mapEvent);
    }

    public async acknowledge(
        id: string,
        tenantId: string,
        acknowledgedBy: string
    ): Promise<AlarmEvent | null> {
        const now = new Date();

        await this.database.execute(
            `UPDATE Energy.AlarmEvents
             SET state=N'ACKNOWLEDGED',
                 acknowledged_at=
                     CASE WHEN @now < occurred_at THEN occurred_at ELSE @now END,
                 acknowledged_by=@by,
                 updated_at=@now,
                 version=version+1
             WHERE id=@id AND tenant_id=@tenantId AND state=N'OPEN'`,
            [
                { name: "id", value: id },
                { name: "tenantId", value: tenantId },
                { name: "now", value: now },
                { name: "by", value: acknowledgedBy }
            ]
        );

        return this.findById(id, tenantId);
    }

    public async resolve(
        id: string,
        tenantId: string,
        resolvedBy: string
    ): Promise<AlarmEvent | null> {
        const now = new Date();

        await this.database.execute(
            `UPDATE Energy.AlarmEvents
             SET state=N'RESOLVED',
                 resolved_at=
                     CASE WHEN @now < occurred_at THEN occurred_at ELSE @now END,
                 resolved_by=@by,
                 updated_at=@now,
                 version=version+1
             WHERE id=@id AND tenant_id=@tenantId AND state<>N'RESOLVED'`,
            [
                { name: "id", value: id },
                { name: "tenantId", value: tenantId },
                { name: "now", value: now },
                { name: "by", value: resolvedBy }
            ]
        );

        return this.findById(id, tenantId);
    }

    public async resolveForRule(
        tenantId: string,
        siteId: string,
        alarmRuleId: string,
        deviceId: string | undefined,
        resolvedAt: Date
    ): Promise<void> {
        await this.database.execute(
            `UPDATE Energy.AlarmEvents
             SET state=N'RESOLVED',
                 resolved_at=
                     CASE
                         WHEN @resolvedAt < occurred_at
                             THEN occurred_at
                         ELSE @resolvedAt
                     END,
                 resolved_by=N'system.alarm-evaluator',
                 updated_at=@updatedAt,
                 version=version+1
             WHERE tenant_id=@tenantId
               AND site_id=@siteId
               AND rule_id=@alarmRuleId
               AND state IN (N'OPEN',N'ACKNOWLEDGED')
               AND ((@deviceId IS NULL AND device_id IS NULL) OR device_id=@deviceId)`,
            [
                { name: "tenantId", value: tenantId },
                { name: "siteId", value: siteId },
                { name: "alarmRuleId", value: alarmRuleId },
                { name: "deviceId", value: deviceId ?? null },
                { name: "resolvedAt", value: resolvedAt },
                { name: "updatedAt", value: new Date() }
            ]
        );
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<AlarmEvent | null> {
        const result = await this.database.query<AlarmEventRow>(
            `${selectSql} WHERE id=@id AND tenant_id=@tenantId`,
            [
                { name: "id", value: id },
                { name: "tenantId", value: tenantId }
            ]
        );

        return result.rows[0] ? mapEvent(result.rows[0]) : null;
    }
}

const selectSql =
    `SELECT id,tenant_id AS tenantId,site_id AS siteId,asset_id AS assetId,
     device_id AS deviceId,rule_id AS alarmRuleId,severity,state,title,message,
     measurement_code AS measurementCode,observed_value AS measuredValue,
     threshold_value AS thresholdValue,source,occurred_at AS occurredAt,
     acknowledged_at AS acknowledgedAt,acknowledged_by AS acknowledgedBy,
     resolved_at AS resolvedAt,resolved_by AS resolvedBy,created_at AS createdAt,
     updated_at AS updatedAt,version FROM Energy.AlarmEvents`;

interface AlarmEventRow {
    readonly id: string;
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId: string | null;
    readonly deviceId: string | null;
    readonly alarmRuleId: string | null;
    readonly severity: AlarmSeverity;
    readonly state: AlarmState;
    readonly title: string;
    readonly message: string;
    readonly measurementCode: string | null;
    readonly measuredValue: number | null;
    readonly thresholdValue: number | null;
    readonly source: string;
    readonly occurredAt: Date;
    readonly acknowledgedAt: Date | null;
    readonly acknowledgedBy: string | null;
    readonly resolvedAt: Date | null;
    readonly resolvedBy: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapEvent(row: AlarmEventRow): AlarmEvent {
    return {
        id: normalizeUuid(row.id),
        tenantId: normalizeUuid(row.tenantId),
        siteId: normalizeUuid(row.siteId),
        assetId: row.assetId
            ? normalizeUuid(row.assetId)
            : undefined,
        deviceId: row.deviceId
            ? normalizeUuid(row.deviceId)
            : undefined,
        alarmRuleId: row.alarmRuleId
            ? normalizeUuid(row.alarmRuleId)
            : undefined,
        severity: row.severity,
        state: row.state,
        title: row.title,
        message: row.message,
        measurementCode:
            row.measurementCode ?? undefined,
        measuredValue:
            row.measuredValue === null
                ? undefined
                : Number(row.measuredValue),
        thresholdValue:
            row.thresholdValue === null
                ? undefined
                : Number(row.thresholdValue),
        source: row.source,
        occurredAt: row.occurredAt,
        acknowledgedAt:
            row.acknowledgedAt ?? undefined,
        acknowledgedBy:
            row.acknowledgedBy ?? undefined,
        resolvedAt:
            row.resolvedAt ?? undefined,
        resolvedBy:
            row.resolvedBy ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version
    };
}
