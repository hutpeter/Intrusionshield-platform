import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  Admission
} from "@intrusionshield/his";

export interface AdmissionRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<Admission | null>;

  findByEncounterId(
    encounterId: string,
    tenantId: string
  ): Promise<Admission | null>;

  findByPatientId(
    patientId: string,
    tenantId: string
  ): Promise<readonly Admission[]>;

  create(
    admission: Admission
  ): Promise<Admission>;
}

export class SqlAdmissionRepository
implements AdmissionRepository {
  public constructor(
    private readonly database:
      IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Admission | null> {
    const result =
      await this.database.query<AdmissionRow>(
        `${this.selectSql()}
         WHERE admission.id = @id
           AND admission.tenant_id = @tenantId`,
        [
          { name: "id", value: id },
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    const row = result.rows[0];

    return row
      ? this.toDomain(row)
      : null;
  }

  public async findByEncounterId(
    encounterId: string,
    tenantId: string
  ): Promise<Admission | null> {
    const result =
      await this.database.query<AdmissionRow>(
        `${this.selectSql()}
         WHERE admission.encounter_id =
               @encounterId
           AND admission.tenant_id =
               @tenantId
         ORDER BY admission.admitted_at DESC`,
        [
          {
            name: "encounterId",
            value: encounterId
          },
          {
            name: "tenantId",
            value: tenantId
          }
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
  ): Promise<readonly Admission[]> {
    const result =
      await this.database.query<AdmissionRow>(
        `${this.selectSql()}
         WHERE admission.patient_id = @patientId
           AND admission.tenant_id = @tenantId
         ORDER BY admission.admitted_at DESC`,
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
    admission: Admission
  ): Promise<Admission> {
    await this.database.execute(
      `SET XACT_ABORT ON;

       BEGIN TRY
         BEGIN TRANSACTION;

         IF NOT EXISTS (
           SELECT 1
           FROM HIS.Encounters WITH (
             UPDLOCK,
             HOLDLOCK
           )
           WHERE tenant_id = @tenantId
             AND id = @encounterId
             AND patient_id = @patientId
             AND facility_id = @facilityId
             AND status IN (
               'PLANNED',
               'ARRIVED',
               'IN_PROGRESS',
               'ON_HOLD'
             )
         )
           THROW 51030,
             'Encounter does not belong to the patient/facility or is not admissible.',
             1;

         IF EXISTS (
           SELECT 1
           FROM HIS.Admissions WITH (
             UPDLOCK,
             HOLDLOCK
           )
           WHERE tenant_id = @tenantId
             AND encounter_id = @encounterId
             AND status = 'ACTIVE'
         )
           THROW 51031,
             'Encounter already has an active admission.',
             1;

         IF @admittingPractitionerId IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM HIS.Practitioners
              WHERE tenant_id = @tenantId
                AND id = @admittingPractitionerId
                AND status = 'ACTIVE'
            )
           THROW 51032,
             'Admitting practitioner is not active or does not exist.',
             1;

         INSERT INTO HIS.Admissions
         (
           id,
           tenant_id,
           patient_id,
           encounter_id,
           facility_id,
           admission_number,
           admission_type,
           admission_source,
           status,
           admitted_at,
           discharged_at,
           admitting_practitioner_id,
           reason_for_admission,
           discharge_disposition,
           discharge_notes,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           @patientId,
           @encounterId,
           @facilityId,
           @admissionNumber,
           @admissionType,
           @admissionSource,
           @status,
           @admittedAt,
           @dischargedAt,
           @admittingPractitionerId,
           @reasonForAdmission,
           @dischargeDisposition,
           @dischargeNotes,
           @createdAt,
           @updatedAt,
           @version
         );

         COMMIT TRANSACTION;
       END TRY
       BEGIN CATCH
         IF @@TRANCOUNT > 0
           ROLLBACK TRANSACTION;

         THROW;
       END CATCH;`,
      this.parameters(admission)
    );

    return admission;
  }

  private selectSql(): string {
    return `SELECT
              admission.id,
              admission.tenant_id AS tenantId,
              admission.patient_id AS patientId,
              admission.encounter_id AS encounterId,
              admission.facility_id AS facilityId,
              admission.admission_number
                AS admissionNumber,
              admission.admission_type
                AS admissionType,
              admission.admission_source
                AS admissionSource,
              admission.status,
              admission.admitted_at AS admittedAt,
              admission.discharged_at
                AS dischargedAt,
              admission.admitting_practitioner_id
                AS admittingPractitionerId,
              admission.reason_for_admission
                AS reasonForAdmission,
              admission.discharge_disposition
                AS dischargeDisposition,
              admission.discharge_notes
                AS dischargeNotes,
              admission.created_at AS createdAt,
              admission.updated_at AS updatedAt,
              admission.version
            FROM HIS.Admissions admission`;
  }

  private parameters(
    admission: Admission
  ) {
    return [
      {
        name: "id",
        value: admission.id
      },
      {
        name: "tenantId",
        value: admission.tenantId
      },
      {
        name: "patientId",
        value: admission.patientId
      },
      {
        name: "encounterId",
        value: admission.encounterId
      },
      {
        name: "facilityId",
        value: admission.facilityId
      },
      {
        name: "admissionNumber",
        value: admission.admissionNumber
      },
      {
        name: "admissionType",
        value: admission.admissionType
      },
      {
        name: "admissionSource",
        value: admission.admissionSource
      },
      {
        name: "status",
        value: admission.status
      },
      {
        name: "admittedAt",
        value: admission.admittedAt
      },
      {
        name: "dischargedAt",
        value:
          admission.dischargedAt ?? null
      },
      {
        name: "admittingPractitionerId",
        value:
          admission.admittingPractitionerId ??
          null
      },
      {
        name: "reasonForAdmission",
        value:
          admission.reasonForAdmission ??
          null
      },
      {
        name: "dischargeDisposition",
        value:
          admission.dischargeDisposition ??
          null
      },
      {
        name: "dischargeNotes",
        value:
          admission.dischargeNotes ?? null
      },
      {
        name: "createdAt",
        value: admission.createdAt
      },
      {
        name: "updatedAt",
        value: admission.updatedAt
      },
      {
        name: "version",
        value: admission.version
      }
    ];
  }

  private toDomain(
    row: AdmissionRow
  ): Admission {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      encounterId: row.encounterId,
      facilityId: row.facilityId,
      admissionNumber:
        row.admissionNumber,
      admissionType:
        row.admissionType,
      admissionSource:
        row.admissionSource,
      status: row.status,
      admittedAt: row.admittedAt,
      dischargedAt:
        row.dischargedAt ?? undefined,
      admittingPractitionerId:
        row.admittingPractitionerId ??
        undefined,
      reasonForAdmission:
        row.reasonForAdmission ??
        undefined,
      dischargeDisposition:
        row.dischargeDisposition ??
        undefined,
      dischargeNotes:
        row.dischargeNotes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface AdmissionRow {
  id: string;
  tenantId: string;
  patientId: string;
  encounterId: string;
  facilityId: string;
  admissionNumber: string;
  admissionType:
    Admission["admissionType"];
  admissionSource:
    Admission["admissionSource"];
  status: Admission["status"];
  admittedAt: Date;
  dischargedAt: Date | null;
  admittingPractitionerId:
    string | null;
  reasonForAdmission: string | null;
  dischargeDisposition:
    Admission["dischargeDisposition"] | null;
  dischargeNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
