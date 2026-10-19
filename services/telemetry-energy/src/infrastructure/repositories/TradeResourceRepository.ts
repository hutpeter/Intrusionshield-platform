import {
    randomUUID
} from "node:crypto";

import {
    normalizeUuid,
    type IDatabaseProvider
} from "@intrusionshield/database";

export type TradeResourceStatus =
    | "ACTIVE"
    | "INACTIVE";

export type TradeResourceType =
    | "EMPLOYEE"
    | "VENDOR"
    | "CONTRACTOR";

export type SkillStatus =
    | "ACTIVE"
    | "INACTIVE";

export type SkillProficiency =
    | "APPRENTICE"
    | "QUALIFIED"
    | "EXPERT";

export type CalendarEntryType =
    | "MAINTENANCE"
    | "WORK_ORDER"
    | "INSPECTION"
    | "UNAVAILABLE"
    | "OTHER";

export type CalendarEntryStatus =
    | "TENTATIVE"
    | "CONFIRMED"
    | "COMPLETED"
    | "CANCELLED";

export interface Skill {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description?: string;
    readonly status: SkillStatus;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface TradeResourceSkill {
    readonly id: string;
    readonly tenantId: string;
    readonly resourceId: string;
    readonly skillId: string;

    readonly skillCode?: string;
    readonly skillName?: string;

    readonly proficiency?: SkillProficiency;

    readonly certificationName?: string;
    readonly certificationNumber?: string;
    readonly certificationExpiresAt?: Date;

    readonly notes?: string;
    readonly createdAt: Date;
}

export interface TradeResource {
    readonly id: string;
    readonly tenantId: string;

    readonly resourceNumber: string;

    readonly firstName: string;
    readonly lastName: string;

    readonly trade: string;

    readonly resourceType: TradeResourceType;
    readonly employerName?: string;

    readonly email?: string;
    readonly phone?: string;

    readonly serviceRegion?: string;
    readonly countryCode?: string;
    readonly administrativeRegionCode?: string;
    readonly serviceAreaId?: string;

    readonly hourlyRate?: number;
    readonly currency?: string;

    readonly status: TradeResourceStatus;

    readonly notes?: string;

    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;

    readonly skills?: readonly TradeResourceSkill[];
}

export interface TradeResourceCalendarEntry {
    readonly id: string;
    readonly tenantId: string;
    readonly resourceId: string;

    readonly maintenanceActivityId?: string;

    readonly entryType: CalendarEntryType;
    readonly title: string;

    readonly startAt: Date;
    readonly endAt: Date;

    readonly status: CalendarEntryStatus;

    readonly notes?: string;

    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

export interface CreateTradeResourceInput {
    
    readonly tenantId: string;


    readonly firstName: string;
    readonly lastName: string;

    readonly trade: string;

    readonly resourceType: TradeResourceType;
    readonly employerName?: string;

    readonly email?: string;
    readonly phone?: string;

    readonly serviceRegion?: string;
    readonly countryCode?: string;
    readonly administrativeRegionCode?: string;
    readonly serviceAreaId?: string;

    readonly hourlyRate?: number;
    readonly currency?: string;

    readonly status?: TradeResourceStatus;

    readonly notes?: string;
}
export interface UpdateTradeResourceInput {
    readonly tenantId: string;
    readonly id: string;

    readonly resourceNumber: string;

    readonly firstName: string;
    readonly lastName: string;

    readonly trade: string;

    readonly resourceType: TradeResourceType;
    readonly employerName?: string;

    readonly email?: string;
    readonly phone?: string;

    readonly serviceRegion?: string;
    readonly countryCode?: string;
    readonly administrativeRegionCode?: string;
    readonly serviceAreaId?: string;

    readonly hourlyRate?: number;
    readonly currency?: string;

    readonly status: TradeResourceStatus;

    readonly notes?: string;

    readonly version: number;
}

export interface AssignTradeResourceSkillInput {
    readonly tenantId: string;
    readonly resourceId: string;
    readonly skillId: string;

    readonly proficiency?: SkillProficiency;

    readonly certificationName?: string;
    readonly certificationNumber?: string;
    readonly certificationExpiresAt?: Date;

    readonly notes?: string;
}

export interface CreateCalendarEntryInput {
    readonly tenantId: string;
    readonly resourceId: string;

    readonly maintenanceActivityId?: string;

