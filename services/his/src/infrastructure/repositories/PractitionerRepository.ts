
import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Practitioner } from "@intrusionshield/his";

export interface PractitionerRepository {
  findById(id: string, tenantId: string): Promise<Practitioner | null>;
  create(practitioner: Practitioner): Promise<Practitioner>;
  update(practitioner: Practitioner): Promise<Practitioner>;
}

export class SqlPractitionerRepository implements PractitionerRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Practitioner | null> {
    const result = await this.database.query<PractitionerRow>(
      `SELECT
          id,
          tenant_id AS tenantId,
          person_id AS personId,
          practitioner_number AS practitionerNumber,
          practitioner_type AS practitionerType,
          status,
          effective_from AS effectiveFrom,
          effective_until AS effectiveUntil,
          created_at AS createdAt,
          updated_at AS updatedAt,
          version
       FROM HIS.Practitioners
       WHERE id = @id
         AND tenant_id = @tenantId`,
      [
        { name: "id", value: id },
        { name: "tenantId", value: tenantId }
      ]
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    const licenses = await this.database.query<PractitionerLicenseRow>(
      `SELECT
          jurisdiction,
          license_number AS licenseNumber,
          issued_at AS issuedAt,
          expires_at AS expiresAt
       FROM HIS.PractitionerLicenses
       WHERE practitioner_id = @id
         AND tenant_id = @tenantId
       ORDER BY jurisdiction, license_number`,
      [
        { name: "id", value: id },
        { name: "tenantId", value: tenantId }
      ]
    );

    const specialties = await this.database.query<{
      specialty: string;
    }>(
      `SELECT
          specialty
       FROM HIS.PractitionerSpecialties
       WHERE practitioner_id = @id
         AND tenant_id = @tenantId
       ORDER BY specialty`,
      [
        { name: "id", value: id },
        { name: "tenantId", value: tenantId }
      ]
    );

    return {
      id: row.id,
      tenantId: row.tenantId,
      personId: row.personId,
      practitionerNumber: row.practitionerNumber,
      practitionerType: row.practitionerType,
      status: row.status,
      effectiveFrom: row.effectiveFrom,
      effectiveUntil: row.effectiveUntil ?? undefined,
      licenses: licenses.rows.map((license) => ({
        jurisdiction: license.jurisdiction,
        licenseNumber: license.licenseNumber,
        issuedAt: license.issuedAt ?? undefined,
        expiresAt: license.expiresAt ?? undefined
      })),
      specialties: specialties.rows.map((item) => item.specialty),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }

  public async create(practitioner: Practitioner): Promise<Practitioner> {
    await this.database.beginTransaction();

    try {
      await this.database.execute(
        `INSERT INTO HIS.Practitioners
         (
           id,
           tenant_id,
           person_id,
           practitioner_number,
           practitioner_type,
           status,
           effective_from,
           effective_until,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           @personId,
           @practitionerNumber,
           @practitionerType,
           @status,
           @effectiveFrom,
           @effectiveUntil,
           @createdAt,
           @updatedAt,
           @version
         )`,
        [
          { name: "id", value: practitioner.id },
          { name: "tenantId", value: practitioner.tenantId },
          { name: "personId", value: practitioner.personId },
          {
            name: "practitionerNumber",
            value: practitioner.practitionerNumber
          },
          {
            name: "practitionerType",
            value: practitioner.practitionerType
          },
          { name: "status", value: practitioner.status },
          {
            name: "effectiveFrom",
            value: practitioner.effectiveFrom
          },
          {
            name: "effectiveUntil",
            value: practitioner.effectiveUntil ?? null
          },
          { name: "createdAt", value: practitioner.createdAt },
          { name: "updatedAt", value: practitioner.updatedAt },
          { name: "version", value: practitioner.version }
        ]
      );
await this.insertLicenses(practitioner);

      await this.insertSpecialties(practitioner);

      await this.database.commitTransaction();

      return practitioner;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  public async update(practitioner: Practitioner): Promise<Practitioner> {
    const nextVersion = practitioner.version + 1;

    await this.database.beginTransaction();

    try {
      const rows = await this.database.execute(
        `UPDATE HIS.Practitioners
         SET
           person_id = @personId,
           practitioner_number = @practitionerNumber,
           practitioner_type = @practitionerType,
           status = @status,
           effective_from = @effectiveFrom,
           effective_until = @effectiveUntil,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          { name: "personId", value: practitioner.personId },
          {
            name: "practitionerNumber",
            value: practitioner.practitionerNumber
          },
          {
            name: "practitionerType",
            value: practitioner.practitionerType
          },
          { name: "status", value: practitioner.status },
          {
            name: "effectiveFrom",
            value: practitioner.effectiveFrom
          },
          {
            name: "effectiveUntil",
            value: practitioner.effectiveUntil ?? null
          },
          { name: "updatedAt", value: practitioner.updatedAt },
          { name: "nextVersion", value: nextVersion },
          { name: "id", value: practitioner.id },
          { name: "tenantId", value: practitioner.tenantId },
          { name: "version", value: practitioner.version }
        ]
      );

      if (rows !== 1) {
        throw new Error("Practitioner was modified or does not exist");
      }

      await this.database.execute(
        `DELETE FROM HIS.PractitionerLicenses
         WHERE practitioner_id = @practitionerId
           AND tenant_id = @tenantId`,
        [
          { name: "practitionerId", value: practitioner.id },
          { name: "tenantId", value: practitioner.tenantId }
        ]
      );

      await this.insertLicenses(practitioner);

      await this.database.execute(
        `DELETE FROM HIS.PractitionerSpecialties
         WHERE practitioner_id = @practitionerId
           AND tenant_id = @tenantId`,
        [
          { name: "practitionerId", value: practitioner.id },
          { name: "tenantId", value: practitioner.tenantId }
        ]
      );

      await this.insertSpecialties(practitioner);

      await this.database.commitTransaction();

      return {
        ...practitioner,
        version: nextVersion
      };
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  private async insertLicenses(
    practitioner: Practitioner
  ): Promise<void> {
    for (const license of practitioner.licenses) {
      const affectedRows = await this.database.execute(
        `INSERT INTO HIS.PractitionerLicenses
         (
           tenant_id,
           practitioner_id,
           jurisdiction,
           license_number,
           issued_at,
           expires_at
         )
         VALUES
         (
           @tenantId,
           @practitionerId,
           @jurisdiction,
           @licenseNumber,
           @issuedAt,
           @expiresAt
         )`,
        [
          { name: "tenantId", value: practitioner.tenantId },
          { name: "practitionerId", value: practitioner.id },
          { name: "jurisdiction", value: license.jurisdiction },
          { name: "licenseNumber", value: license.licenseNumber },
          { name: "issuedAt", value: license.issuedAt ?? null },
          { name: "expiresAt", value: license.expiresAt ?? null }
        ]
      );
}
  }

  private async insertSpecialties(
    practitioner: Practitioner
  ): Promise<void> {
    for (const specialty of practitioner.specialties) {
      await this.database.execute(
        `INSERT INTO HIS.PractitionerSpecialties
         (
           tenant_id,
           practitioner_id,
           specialty
         )
         VALUES
         (
           @tenantId,
           @practitionerId,
           @specialty
         )`,
        [
          { name: "tenantId", value: practitioner.tenantId },
          { name: "practitionerId", value: practitioner.id },
          { name: "specialty", value: specialty }
        ]
      );
    }
  }
}

interface PractitionerRow {
  id: string;
  tenantId: string;
  personId: string;
  practitionerNumber: string;
  practitionerType: Practitioner["practitionerType"];
  status: Practitioner["status"];
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface PractitionerLicenseRow {
  jurisdiction: string;
  licenseNumber: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
}

