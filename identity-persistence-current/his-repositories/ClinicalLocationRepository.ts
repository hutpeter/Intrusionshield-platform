import type { IDatabaseProvider } from "@intrusionshield/database";
import type { ClinicalLocation } from "@intrusionshield/his";

export interface ClinicalLocationRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<ClinicalLocation | null>;

  listForFacility(
    facilityId: string,
    tenantId: string
  ): Promise<ClinicalLocation[]>;

  create(
    location: ClinicalLocation
  ): Promise<ClinicalLocation>;

  update(
    location: ClinicalLocation
  ): Promise<ClinicalLocation>;
}

export class SqlClinicalLocationRepository
  implements ClinicalLocationRepository {
  public constructor(
    private readonly database: IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<ClinicalLocation | null> {
    const result =
      await this.database.query<ClinicalLocationRow>(
        `SELECT
           id,
           tenant_id AS tenantId,
           facility_id AS facilityId,
           parent_location_id AS parentLocationId,
           code,
           name,
           location_type AS locationType,
           status,
           description,
           floor,
           created_at AS createdAt,
           updated_at AS updatedAt,
           version
         FROM HIS.ClinicalLocations
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

    return this.mapRow(row);
  }

  public async listForFacility(
    facilityId: string,
    tenantId: string
  ): Promise<ClinicalLocation[]> {
    const result =
      await this.database.query<ClinicalLocationRow>(
        `SELECT
           id,
           tenant_id AS tenantId,
           facility_id AS facilityId,
           parent_location_id AS parentLocationId,
           code,
           name,
           location_type AS locationType,
           status,
           description,
           floor,
           created_at AS createdAt,
           updated_at AS updatedAt,
           version
         FROM HIS.ClinicalLocations
         WHERE facility_id = @facilityId
           AND tenant_id = @tenantId
         ORDER BY
           CASE location_type
             WHEN 'DEPARTMENT' THEN 1
             WHEN 'UNIT' THEN 2
             WHEN 'WARD' THEN 3
             WHEN 'AREA' THEN 4
             WHEN 'BAY' THEN 5
             WHEN 'ROOM' THEN 6
             ELSE 7
           END,
           name,
           code`,
        [
          {
            name: "facilityId",
            value: facilityId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return result.rows.map(
      (row) => this.mapRow(row)
    );
  }

  public async create(
    location: ClinicalLocation
  ): Promise<ClinicalLocation> {
    await this.database.execute(
      `INSERT INTO HIS.ClinicalLocations
       (
         id,
         tenant_id,
         facility_id,
         parent_location_id,
         code,
         name,
         location_type,
         status,
         description,
         floor,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @facilityId,
         @parentLocationId,
         @code,
         @name,
         @locationType,
         @status,
         @description,
         @floor,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.parameters(location)
    );

    return location;
  }

  public async update(
    location: ClinicalLocation
  ): Promise<ClinicalLocation> {
    const nextVersion =
      location.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.ClinicalLocations
         SET
           facility_id = @facilityId,
           parent_location_id = @parentLocationId,
           code = @code,
           name = @name,
           location_type = @locationType,
           status = @status,
           description = @description,
           floor = @floor,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.parameters(location),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Clinical location was modified or does not exist"
      );
    }

    return {
      ...location,
      version: nextVersion
    };
  }

  private parameters(
    location: ClinicalLocation
  ) {
    return [
      {
        name: "id",
        value: location.id
      },
      {
        name: "tenantId",
        value: location.tenantId
      },
      {
        name: "facilityId",
        value: location.facilityId
      },
      {
        name: "parentLocationId",
        value:
          location.parentLocationId ??
          null
      },
      {
        name: "code",
        value: location.code
      },
      {
        name: "name",
        value: location.name
      },
      {
        name: "locationType",
        value: location.locationType
      },
      {
        name: "status",
        value: location.status
      },
      {
        name: "description",
        value:
          location.description ??
          null
      },
      {
        name: "floor",
        value:
          location.floor ??
          null
      },
      {
        name: "createdAt",
        value: location.createdAt
      },
      {
        name: "updatedAt",
        value: location.updatedAt
      },
      {
        name: "version",
        value: location.version
      }
    ];
  }

  private mapRow(
    row: ClinicalLocationRow
  ): ClinicalLocation {
    return {
      id: row.id,
      tenantId: row.tenantId,
      facilityId: row.facilityId,
      parentLocationId:
        row.parentLocationId ??
        undefined,
      code: row.code,
      name: row.name,
      locationType: row.locationType,
      status: row.status,
      description:
        row.description ??
        undefined,
      floor:
        row.floor ??
        undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface ClinicalLocationRow {
  id: string;
  tenantId: string;
  facilityId: string;
  parentLocationId?: string | null;
  code: string;
  name: string;
  locationType:
    ClinicalLocation["locationType"];
  status:
    ClinicalLocation["status"];
  description?: string | null;
  floor?: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