    readonly entryType: CalendarEntryType;
    readonly title: string;

    readonly startAt: Date;
    readonly endAt: Date;

    readonly status?: CalendarEntryStatus;

    readonly notes?: string;
}

export interface AvailabilityResult {
    readonly resourceId: string;
    readonly startAt: Date;
    readonly endAt: Date;
    readonly available: boolean;

    readonly conflicts:
        readonly TradeResourceCalendarEntry[];
}

export class SqlTradeResourceRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async findSkills(
        tenantId: string
    ): Promise<readonly Skill[]> {
        const result =
            await this.database.query<SkillRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    code,
                    name,
                    description,
                    status,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version
                 FROM Energy.Skills
                 WHERE tenant_id = @tenantId
                 ORDER BY name, code`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        return result.rows.map(mapSkill);
    }

    public async findAll(
        tenantId: string
    ): Promise<readonly TradeResource[]> {
        const result =
            await this.database.query<TradeResourceRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    resource_number AS resourceNumber,
                    first_name AS firstName,
                    last_name AS lastName,
                    trade,
                    resource_type AS resourceType,
                    employer_name AS employerName,
                    email,
                    phone,
                    service_region AS serviceRegion,
                    country_code AS countryCode,
                    administrative_region_code AS administrativeRegionCode,
                    CONVERT(varchar(36), service_area_id) AS serviceAreaId,
                    hourly_rate AS hourlyRate,
                    currency,
                    status,
                    notes,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version
                 FROM Energy.TradeResources
                 WHERE tenant_id = @tenantId
                 ORDER BY
                    status,
                    last_name,
                    first_name`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    }
                ]
            );

        const resources: TradeResource[] = [];

        for (const row of result.rows) {
            const resource = mapTradeResource(row);

            resources.push({
                ...resource,
                skills:
                    await this.findSkillsForResource(
                        resource.id,
                        tenantId
                    )
            });
        }

        return resources;
    }

    public async findById(
        id: string,
        tenantId: string
    ): Promise<TradeResource | null> {
        const result =
            await this.database.query<TradeResourceRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    resource_number AS resourceNumber,
                    first_name AS firstName,
                    last_name AS lastName,
                    trade,
                    resource_type AS resourceType,
                    employer_name AS employerName,
                    email,
                    phone,
                    service_region AS serviceRegion,
                    country_code AS countryCode,
                    administrative_region_code AS administrativeRegionCode,
                    CONVERT(varchar(36), service_area_id) AS serviceAreaId,
                    hourly_rate AS hourlyRate,
                    currency,
                    status,
                    notes,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version
                 FROM Energy.TradeResources
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

        if (!row) {
            return null;
        }

        const resource =
            mapTradeResource(row);

        return {
            ...resource,
            skills:
                await this.findSkillsForResource(
                    resource.id,
                    tenantId
                )
        };
    }

    public async create(
        input: CreateTradeResourceInput
    ): Promise<TradeResource> {
        const now = new Date();
        const id = randomUUID();

        /*
         * Resource numbers are generated by Ruby, not entered by the user.
         *
         * The UPDLOCK/HOLDLOCK hints serialize number allocation for a tenant
         * while this INSERT statement determines the next TECH-xxxx value.
         * Existing non-TECH resource numbers are ignored.
         */
        await this.database.execute(
            `INSERT INTO Energy.TradeResources
             (
                id,
                tenant_id,
                resource_number,
                first_name,
                last_name,
                trade,
                resource_type,
                employer_name,
                email,
                phone,
                service_region,
                country_code,
                administrative_region_code,
                service_area_id,
                hourly_rate,
                currency,
                status,
                notes,
                created_at,
                updated_at,
                version
             )
             SELECT
                @id,
                @tenantId,
                CONCAT(
                    'TECH-',
                    RIGHT(
                        CONCAT(
                            '0000',
                            CAST(
                                COALESCE(
                                    MAX(
                                        CASE
                                            WHEN resource_number LIKE 'TECH-[0-9]%'
                                            THEN TRY_CONVERT(
                                                int,
                                                SUBSTRING(
                                                    resource_number,
                                                    6,
                                                    32
                                                )
                                            )
                                            ELSE NULL
                                        END
                                    ),
                                    0
                                ) + 1
                                AS varchar(32)
                            )
                        ),
                        4
                    )
                ),
                @firstName,
                @lastName,
                @trade,
                @resourceType,
                @employerName,
                @email,
                @phone,
                @serviceRegion,
                @countryCode,
                @administrativeRegionCode,
                @serviceAreaId,
                @hourlyRate,
                @currency,
                @status,
                @notes,
                @createdAt,
                @updatedAt,
                @version
             FROM Energy.TradeResources WITH (UPDLOCK, HOLDLOCK)
             WHERE tenant_id = @tenantId`,
            [
                {
                    name: "id",
                    value: id
                },
                {
                    name: "tenantId",
                    value: input.tenantId
                },
                {
                    name: "firstName",
                    value: input.firstName
                },
                {
                    name: "lastName",
                    value: input.lastName
                },
                {
                    name: "trade",
                    value: input.trade
                },
                {
                    name: "resourceType",
                    value: input.resourceType
                },
                {
                    name: "employerName",
                    value: input.employerName ?? null
                },
                {
                    name: "email",
                    value: input.email ?? null
                },
                {
                    name: "phone",
                    value: input.phone ?? null
                },
                {
                    name: "serviceRegion",
                    value: input.serviceRegion ?? null
                },
                {
                    name: "countryCode",
                    value: input.countryCode ?? null
                },
                {
                    name: "administrativeRegionCode",
                    value: input.administrativeRegionCode ?? null
                },
                {
                    name: "serviceAreaId",
                    value: input.serviceAreaId ?? null
                },
                {
                    name: "hourlyRate",
                    value: input.hourlyRate ?? null
                },
                {
                    name: "currency",
                    value: input.currency ?? null
                },
                {
                    name: "status",
                    value: input.status ?? "ACTIVE"
                },
                {
                    name: "notes",
                    value: input.notes ?? null
                },
                {
                    name: "createdAt",
                    value: now
                },
                {
                    name: "updatedAt",
                    value: now
                },
                {
                    name: "version",
                    value: 1
                }
            ]
        );

        const created =
            await this.findById(
                id,
                input.tenantId
            );

        if (!created) {
            throw new Error(
                "Trade resource could not be reloaded after creation."
            );
        }

        return created;
    }

