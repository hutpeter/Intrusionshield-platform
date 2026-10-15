import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Patient } from "@intrusionshield/his";

export interface PatientListItem {
  id: string;
  personId: string;
  patientNumber: string;
  medicalRecordNumber: string;
  status: Patient["status"];
  firstName: string;
  middleName?: string;
  lastName: string;
  preferredName?: string;
}

export interface PatientListResult {
  items: PatientListItem[];
  total: number;
}

export interface PatientRepository {
  findById(id: string, tenantId: string): Promise<Patient | null>;
  findByPersonId(personId: string, tenantId: string): Promise<Patient | null>;
  list(tenantId: string): Promise<PatientListResult>;
  create(patient: Patient): Promise<Patient>;
  update(patient: Patient): Promise<Patient>;
}

export class SqlPatientRepository implements PatientRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Patient | null> {
    const result = await this.database.query<PatientRow>(
      `SELECT
          id,
          tenant_id AS tenantId,
          person_id AS personId,
          medical_record_number AS medicalRecordNumber,
          patient_number AS patientNumber,
          status,
          registration_date AS registrationDate,
          deceased_date AS deceasedDate,
          preferred_language AS preferredLanguage,
          preferred_contact_method AS preferredContactMethod,
          created_at AS createdAt,
          updated_at AS updatedAt,
          version
       FROM HIS.Patients
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

    const contacts =
      await this.database.query<PatientEmergencyContactRow>(
        `SELECT
            person_id AS personId
         FROM HIS.PatientEmergencyContacts
         WHERE patient_id = @id
           AND tenant_id = @tenantId
         ORDER BY person_id`,
        [
          { name: "id", value: id },
          { name: "tenantId", value: tenantId }
        ]
      );

    const communicationPreferences =
      row.preferredLanguage !== null ||
      row.preferredContactMethod !== null
        ? {
            preferredLanguage: row.preferredLanguage ?? undefined,
            preferredContactMethod:
              row.preferredContactMethod ?? undefined
          }
        : undefined;

    return {
      id: row.id,
      tenantId: row.tenantId,
      personId: row.personId,
      medicalRecordNumber: row.medicalRecordNumber,
      patientNumber: row.patientNumber,
      status: row.status,
      registrationDate: row.registrationDate,
      deceasedDate: row.deceasedDate ?? undefined,
      communicationPreferences,
      emergencyContactPersonIds: contacts.rows.map(
        (contact) => contact.personId
      ),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }

  public async findByPersonId(
    personId: string,
    tenantId: string
  ): Promise<Patient | null> {
    const result = await this.database.query<{ id: string }>(
      `SELECT TOP (1) id
       FROM HIS.Patients
       WHERE person_id = @personId
         AND tenant_id = @tenantId
       ORDER BY registration_date DESC, created_at DESC`,
      [
        { name: "personId", value: personId },
        { name: "tenantId", value: tenantId }
      ]
    );

    const id = result.rows[0]?.id;
    return id ? this.findById(id, tenantId) : null;
  }

  public async list(
    tenantId: string
  ): Promise<PatientListResult> {
    const rows =
      await this.database.query<PatientListRow>(
        `SELECT
           patient.id,
           patient.person_id AS personId,
           patient.patient_number AS patientNumber,
           patient.medical_record_number AS medicalRecordNumber,
           patient.status,
           person.first_name AS firstName,
           person.middle_name AS middleName,
           person.last_name AS lastName,
           person.preferred_name AS preferredName
         FROM HIS.Patients patient
         INNER JOIN HIS.Persons person
           ON person.id = patient.person_id
          AND person.tenant_id = patient.tenant_id
         WHERE patient.tenant_id = @tenantId
         ORDER BY
           CASE
             WHEN patient.status = 'ACTIVE' THEN 0
             ELSE 1
           END,
           person.last_name,
           person.first_name,
           patient.patient_number,
           patient.id`,
        [
          {
            name: "tenantId",
            value: tenantId
          }
        ]
      );

    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        personId: row.personId,
        patientNumber: row.patientNumber,
        medicalRecordNumber: row.medicalRecordNumber,
        status: row.status,
        firstName: row.firstName,
        middleName: row.middleName ?? undefined,
        lastName: row.lastName,
        preferredName: row.preferredName ?? undefined
      })),
      total: rows.rows.length
    };
  }
  public async create(patient: Patient): Promise<Patient> {
    await this.database.beginTransaction();

    try {
      await this.database.execute(
        `INSERT INTO HIS.Patients
         (
           id,
           tenant_id,
           person_id,
           medical_record_number,
           patient_number,
           status,
           registration_date,
           deceased_date,
           preferred_language,
           preferred_contact_method,
           created_at,
           updated_at,
           version
         )
         VALUES
         (
           @id,
           @tenantId,
           @personId,
           @medicalRecordNumber,
           @patientNumber,
           @status,
           @registrationDate,
           @deceasedDate,
           @preferredLanguage,
           @preferredContactMethod,
           @createdAt,
           @updatedAt,
           @version
         )`,
        [
          { name: "id", value: patient.id },
          { name: "tenantId", value: patient.tenantId },
          { name: "personId", value: patient.personId },
          {
            name: "medicalRecordNumber",
            value: patient.medicalRecordNumber
          },
          {
            name: "patientNumber",
            value: patient.patientNumber
          },
          { name: "status", value: patient.status },
          {
            name: "registrationDate",
            value: patient.registrationDate
          },
          {
            name: "deceasedDate",
            value: patient.deceasedDate ?? null
          },
          {
            name: "preferredLanguage",
            value:
              patient.communicationPreferences?.preferredLanguage ??
              null
          },
          {
            name: "preferredContactMethod",
            value:
              patient.communicationPreferences
                ?.preferredContactMethod ?? null
          },
          { name: "createdAt", value: patient.createdAt },
          { name: "updatedAt", value: patient.updatedAt },
          { name: "version", value: patient.version }
        ]
      );

      for (const personId of patient.emergencyContactPersonIds) {
        await this.database.execute(
          `INSERT INTO HIS.PatientEmergencyContacts
           (
             tenant_id,
             patient_id,
             person_id
           )
           VALUES
           (
             @tenantId,
             @patientId,
             @personId
           )`,
          [
            { name: "tenantId", value: patient.tenantId },
            { name: "patientId", value: patient.id },
            { name: "personId", value: personId }
          ]
        );
      }

      await this.database.commitTransaction();

      return patient;
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  public async update(patient: Patient): Promise<Patient> {
    const nextVersion = patient.version + 1;

    await this.database.beginTransaction();

    try {
      const rows = await this.database.execute(
        `UPDATE HIS.Patients
         SET
           person_id = @personId,
           medical_record_number = @medicalRecordNumber,
           patient_number = @patientNumber,
           status = @status,
           registration_date = @registrationDate,
           deceased_date = @deceasedDate,
           preferred_language = @preferredLanguage,
           preferred_contact_method = @preferredContactMethod,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          { name: "personId", value: patient.personId },
          {
            name: "medicalRecordNumber",
            value: patient.medicalRecordNumber
          },
          {
            name: "patientNumber",
            value: patient.patientNumber
          },
          { name: "status", value: patient.status },
          {
            name: "registrationDate",
            value: patient.registrationDate
          },
          {
            name: "deceasedDate",
            value: patient.deceasedDate ?? null
          },
          {
            name: "preferredLanguage",
            value:
              patient.communicationPreferences?.preferredLanguage ??
              null
          },
          {
            name: "preferredContactMethod",
            value:
              patient.communicationPreferences
                ?.preferredContactMethod ?? null
          },
          { name: "updatedAt", value: patient.updatedAt },
          { name: "nextVersion", value: nextVersion },
          { name: "id", value: patient.id },
          { name: "tenantId", value: patient.tenantId },
          { name: "version", value: patient.version }
        ]
      );

      if (rows !== 1) {
        throw new Error("Patient was modified or does not exist");
      }

      await this.database.execute(
        `DELETE FROM HIS.PatientEmergencyContacts
         WHERE patient_id = @patientId
           AND tenant_id = @tenantId`,
        [
          { name: "patientId", value: patient.id },
          { name: "tenantId", value: patient.tenantId }
        ]
      );

      for (const personId of patient.emergencyContactPersonIds) {
        await this.database.execute(
          `INSERT INTO HIS.PatientEmergencyContacts
           (
             tenant_id,
             patient_id,
             person_id
           )
           VALUES
           (
             @tenantId,
             @patientId,
             @personId
           )`,
          [
            { name: "tenantId", value: patient.tenantId },
            { name: "patientId", value: patient.id },
            { name: "personId", value: personId }
          ]
        );
      }

      await this.database.commitTransaction();

      return {
        ...patient,
        version: nextVersion
      };
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }
}

interface PatientListRow {
  id: string;
  personId: string;
  patientNumber: string;
  medicalRecordNumber: string;
  status: Patient["status"];
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
}
interface PatientRow {
  id: string;
  tenantId: string;
  personId: string;
  medicalRecordNumber: string;
  patientNumber: string;
  status: Patient["status"];
  registrationDate: Date;
  deceasedDate: Date | null;
  preferredLanguage: string | null;
  preferredContactMethod:
    | "EMAIL"
    | "PHONE"
    | "SMS"
    | "MAIL"
    | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

interface PatientEmergencyContactRow {
  personId: string;
}

