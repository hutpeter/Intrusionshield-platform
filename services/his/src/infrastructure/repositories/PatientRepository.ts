import type { IDatabaseProvider } from "@intrusionshield/database";
import type { Patient } from "@intrusionshield/his";

export interface PatientRepository {
  findById(id: string, tenantId: string): Promise<Patient | null>;
  create(patient: Patient): Promise<Patient>;
  update(patient: Patient): Promise<Patient>;
}

export class SqlPatientRepository implements PatientRepository {
  public constructor(private readonly database: IDatabaseProvider) {}

  public async findById(id: string, tenantId: string): Promise<Patient | null> {
    const result = await this.database.query<PatientRow>(
      `SELECT id, tenant_id AS tenantId, person_id AS personId,
              medical_record_number AS medicalRecordNumber, patient_number AS patientNumber,
              status, registration_date AS registrationDate, deceased_date AS deceasedDate,
              preferred_language AS preferredLanguage, created_at AS createdAt,
              updated_at AS updatedAt, version
       FROM HIS.Patients
       WHERE id = @id AND tenant_id = @tenantId`,
      [{ name: "id", value: id }, { name: "tenantId", value: tenantId }]
    );
    const row = result.rows[0];
    if (!row) return null;

    const contacts = await this.database.query<{ personId: string }>(
      `SELECT person_id AS personId FROM HIS.PatientEmergencyContacts
       WHERE patient_id = @id AND tenant_id = @tenantId ORDER BY person_id`,
      [{ name: "id", value: id }, { name: "tenantId", value: tenantId }]
    );

    return { ...row, emergencyContactPersonIds: contacts.rows.map((item) => item.personId) };
  }

  public async create(patient: Patient): Promise<Patient> {
    await this.database.beginTransaction();
    try {
      await this.database.execute(
        `INSERT INTO HIS.Patients
         (id, tenant_id, person_id, medical_record_number, patient_number, status,
          registration_date, deceased_date, preferred_language, created_at, updated_at, version)
         VALUES (@id, @tenantId, @personId, @medicalRecordNumber, @patientNumber, @status,
                 @registrationDate, @deceasedDate, @preferredLanguage, @createdAt, @updatedAt, @version)`,
        [
          { name: "id", value: patient.id }, { name: "tenantId", value: patient.tenantId },
          { name: "personId", value: patient.personId }, { name: "medicalRecordNumber", value: patient.medicalRecordNumber },
          { name: "patientNumber", value: patient.patientNumber }, { name: "status", value: patient.status },
          { name: "registrationDate", value: patient.registrationDate }, { name: "deceasedDate", value: patient.deceasedDate ?? null },
          { name: "preferredLanguage", value: patient.preferredLanguage ?? null },
          { name: "createdAt", value: patient.createdAt }, { name: "updatedAt", value: patient.updatedAt },
          { name: "version", value: patient.version }
        ]
      );
      for (const personId of patient.emergencyContactPersonIds) {
        await this.database.execute(
          `INSERT INTO HIS.PatientEmergencyContacts (tenant_id, patient_id, person_id)
           VALUES (@tenantId, @patientId, @personId)`,
          [{ name: "tenantId", value: patient.tenantId }, { name: "patientId", value: patient.id }, { name: "personId", value: personId }]
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
    const rows = await this.database.execute(
      `UPDATE HIS.Patients
       SET person_id = @personId, medical_record_number = @medicalRecordNumber,
           patient_number = @patientNumber, status = @status, registration_date = @registrationDate,
           deceased_date = @deceasedDate, preferred_language = @preferredLanguage,
           updated_at = @updatedAt, version = @nextVersion
       WHERE id = @id AND tenant_id = @tenantId AND version = @version`,
      [
        { name: "personId", value: patient.personId }, { name: "medicalRecordNumber", value: patient.medicalRecordNumber },
        { name: "patientNumber", value: patient.patientNumber }, { name: "status", value: patient.status },
        { name: "registrationDate", value: patient.registrationDate }, { name: "deceasedDate", value: patient.deceasedDate ?? null },
        { name: "preferredLanguage", value: patient.preferredLanguage ?? null }, { name: "updatedAt", value: patient.updatedAt },
        { name: "nextVersion", value: nextVersion }, { name: "id", value: patient.id },
        { name: "tenantId", value: patient.tenantId }, { name: "version", value: patient.version }
      ]
    );
    if (rows !== 1) throw new Error("Patient was modified or does not exist");
    return { ...patient, version: nextVersion };
  }
}

interface PatientRow {
  id: string; tenantId: string; personId: string; medicalRecordNumber: string;
  patientNumber: string; status: Patient["status"]; registrationDate: Date;
  deceasedDate?: Date; preferredLanguage?: string; createdAt: Date; updatedAt: Date; version: number;
}
