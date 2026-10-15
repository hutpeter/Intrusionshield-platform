import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  PatientRegistration
} from "@intrusionshield/his";

export interface PatientRegistrationRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<PatientRegistration | null>;

  findByPatientId(
    patientId: string,
    tenantId: string
  ): Promise<readonly PatientRegistration[]>;

  create(
    registration: PatientRegistration
  ): Promise<PatientRegistration>;

  update(
    registration: PatientRegistration
  ): Promise<PatientRegistration>;
}

export class SqlPatientRegistrationRepository
implements PatientRegistrationRepository {
  public constructor(
    private readonly database: IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<PatientRegistration | null> {
    const result =
      await this.database.query<PatientRegistrationRow>(
        `${this.selectSql()}
         WHERE registration.id = @id
           AND registration.tenant_id = @tenantId`,
        [
          { name: "id", value: id },
          { name: "tenantId", value: tenantId }
        ]
      );

    const row = result.rows[0];

    return row
      ? this.toDomain(row)
      : null;
  }

  public async findByPatientId(
    patientId: string,
    tenantId: string
  ): Promise<readonly PatientRegistration[]> {
    const result =
      await this.database.query<PatientRegistrationRow>(
        `${this.selectSql()}
         WHERE registration.patient_id = @patientId
           AND registration.tenant_id = @tenantId
         ORDER BY
           registration.registered_at DESC,
           registration.id DESC`,
        [
          {
            name: "patientId",
            value: patientId
          },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return result.rows.map(
      (row) => this.toDomain(row)
    );
  }

  public async create(
    registration: PatientRegistration
  ): Promise<PatientRegistration> {
    await this.database.execute(
      `INSERT INTO HIS.PatientRegistrations
       (
         id,
         tenant_id,
         patient_id,
         facility_id,
         registration_number,
         registration_type,
         status,
         source,
         registered_at,
         completed_at,
         cancelled_at,
         reason_for_visit,
         registration_location,
         created_at,
         updated_at,
         version
       )
       VALUES
       (
         @id,
         @tenantId,
         @patientId,
         @facilityId,
         @registrationNumber,
         @registrationType,
         @status,
         @source,
         @registeredAt,
         @completedAt,
         @cancelledAt,
         @reasonForVisit,
         @registrationLocation,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.parameters(registration)
    );

    return registration;
  }

  public async update(
    registration: PatientRegistration
  ): Promise<PatientRegistration> {
    const nextVersion =
      registration.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.PatientRegistrations
         SET
           patient_id = @patientId,
           facility_id = @facilityId,
           registration_number =
             @registrationNumber,
           registration_type =
             @registrationType,
           status = @status,
           source = @source,
           registered_at = @registeredAt,
           completed_at = @completedAt,
           cancelled_at = @cancelledAt,
           reason_for_visit = @reasonForVisit,
           registration_location =
             @registrationLocation,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.parameters(registration),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Patient registration was modified or does not exist"
      );
    }

    return {
      ...registration,
      version: nextVersion
    };
  }

  private selectSql(): string {
    return `SELECT
              registration.id,
              registration.tenant_id AS tenantId,
              registration.patient_id AS patientId,
              registration.facility_id AS facilityId,
              registration.registration_number
                AS registrationNumber,
              registration.registration_type
                AS registrationType,
              registration.status,
              registration.source,
              registration.registered_at
                AS registeredAt,
              registration.completed_at
                AS completedAt,
              registration.cancelled_at
                AS cancelledAt,
              registration.reason_for_visit
                AS reasonForVisit,
              registration.registration_location
                AS registrationLocation,
              registration.created_at AS createdAt,
              registration.updated_at AS updatedAt,
              registration.version
            FROM HIS.PatientRegistrations
              registration`;
  }

  private parameters(
    registration: PatientRegistration
  ) {
    return [
      {
        name: "id",
        value: registration.id
      },
      {
        name: "tenantId",
        value: registration.tenantId
      },
      {
        name: "patientId",
        value: registration.patientId
      },
      {
        name: "facilityId",
        value: registration.facilityId
      },
      {
        name: "registrationNumber",
        value: registration.registrationNumber
      },
      {
        name: "registrationType",
        value: registration.registrationType
      },
      {
        name: "status",
        value: registration.status
      },
      {
        name: "source",
        value: registration.source
      },
      {
        name: "registeredAt",
        value: registration.registeredAt
      },
      {
        name: "completedAt",
        value: registration.completedAt ?? null
      },
      {
        name: "cancelledAt",
        value: registration.cancelledAt ?? null
      },
      {
        name: "reasonForVisit",
        value: registration.reasonForVisit ?? null
      },
      {
        name: "registrationLocation",
        value:
          registration.registrationLocation ?? null
      },
      {
        name: "createdAt",
        value: registration.createdAt
      },
      {
        name: "updatedAt",
        value: registration.updatedAt
      },
      {
        name: "version",
        value: registration.version
      }
    ];
  }

  private toDomain(
    row: PatientRegistrationRow
  ): PatientRegistration {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      facilityId: row.facilityId,
      registrationNumber:
        row.registrationNumber,
      registrationType:
        row.registrationType,
      status: row.status,
      source: row.source,
      registeredAt: row.registeredAt,
      completedAt:
        row.completedAt ?? undefined,
      cancelledAt:
        row.cancelledAt ?? undefined,
      reasonForVisit:
        row.reasonForVisit ?? undefined,
      registrationLocation:
        row.registrationLocation ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface PatientRegistrationRow {
  id: string;
  tenantId: string;
  patientId: string;
  facilityId: string;
  registrationNumber: string;
  registrationType:
    PatientRegistration["registrationType"];
  status: PatientRegistration["status"];
  source: PatientRegistration["source"];
  registeredAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  reasonForVisit: string | null;
  registrationLocation: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
