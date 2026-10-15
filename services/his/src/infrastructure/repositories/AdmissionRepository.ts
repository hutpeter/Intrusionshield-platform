import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  Admission
} from "@intrusionshield/his";

export interface AdmissionCensusQuery {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly status: Admission["status"];
}

export interface AdmissionCensusItem {
  readonly admissionId: string;
  readonly admissionNumber: string;
  readonly patientId: string;
  readonly patientNumber: string;
  readonly medicalRecordNumber: string;
  readonly patientName: string;
  readonly encounterId: string;
  readonly facilityId: string;
  readonly facilityName: string;
  readonly status: Admission["status"];
  readonly admittedAt: Date;
  readonly admissionType:
    Admission["admissionType"];
  readonly admissionSource:
    Admission["admissionSource"];
  readonly reasonForAdmission?: string;
  readonly admittingPractitionerId?: string;
  readonly bedAssignmentId?: string;
  readonly bedId?: string;
  readonly bedCode?: string;
  readonly bedName?: string;
  readonly locationId?: string;
  readonly locationCode?: string;
  readonly locationName?: string;
}

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

  findCensus(
    query: AdmissionCensusQuery
  ): Promise<readonly AdmissionCensusItem[]>;

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

  public async findCensus(
    query: AdmissionCensusQuery
  ): Promise<readonly AdmissionCensusItem[]> {
    const result =
      await this.database.query<AdmissionCensusRow>(
        `SELECT
           admission.id AS admissionId,
           admission.admission_number
             AS admissionNumber,
           admission.patient_id AS patientId,
           patient.patient_number
             AS patientNumber,
           patient.medical_record_number
             AS medicalRecordNumber,
           CONCAT(
             person.first_name,
             CASE
               WHEN person.middle_name IS NULL
                 OR LTRIM(RTRIM(person.middle_name)) = ''
               THEN ''
               ELSE CONCAT(' ', person.middle_name)
             END,
             ' ',
             person.last_name
           ) AS patientName,
           admission.encounter_id AS encounterId,
           admission.facility_id AS facilityId,
           facility.name AS facilityName,
           admission.status,
           admission.admitted_at AS admittedAt,
           admission.admission_type
             AS admissionType,
           admission.admission_source
             AS admissionSource,
           admission.reason_for_admission
             AS reasonForAdmission,
           admission.admitting_practitioner_id
             AS admittingPractitionerId,
           assignment.id AS bedAssignmentId,
           bed.id AS bedId,
           bed.code AS bedCode,
           bed.name AS bedName,
           location.id AS locationId,
           location.code AS locationCode,
           location.name AS locationName
         FROM HIS.Admissions admission
         INNER JOIN HIS.Patients patient
           ON patient.tenant_id =
              admission.tenant_id
          AND patient.id =
              admission.patient_id
         INNER JOIN HIS.Persons person
           ON person.tenant_id =
              patient.tenant_id
          AND person.id =
              patient.person_id
         INNER JOIN HIS.Facilities facility
           ON facility.tenant_id =
              admission.tenant_id
          AND facility.id =
              admission.facility_id
         LEFT JOIN HIS.BedAssignments assignment
           ON assignment.tenant_id =
              admission.tenant_id
          AND assignment.admission_id =
              admission.id
          AND assignment.status = 'ACTIVE'
         LEFT JOIN HIS.Beds bed
           ON bed.tenant_id =
              assignment.tenant_id
          AND bed.id =
              assignment.bed_id
         LEFT JOIN HIS.ClinicalLocations location
           ON location.tenant_id =
              bed.tenant_id
          AND location.id =
              bed.location_id
         WHERE admission.tenant_id = @tenantId
           AND admission.facility_id = @facilityId
           AND admission.status = @status
         ORDER BY
           CASE
             WHEN location.name IS NULL THEN 1
             ELSE 0
           END,
           location.name,
           CASE
             WHEN bed.code IS NULL THEN 1
             ELSE 0
           END,
           bed.code,
           person.last_name,
           person.first_name,
           admission.admitted_at`,
        [
          {
            name: "tenantId",
            value: query.tenantId
          },
          {
            name: "facilityId",
            value: query.facilityId
          },
          {
            name: "status",
            value: query.status
          }
        ]
      );

    return result.rows.map(
      (row) => ({
        admissionId: row.admissionId,
        admissionNumber:
          row.admissionNumber,
        patientId: row.patientId,
        patientNumber: row.patientNumber,
        medicalRecordNumber:
          row.medicalRecordNumber,
        patientName: row.patientName,
        encounterId: row.encounterId,
        facilityId: row.facilityId,
        facilityName: row.facilityName,
        status: row.status,
        admittedAt: row.admittedAt,
        admissionType: row.admissionType,
        admissionSource: row.admissionSource,
        reasonForAdmission:
          row.reasonForAdmission ?? undefined,
        admittingPractitionerId:
          row.admittingPractitionerId ??
          undefined,
        bedAssignmentId:
          row.bedAssignmentId ?? undefined,
        bedId: row.bedId ?? undefined,
        bedCode: row.bedCode ?? undefined,
        bedName: row.bedName ?? undefined,
        locationId:
          row.locationId ?? undefined,
        locationCode:
          row.locationCode ?? undefined,
        locationName:
          row.locationName ?? undefined
      })
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
        value: admission.dischargeNotes ?? null
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

interface AdmissionCensusRow {
  admissionId: string;
  admissionNumber: string;
  patientId: string;
  patientNumber: string;
  medicalRecordNumber: string;
  patientName: string;
  encounterId: string;
  facilityId: string;
  facilityName: string;
  status: Admission["status"];
  admittedAt: Date;
  admissionType:
    Admission["admissionType"];
  admissionSource:
    Admission["admissionSource"];
  reasonForAdmission: string | null;
  admittingPractitionerId:
    string | null;
  bedAssignmentId: string | null;
  bedId: string | null;
  bedCode: string | null;
  bedName: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
}