public async update(
    input: UpdateTradeResourceInput
): Promise<TradeResource> {
    const existing =
        await this.findById(
            input.id,
            input.tenantId
        );

    if (!existing) {
        throw new Error(
            "Trade resource was not found."
        );
    }

    const updatedAt = new Date();

    const result =
        await this.database.execute(
            `UPDATE Energy.TradeResources
             SET
                resource_number = @resourceNumber,
                first_name = @firstName,
                last_name = @lastName,
                trade = @trade,
                resource_type = @resourceType,
                employer_name = @employerName,
                email = @email,
                phone = @phone,
                service_region = @serviceRegion,
                country_code = @countryCode,
                administrative_region_code = @administrativeRegionCode,
                service_area_id = @serviceAreaId,
                hourly_rate = @hourlyRate,
                currency = @currency,
                status = @status,
                notes = @notes,
                updated_at = @updatedAt,
                version = version + 1
             WHERE id = @id
               AND tenant_id = @tenantId
               AND version = @version`,
            [
                {
                    name: "id",
                    value: input.id
                },
                {
                    name: "tenantId",
                    value: input.tenantId
                },
                {
                    name: "resourceNumber",
                    value: input.resourceNumber
                },
                {
                    name: "firstName",
                    value: input.firstName
                },
                {
                    name: "lastName",
                    value: input.lastName
                },
                {
                    name: "trade",
                    value: input.trade
                },
                {
                    name: "resourceType",
                    value: input.resourceType
                },
                {
                    name: "employerName",
                    value:
                        input.employerName ?? null
                },
                {
                    name: "email",
                    value: input.email ?? null
                },
                {
                    name: "phone",
                    value: input.phone ?? null
                },
                {
                    name: "serviceRegion",
                    value:
                        input.serviceRegion ?? null
                },
                {
                    name: "countryCode",
                    value:
                        input.countryCode ?? null
                },
                {
                    name: "administrativeRegionCode",
                    value:
                        input.administrativeRegionCode ?? null
                },
                {
                    name: "serviceAreaId",
                    value:
                        input.serviceAreaId ?? null
                },
                {
                    name: "hourlyRate",
                    value:
                        input.hourlyRate ?? null
                },
                {
                    name: "currency",
                    value:
                        input.currency ?? null
                },
                {
                    name: "status",
                    value: input.status
                },
                {
                    name: "notes",
                    value: input.notes ?? null
                },
                {
                    name: "updatedAt",
                    value: updatedAt
                },
                {
                    name: "version",
                    value: input.version
                }
            ]
        );

    if (result === 0) {
        throw new Error(
            "Trade resource was modified by another user. Refresh and try again."
        );
    }

    const updated =
        await this.findById(
            input.id,
            input.tenantId
        );

    if (!updated) {
        throw new Error(
            "Trade resource could not be reloaded after update."
        );
    }

    return updated;
}

    public async assignSkill(
        input: AssignTradeResourceSkillInput
    ): Promise<TradeResourceSkill> {
        const resource =
            await this.findById(
                input.resourceId,
                input.tenantId
            );

        if (!resource) {
            throw new Error(
                "Trade resource was not found."
            );
        }

        const skill =
            await this.findSkillById(
                input.skillId,
                input.tenantId
            );

        if (!skill) {
            throw new Error(
                "Skill was not found."
            );
        }

        const existing =
            await this.database.query<{ id: string }>(
                `SELECT id
                 FROM Energy.TradeResourceSkills
                 WHERE tenant_id = @tenantId
                   AND resource_id = @resourceId
                   AND skill_id = @skillId`,
                [
                    {
                        name: "tenantId",
                        value: input.tenantId
                    },
                    {
                        name: "resourceId",
                        value: input.resourceId
                    },
                    {
                        name: "skillId",
                        value: input.skillId
                    }
                ]
            );

        if (existing.rows[0]) {
            throw new Error(
                "This skill is already assigned to the trade resource."
            );
        }

        const item: TradeResourceSkill = {
            id: randomUUID(),
            tenantId: input.tenantId,
            resourceId: input.resourceId,
            skillId: input.skillId,

            skillCode: skill.code,
            skillName: skill.name,

            proficiency:
                input.proficiency,

            certificationName:
                input.certificationName,

            certificationNumber:
                input.certificationNumber,

            certificationExpiresAt:
                input.certificationExpiresAt,

            notes: input.notes,

            createdAt: new Date()
        };

        await this.database.execute(
            `INSERT INTO Energy.TradeResourceSkills
             (
                id,
                tenant_id,
                resource_id,
                skill_id,
                proficiency,
                certification_name,
                certification_number,
                certification_expires_at,
                notes,
                created_at
             )
             VALUES
             (
                @id,
                @tenantId,
                @resourceId,
                @skillId,
                @proficiency,
                @certificationName,
                @certificationNumber,
                @certificationExpiresAt,
                @notes,
                @createdAt
             )`,
            [
                {
                    name: "id",
                    value: item.id
                },
                {
                    name: "tenantId",
                    value: item.tenantId
                },
                {
                    name: "resourceId",
                    value: item.resourceId
                },
                {
                    name: "skillId",
                    value: item.skillId
                },
                {
                    name: "proficiency",
                    value:
                        item.proficiency ?? null
                },
                {
                    name: "certificationName",
                    value:
                        item.certificationName ??
                        null
                },
                {
                    name: "certificationNumber",
                    value:
                        item.certificationNumber ??
                        null
                },
                {
                    name:
                        "certificationExpiresAt",
                    value:
                        item.certificationExpiresAt ??
                        null
                },
                {
                    name: "notes",
                    value:
                        item.notes ?? null
                },
                {
                    name: "createdAt",
                    value: item.createdAt
                }
            ]
        );

        return item;
    }
    public async removeSkill(
    resourceId: string,
    skillId: string,
    tenantId: string
): Promise<void> {
    const resource =
        await this.findById(
            resourceId,
            tenantId
        );

    if (!resource) {
        throw new Error(
            "Trade resource was not found."
        );
    }

    const result =
        await this.database.execute(
            `DELETE FROM Energy.TradeResourceSkills
             WHERE tenant_id = @tenantId
               AND resource_id = @resourceId
               AND skill_id = @skillId`,
            [
                {
                    name: "tenantId",
                    value: tenantId
                },
                {
                    name: "resourceId",
                    value: resourceId
                },
                {
                    name: "skillId",
                    value: skillId
                }
            ]
        );

    if (result === 0) {
        throw new Error(
            "The skill is not assigned to this trade resource."
        );
    }
}

    public async findSkillsForResource(
        resourceId: string,
        tenantId: string
    ): Promise<
        readonly TradeResourceSkill[]
    > {
        const result =
            await this.database.query<
                TradeResourceSkillRow
            >(
                `SELECT
                    rs.id,
                    rs.tenant_id AS tenantId,
                    rs.resource_id AS resourceId,
                    rs.skill_id AS skillId,

                    s.code AS skillCode,
                    s.name AS skillName,

                    rs.proficiency,
                    rs.certification_name
                        AS certificationName,
                    rs.certification_number
                        AS certificationNumber,
                    rs.certification_expires_at
                        AS certificationExpiresAt,
                    rs.notes,
                    rs.created_at AS createdAt

                 FROM Energy.TradeResourceSkills rs

                 INNER JOIN Energy.Skills s
                    ON s.id = rs.skill_id
                   AND s.tenant_id =
                       rs.tenant_id

                 WHERE rs.tenant_id =
                       @tenantId
                   AND rs.resource_id =
                       @resourceId

                 ORDER BY s.name, s.code`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    },
                    {
                        name: "resourceId",
                        value: resourceId
                    }
                ]
            );

        return result.rows.map(
            mapTradeResourceSkill
        );
    }

    public async findCalendar(
        resourceId: string,
        tenantId: string
    ): Promise<
        readonly TradeResourceCalendarEntry[]
    > {
        const result =
            await this.database.query<CalendarRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    resource_id AS resourceId,
                    maintenance_activity_id
                        AS maintenanceActivityId,
                    entry_type AS entryType,
                    title,
                    start_at AS startAt,
                    end_at AS endAt,
                    status,
                    notes,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version

                 FROM Energy.TradeResourceCalendar

                 WHERE tenant_id = @tenantId
                   AND resource_id = @resourceId

                 ORDER BY start_at, end_at`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    },
                    {
                        name: "resourceId",
                        value: resourceId
                    }
                ]
            );

        return result.rows.map(
            mapCalendarEntry
        );
    }

    public async checkAvailability(
        resourceId: string,
        tenantId: string,
        startAt: Date,
        endAt: Date
    ): Promise<AvailabilityResult> {
        if (endAt <= startAt) {
            throw new Error(
                "endAt must be after startAt."
            );
        }

        const resource =
            await this.findById(
                resourceId,
                tenantId
            );

        if (!resource) {
            throw new Error(
                "Trade resource was not found."
            );
        }

        const result =
            await this.database.query<CalendarRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    resource_id AS resourceId,
                    maintenance_activity_id
                        AS maintenanceActivityId,
                    entry_type AS entryType,
                    title,
                    start_at AS startAt,
                    end_at AS endAt,
                    status,
                    notes,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version

                 FROM Energy.TradeResourceCalendar

                 WHERE tenant_id = @tenantId
                   AND resource_id = @resourceId

                   AND status IN
                       ('TENTATIVE','CONFIRMED')

                   AND start_at < @endAt
                   AND end_at > @startAt

                 ORDER BY start_at`,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    },
                    {
                        name: "resourceId",
                        value: resourceId
                    },
                    {
                        name: "startAt",
                        value: startAt
                    },
                    {
                        name: "endAt",
                        value: endAt
                    }
                ]
            );

        const conflicts =
            result.rows.map(
                mapCalendarEntry
            );

        return {
            resourceId:
                normalizeUuid(resourceId),

            startAt,
            endAt,

            available:
                conflicts.length === 0,

            conflicts
        };
    }

    public async createCalendarEntry(
        input: CreateCalendarEntryInput
    ): Promise<TradeResourceCalendarEntry> {
        if (input.endAt <= input.startAt) {
            throw new Error(
                "endAt must be after startAt."
            );
        }

        const resource =
            await this.findById(
                input.resourceId,
                input.tenantId
            );

        if (!resource) {
            throw new Error(
                "Trade resource was not found."
            );
        }

        if (input.maintenanceActivityId) {
            const maintenance = await this.database.query<{ id: string }>(
                `SELECT id
                 FROM Energy.ContractMaintenanceActivities
                 WHERE id = @maintenanceActivityId
                   AND tenant_id = @tenantId`,
                [
                    { name: "maintenanceActivityId", value: input.maintenanceActivityId },
                    { name: "tenantId", value: input.tenantId }
                ]
            );
            if (!maintenance.rows[0]) {
                throw new Error(
                    "Maintenance activity was not found for this tenant."
                );
            }
        }

        if (
            (input.status ?? "CONFIRMED") !==
            "CANCELLED"
        ) {
            const availability =
                await this.checkAvailability(
                    input.resourceId,
                    input.tenantId,
                    input.startAt,
                    input.endAt
                );

            if (!availability.available) {
                throw new Error(
                    "Trade resource is already booked during this period."
                );
            }
        }

        const now = new Date();

        const entry:
            TradeResourceCalendarEntry = {
                id: randomUUID(),

                tenantId:
                    input.tenantId,

                resourceId:
                    input.resourceId,

                maintenanceActivityId:
                    input.maintenanceActivityId,

                entryType:
                    input.entryType,

                title:
                    input.title,

                startAt:
                    input.startAt,

                endAt:
                    input.endAt,

                status:
                    input.status ??
                    "CONFIRMED",

                notes:
                    input.notes,

                createdAt: now,
                updatedAt: now,
                version: 1
            };

        await this.database.execute(
            `INSERT INTO Energy.TradeResourceCalendar
             (
                id,
                tenant_id,
                resource_id,
                maintenance_activity_id,
                entry_type,
                title,
                start_at,
                end_at,
                status,
                notes,
                created_at,
                updated_at,
                version
             )
             VALUES
             (
                @id,
                @tenantId,
                @resourceId,
                @maintenanceActivityId,
                @entryType,
                @title,
                @startAt,
                @endAt,
                @status,
                @notes,
                @createdAt,
                @updatedAt,
                @version
             )`,
            calendarParams(entry)
        );

        return entry;
    }

    private async findSkillById(
        id: string,
        tenantId: string
    ): Promise<Skill | null> {
        const result =
            await this.database.query<SkillRow>(
                `SELECT
                    id,
                    tenant_id AS tenantId,
                    code,
                    name,
                    description,
                    status,
                    created_at AS createdAt,
                    updated_at AS updatedAt,
                    version

                 FROM Energy.Skills

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
            ? mapSkill(row)
            : null;
    }
}

interface SkillRow {
    readonly id: string;
    readonly tenantId: string;
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly status: SkillStatus;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

interface TradeResourceRow {
    readonly id: string;
    readonly tenantId: string;

    readonly resourceNumber: string;

    readonly firstName: string;
    readonly lastName: string;

    readonly trade: string;

    readonly resourceType:
        TradeResourceType;

    readonly employerName:
        string | null;

    readonly email:
        string | null;

    readonly phone:
        string | null;

    readonly serviceRegion:
        string | null;

    readonly countryCode:
        string | null;

    readonly administrativeRegionCode:
        string | null;

    readonly serviceAreaId:
        string | null;

    readonly hourlyRate:
        number | null;

    readonly currency:
        string | null;

    readonly status:
        TradeResourceStatus;

    readonly notes:
        string | null;

    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

interface TradeResourceSkillRow {
    readonly id: string;
    readonly tenantId: string;
    readonly resourceId: string;
    readonly skillId: string;

    readonly skillCode:
        string | null;

    readonly skillName:
        string | null;

    readonly proficiency:
        SkillProficiency | null;

    readonly certificationName:
        string | null;

    readonly certificationNumber:
        string | null;

    readonly certificationExpiresAt:
        Date | null;

    readonly notes:
        string | null;

    readonly createdAt: Date;
}

interface CalendarRow {
    readonly id: string;
    readonly tenantId: string;
    readonly resourceId: string;

    readonly maintenanceActivityId:
        string | null;

    readonly entryType:
        CalendarEntryType;

    readonly title: string;

    readonly startAt: Date;
    readonly endAt: Date;

    readonly status:
        CalendarEntryStatus;

    readonly notes:
        string | null;

    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly version: number;
}

function mapSkill(
    row: SkillRow
): Skill {
    return {
        ...row,

        id:
            normalizeUuid(row.id),

        tenantId:
            normalizeUuid(row.tenantId),

        description:
            row.description ??
            undefined
    };
}

function mapTradeResource(
    row: TradeResourceRow
): TradeResource {
    return {
        ...row,

        id:
            normalizeUuid(row.id),

        tenantId:
            normalizeUuid(row.tenantId),

        employerName:
            row.employerName ??
            undefined,

        email:
            row.email ??
            undefined,

        phone:
            row.phone ??
            undefined,

        serviceRegion:
            row.serviceRegion ??
            undefined,

        countryCode:
            row.countryCode?.trim() ??
            undefined,

        administrativeRegionCode:
            row.administrativeRegionCode ??
            undefined,

        serviceAreaId:
            row.serviceAreaId ??
            undefined,

        hourlyRate:
            row.hourlyRate ??
            undefined,

        currency:
            row.currency ??
            undefined,

        notes:
            row.notes ??
            undefined
    };
}

function mapTradeResourceSkill(
    row: TradeResourceSkillRow
): TradeResourceSkill {
    return {
        ...row,

        id:
            normalizeUuid(row.id),

        tenantId:
            normalizeUuid(row.tenantId),

        resourceId:
            normalizeUuid(row.resourceId),

        skillId:
            normalizeUuid(row.skillId),

        skillCode:
            row.skillCode ??
            undefined,

        skillName:
            row.skillName ??
            undefined,

        proficiency:
            row.proficiency ??
            undefined,

        certificationName:
            row.certificationName ??
            undefined,

        certificationNumber:
            row.certificationNumber ??
            undefined,

        certificationExpiresAt:
            row.certificationExpiresAt ??
            undefined,

        notes:
            row.notes ??
            undefined
    };
}

function mapCalendarEntry(
    row: CalendarRow
): TradeResourceCalendarEntry {
    return {
        ...row,

        id:
            normalizeUuid(row.id),

        tenantId:
            normalizeUuid(row.tenantId),

        resourceId:
            normalizeUuid(row.resourceId),

        maintenanceActivityId:
            row.maintenanceActivityId
                ? normalizeUuid(
                    row.maintenanceActivityId
                )
                : undefined,

        notes:
            row.notes ??
            undefined
    };
}

function tradeResourceParams(
    resource: TradeResource
) {
    return [
        {
            name: "id",
            value: resource.id
        },
        {
            name: "tenantId",
            value: resource.tenantId
        },
        {
            name: "resourceNumber",
            value: resource.resourceNumber
        },
        {
            name: "firstName",
            value: resource.firstName
        },
        {
            name: "lastName",
            value: resource.lastName
        },
        {
            name: "trade",
            value: resource.trade
        },
        {
            name: "resourceType",
            value: resource.resourceType
        },
        {
            name: "employerName",
            value:
                resource.employerName ??
                null
        },
        {
            name: "email",
            value:
                resource.email ??
                null
        },
        {
            name: "phone",
            value:
                resource.phone ??
                null
        },
        {
            name: "serviceRegion",
            value:
                resource.serviceRegion ??
                null
        },
        {
            name: "countryCode",
            value:
                resource.countryCode ??
                null
        },
        {
            name: "administrativeRegionCode",
            value:
                resource.administrativeRegionCode ??
                null
        },
        {
            name: "serviceAreaId",
            value:
                resource.serviceAreaId ??
                null
        },
        {
            name: "hourlyRate",
            value:
                resource.hourlyRate ??
                null
        },
        {
            name: "currency",
            value:
                resource.currency ??
                null
        },
        {
            name: "status",
            value: resource.status
        },
        {
            name: "notes",
            value:
                resource.notes ??
                null
        },
        {
            name: "createdAt",
            value: resource.createdAt
        },
        {
            name: "updatedAt",
            value: resource.updatedAt
        },
        {
            name: "version",
            value: resource.version
        }
    ];
}

function calendarParams(
    entry: TradeResourceCalendarEntry
) {
    return [
        {
            name: "id",
            value: entry.id
        },
        {
            name: "tenantId",
            value: entry.tenantId
        },
        {
            name: "resourceId",
            value: entry.resourceId
        },
        {
            name: "maintenanceActivityId",
            value:
                entry.maintenanceActivityId ??
                null
        },
        {
            name: "entryType",
            value: entry.entryType
        },
        {
            name: "title",
            value: entry.title
        },
        {
            name: "startAt",
            value: entry.startAt
        },
        {
            name: "endAt",
            value: entry.endAt
        },
        {
            name: "status",
            value: entry.status
        },
        {
            name: "notes",
            value:
                entry.notes ??
                null
        },
        {
            name: "createdAt",
            value: entry.createdAt
        },
        {
            name: "updatedAt",
            value: entry.updatedAt
        },
        {
            name: "version",
            value: entry.version
        }
    ];
}

