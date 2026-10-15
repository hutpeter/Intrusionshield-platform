import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Bed } from "@intrusionshield/his";

export interface BedRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<Bed | null>;

  listForLocation(
    locationId: string,
    tenantId: string
  ): Promise<Bed[]>;

  create(
    bed: Bed
  ): Promise<Bed>;

  update(
    bed: Bed
  ): Promise<Bed>;
}

export class SqlBedRepository
  implements BedRepository {
  public constructor(
    private readonly database: IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Bed | null> {
    const result =
      await this.database.query<BedRow>(
        `SELECT
           id,
           tenant_id AS tenantId,
           facility_id AS facilityId,
           location_id AS locationId,
           code,
           name,
           bed_type AS bedType,
           status,
           operational_status AS operationalStatus,
           description,
           created_at AS createdAt,
           updated_at AS updatedAt,
           version
         FROM HIS.Beds
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

  public async listForLocation(
    locationId: string,
    tenantId: string
  ): Promise<Bed[]> {
    const result =
      await this.database.query<BedRow>(
        `SELECT
           id,
           tenant_id AS tenantId,
           facility_id AS facilityId,
           location_id AS locationId,
           code,
           name,
           bed_type AS bedType,
           status,
           operational_status AS operationalStatus,
           description,
           created_at AS createdAt,
           updated_at AS updatedAt,
           version
         FROM HIS.Beds
         WHERE location_id = @locationId
           AND tenant_id = @tenantId
         ORDER BY name, code`,
        [
          {
            name: "locationId",
            value: locationId
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
    bed: Bed
  ): Promise<Bed> {
    await this.database.execute(
      `INSERT INTO HIS.Beds
       (
         id,
         tenant_id,
         facility_id,
         location_id,
         code,
         name,
         bed_type,
         status,
         operational_status,
         description,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @facilityId,
         @locationId,
         @code,
         @name,
         @bedType,
         @status,
         @operationalStatus,
         @description,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.parameters(bed)
    );

    return bed;
  }

  public async update(
    bed: Bed
  ): Promise<Bed> {
    const nextVersion =
      bed.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.Beds
         SET
           facility_id = @facilityId,
           location_id = @locationId,
           code = @code,
           name = @name,
           bed_type = @bedType,
           status = @status,
           operational_status = @operationalStatus,
           description = @description,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.parameters(bed),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Bed was modified or does not exist"
      );
    }

    return {
      ...bed,
      version: nextVersion
    };
  }

  private parameters(
    bed: Bed
  ) {
    return [
      {
        name: "id",
        value: bed.id
      },
      {
        name: "tenantId",
        value: bed.tenantId
      },
      {
        name: "facilityId",
        value: bed.facilityId
      },
      {
        name: "locationId",
        value: bed.locationId
      },
      {
        name: "code",
        value: bed.code
      },
      {
        name: "name",
        value: bed.name
      },
      {
        name: "bedType",
        value: bed.bedType
      },
      {
        name: "status",
        value: bed.status
      },
      {
        name: "operationalStatus",
        value: bed.operationalStatus
      },
      {
        name: "description",
        value:
          bed.description ??
          null
      },
      {
        name: "createdAt",
        value: bed.createdAt
      },
      {
        name: "updatedAt",
        value: bed.updatedAt
      },
      {
        name: "version",
        value: bed.version
      }
    ];
  }

  private mapRow(
    row: BedRow
  ): Bed {
    return {
      id: row.id,
      tenantId: row.tenantId,
      facilityId: row.facilityId,
      locationId: row.locationId,
      code: row.code,
      name: row.name,
      bedType: row.bedType,
      status: row.status,
      operationalStatus:
        row.operationalStatus,
      description:
        row.description ??
        undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface BedRow {
  id: string;
  tenantId: string;
  facilityId: string;
  locationId: string;
  code: string;
  name: string;
  bedType: Bed["bedType"];
  status: Bed["status"];
  operationalStatus:
    Bed["operationalStatus"];
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
