import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  AvailabilityException,
  AvailabilityExceptionSearchCriteria,
  AvailabilityRule,
  AvailabilityRuleSearchCriteria
} from "@intrusionshield/his";

export interface AvailabilityRepository {
  listRules(
    criteria: AvailabilityRuleSearchCriteria
  ): Promise<AvailabilityRule[]>;

  findRuleById(
    id: string,
    tenantId: string
  ): Promise<AvailabilityRule | null>;

  createRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule>;

  updateRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule>;

  listExceptions(
    criteria:
      AvailabilityExceptionSearchCriteria
  ): Promise<AvailabilityException[]>;

  findExceptionById(
    id: string,
    tenantId: string
  ): Promise<AvailabilityException | null>;

  createException(
    exception: AvailabilityException
  ): Promise<AvailabilityException>;

  updateException(
    exception: AvailabilityException
  ): Promise<AvailabilityException>;
}

export class SqlAvailabilityRepository
  implements AvailabilityRepository {
  public constructor(
    private readonly database:
      IDatabaseProvider
  ) {}

  public async listRules(
    criteria: AvailabilityRuleSearchCriteria
  ): Promise<AvailabilityRule[]> {
    const where: string[] = [
      "tenant_id = @tenantId"
    ];

    const parameters: Array<{
      name: string;
      value: unknown;
    }> = [
      {
        name: "tenantId",
        value: criteria.tenantId
      }
    ];

    if (criteria.resourceType) {
      where.push(
        "resource_type = @resourceType"
      );

      parameters.push({
        name: "resourceType",
        value: criteria.resourceType
      });
    }

    if (criteria.resourceId) {
      where.push(
        "resource_id = @resourceId"
      );

      parameters.push({
        name: "resourceId",
        value: criteria.resourceId
      });
    }

    if (
      criteria.dayOfWeek !== undefined
    ) {
      where.push(
        "day_of_week = @dayOfWeek"
      );

      parameters.push({
        name: "dayOfWeek",
        value: criteria.dayOfWeek
      });
    }

    if (
      criteria.active !== undefined
    ) {
      where.push(
        "active = @active"
      );

      parameters.push({
        name: "active",
        value: criteria.active
      });
    }

    if (criteria.effectiveOn) {
      where.push(
        "effective_from <= @effectiveOn"
      );

      where.push(
        "(effective_to IS NULL OR effective_to >= @effectiveOn)"
      );

      parameters.push({
        name: "effectiveOn",
        value: criteria.effectiveOn
      });
    }

    const result =
      await this.database.query<
        AvailabilityRuleRow
      >(
        `${this.ruleSelectSql()}
         WHERE ${where.join(" AND ")}
         ORDER BY
           resource_type,
           resource_id,
           day_of_week,
           start_time`,
        parameters
      );

    return result.rows.map(
      (row) => this.mapRule(row)
    );
  }

  public async findRuleById(
    id: string,
    tenantId: string
  ): Promise<AvailabilityRule | null> {
    const result =
      await this.database.query<
        AvailabilityRuleRow
      >(
        `${this.ruleSelectSql()}
         WHERE id = @id
           AND tenant_id = @tenantId`,
        [
          {
            name: "id",
            value: id
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    const row = result.rows[0];

    return row
      ? this.mapRule(row)
      : null;
  }

  public async createRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule> {
    await this.database.execute(
      `INSERT INTO HIS.AvailabilityRules
       (
         id,
         tenant_id,
         resource_type,
         resource_id,
         day_of_week,
         start_time,
         end_time,
         effective_from,
         effective_to,
         active,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @resourceType,
         @resourceId,
         @dayOfWeek,
         @startTime,
         @endTime,
         @effectiveFrom,
         @effectiveTo,
         @active,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.ruleParameters(rule)
    );

    return rule;
  }

  public async updateRule(
    rule: AvailabilityRule
  ): Promise<AvailabilityRule> {
    const nextVersion =
      rule.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.AvailabilityRules
         SET
           resource_type = @resourceType,
           resource_id = @resourceId,
           day_of_week = @dayOfWeek,
           start_time = @startTime,
           end_time = @endTime,
           effective_from = @effectiveFrom,
           effective_to = @effectiveTo,
           active = @active,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.ruleParameters(rule),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Availability rule was modified or does not exist"
      );
    }

    return {
      ...rule,
      version: nextVersion
    };
  }

  public async listExceptions(
    criteria:
      AvailabilityExceptionSearchCriteria
  ): Promise<AvailabilityException[]> {
    const where: string[] = [
      "tenant_id = @tenantId"
    ];

    const parameters: Array<{
      name: string;
      value: unknown;
    }> = [
      {
        name: "tenantId",
        value: criteria.tenantId
      }
    ];

    if (criteria.resourceType) {
      where.push(
        "resource_type = @resourceType"
      );

      parameters.push({
        name: "resourceType",
        value: criteria.resourceType
      });
    }

    if (criteria.resourceId) {
      where.push(
        "resource_id = @resourceId"
      );

      parameters.push({
        name: "resourceId",
        value: criteria.resourceId
      });
    }

    if (criteria.from) {
      where.push(
        "ends_at > @from"
      );

      parameters.push({
        name: "from",
        value: criteria.from
      });
    }

    if (criteria.to) {
      where.push(
        "starts_at < @to"
      );

      parameters.push({
        name: "to",
        value: criteria.to
      });
    }

    const result =
      await this.database.query<
        AvailabilityExceptionRow
      >(
        `${this.exceptionSelectSql()}
         WHERE ${where.join(" AND ")}
         ORDER BY starts_at, ends_at`,
        parameters
      );

    return result.rows.map(
      (row) => this.mapException(row)
    );
  }

  public async findExceptionById(
    id: string,
    tenantId: string
  ): Promise<AvailabilityException | null> {
    const result =
      await this.database.query<
        AvailabilityExceptionRow
      >(
        `${this.exceptionSelectSql()}
         WHERE id = @id
           AND tenant_id = @tenantId`,
        [
          {
            name: "id",
            value: id
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    const row = result.rows[0];

    return row
      ? this.mapException(row)
      : null;
  }

  public async createException(
    exception: AvailabilityException
  ): Promise<AvailabilityException> {
    await this.database.execute(
      `INSERT INTO HIS.AvailabilityExceptions
       (
         id,
         tenant_id,
         resource_type,
         resource_id,
         starts_at,
         ends_at,
         exception_type,
         reason,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @resourceType,
         @resourceId,
         @startsAt,
         @endsAt,
         @exceptionType,
         @reason,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.exceptionParameters(
        exception
      )
    );

    return exception;
  }

  public async updateException(
    exception: AvailabilityException
  ): Promise<AvailabilityException> {
    const nextVersion =
      exception.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.AvailabilityExceptions
         SET
           resource_type = @resourceType,
           resource_id = @resourceId,
           starts_at = @startsAt,
           ends_at = @endsAt,
           exception_type = @exceptionType,
           reason = @reason,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.exceptionParameters(
            exception
          ),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Availability exception was modified or does not exist"
      );
    }

    return {
      ...exception,
      version: nextVersion
    };
  }

  private ruleSelectSql(): string {
    return `
      SELECT
        id,
        tenant_id AS tenantId,
        resource_type AS resourceType,
        resource_id AS resourceId,
        day_of_week AS dayOfWeek,
        start_time AS startTime,
        end_time AS endTime,
        CONVERT(char(10), effective_from, 23)
          AS effectiveFrom,
        CONVERT(char(10), effective_to, 23)
          AS effectiveTo,
        active,
        created_at AS createdAt,
        updated_at AS updatedAt,
        version
      FROM HIS.AvailabilityRules`;
  }

  private exceptionSelectSql(): string {
    return `
      SELECT
        id,
        tenant_id AS tenantId,
        resource_type AS resourceType,
        resource_id AS resourceId,
        starts_at AS startsAt,
        ends_at AS endsAt,
        exception_type AS exceptionType,
        reason,
        created_at AS createdAt,
        updated_at AS updatedAt,
        version
      FROM HIS.AvailabilityExceptions`;
  }

  private ruleParameters(
    rule: AvailabilityRule
  ) {
    return [
      {
        name: "id",
        value: rule.id
      },
      {
        name: "tenantId",
        value: rule.tenantId
      },
      {
        name: "resourceType",
        value: rule.resourceType
      },
      {
        name: "resourceId",
        value: rule.resourceId
      },
      {
        name: "dayOfWeek",
        value: rule.dayOfWeek
      },
      {
        name: "startTime",
        value: rule.startTime
      },
      {
        name: "endTime",
        value: rule.endTime
      },
      {
        name: "effectiveFrom",
        value: rule.effectiveFrom
      },
      {
        name: "effectiveTo",
        value:
          rule.effectiveTo ?? null
      },
      {
        name: "active",
        value: rule.active
      },
      {
        name: "createdAt",
        value: rule.createdAt
      },
      {
        name: "updatedAt",
        value: rule.updatedAt
      },
      {
        name: "version",
        value: rule.version
      }
    ];
  }

  private exceptionParameters(
    exception: AvailabilityException
  ) {
    return [
      {
        name: "id",
        value: exception.id
      },
      {
        name: "tenantId",
        value: exception.tenantId
      },
      {
        name: "resourceType",
        value: exception.resourceType
      },
      {
        name: "resourceId",
        value: exception.resourceId
      },
      {
        name: "startsAt",
        value: exception.startsAt
      },
      {
        name: "endsAt",
        value: exception.endsAt
      },
      {
        name: "exceptionType",
        value: exception.exceptionType
      },
      {
        name: "reason",
        value:
          exception.reason ?? null
      },
      {
        name: "createdAt",
        value: exception.createdAt
      },
      {
        name: "updatedAt",
        value: exception.updatedAt
      },
      {
        name: "version",
        value: exception.version
      }
    ];
  }

  private mapRule(
    row: AvailabilityRuleRow
  ): AvailabilityRule {
    return {
      id: row.id,
      tenantId: row.tenantId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      dayOfWeek: Number(row.dayOfWeek),
      startTime: row.startTime.trim(),
      endTime: row.endTime.trim(),
      effectiveFrom: row.effectiveFrom,
      effectiveTo:
        row.effectiveTo ?? undefined,
      active: Boolean(row.active),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }

  private mapException(
    row: AvailabilityExceptionRow
  ): AvailabilityException {
    return {
      id: row.id,
      tenantId: row.tenantId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      exceptionType: row.exceptionType,
      reason:
        row.reason ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface AvailabilityRuleRow {
  id: string;
  tenantId: string;

  resourceType:
    AvailabilityRule["resourceType"];

  resourceId: string;

  dayOfWeek: number;

  startTime: string;
  endTime: string;

  effectiveFrom: string;
  effectiveTo?: string | null;

  active: boolean | number;

  createdAt: Date;
  updatedAt: Date;

  version: number;
}

interface AvailabilityExceptionRow {
  id: string;
  tenantId: string;

  resourceType:
    AvailabilityException["resourceType"];

  resourceId: string;

  startsAt: Date;
  endsAt: Date;

  exceptionType:
    AvailabilityException[
      "exceptionType"
    ];

  reason?: string | null;

  createdAt: Date;
  updatedAt: Date;

  version: number;
}
