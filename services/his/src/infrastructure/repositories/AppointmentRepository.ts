import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  Appointment,
  AppointmentConflictCriteria,
  AppointmentSearchCriteria
} from "@intrusionshield/his";

export interface AppointmentRepository {
  findById(
    id: string,
    tenantId: string
  ): Promise<Appointment | null>;

  search(
    criteria: AppointmentSearchCriteria
  ): Promise<Appointment[]>;

  create(
    appointment: Appointment
  ): Promise<Appointment>;

  update(
    appointment: Appointment
  ): Promise<Appointment>;

  hasConflict(
    criteria: AppointmentConflictCriteria
  ): Promise<boolean>;
}

export class SqlAppointmentRepository
  implements AppointmentRepository {
  public constructor(
    private readonly database:
      IDatabaseProvider
  ) {}

  public async findById(
    id: string,
    tenantId: string
  ): Promise<Appointment | null> {
    const result =
      await this.database.query<AppointmentRow>(
        `${this.selectSql()}
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
      ? this.mapRow(row)
      : null;
  }

  public async search(
    criteria: AppointmentSearchCriteria
  ): Promise<Appointment[]> {
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

    if (criteria.patientId) {
      where.push(
        "patient_id = @patientId"
      );

      parameters.push({
        name: "patientId",
        value: criteria.patientId
      });
    }

    if (criteria.practitionerId) {
      where.push(
        "practitioner_id = @practitionerId"
      );

      parameters.push({
        name: "practitionerId",
        value: criteria.practitionerId
      });
    }

    if (criteria.facilityId) {
      where.push(
        "facility_id = @facilityId"
      );

      parameters.push({
        name: "facilityId",
        value: criteria.facilityId
      });
    }

    if (criteria.clinicalLocationId) {
      where.push(
        "clinical_location_id = @clinicalLocationId"
      );

      parameters.push({
        name: "clinicalLocationId",
        value:
          criteria.clinicalLocationId
      });
    }

    if (criteria.status) {
      where.push(
        "status = @status"
      );

      parameters.push({
        name: "status",
        value: criteria.status
      });
    }

    if (criteria.from) {
      where.push(
        "scheduled_end > @from"
      );

      parameters.push({
        name: "from",
        value: criteria.from
      });
    }

    if (criteria.to) {
      where.push(
        "scheduled_start < @to"
      );

      parameters.push({
        name: "to",
        value: criteria.to
      });
    }

    const result =
      await this.database.query<AppointmentRow>(
        `${this.selectSql()}
         WHERE ${where.join(" AND ")}
         ORDER BY scheduled_start,
                  appointment_number`,
        parameters
      );

    return result.rows.map(
      (row) => this.mapRow(row)
    );
  }

  public async create(
    appointment: Appointment
  ): Promise<Appointment> {
    await this.database.execute(
      `INSERT INTO HIS.Appointments
       (
         id,
         tenant_id,
         patient_id,
         facility_id,
         practitioner_id,
         clinical_location_id,
         encounter_id,
         appointment_number,
         appointment_type,
         status,
         source,
         scheduled_start,
         scheduled_end,
         reason,
         notes,
         cancellation_reason,
         cancelled_at,
         checked_in_at,
         completed_at,
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
         @practitionerId,
         @clinicalLocationId,
         @encounterId,
         @appointmentNumber,
         @appointmentType,
         @status,
         @source,
         @scheduledStart,
         @scheduledEnd,
         @reason,
         @notes,
         @cancellationReason,
         @cancelledAt,
         @checkedInAt,
         @completedAt,
         @createdAt,
         @updatedAt,
         @version
       )`,
      this.parameters(appointment)
    );

    return appointment;
  }

  public async update(
    appointment: Appointment
  ): Promise<Appointment> {
    const nextVersion =
      appointment.version + 1;

    const rows =
      await this.database.execute(
        `UPDATE HIS.Appointments
         SET
           patient_id = @patientId,
           facility_id = @facilityId,
           practitioner_id = @practitionerId,
           clinical_location_id = @clinicalLocationId,
           encounter_id = @encounterId,
           appointment_number = @appointmentNumber,
           appointment_type = @appointmentType,
           status = @status,
           source = @source,
           scheduled_start = @scheduledStart,
           scheduled_end = @scheduledEnd,
           reason = @reason,
           notes = @notes,
           cancellation_reason = @cancellationReason,
           cancelled_at = @cancelledAt,
           checked_in_at = @checkedInAt,
           completed_at = @completedAt,
           updated_at = @updatedAt,
           version = @nextVersion
         WHERE id = @id
           AND tenant_id = @tenantId
           AND version = @version`,
        [
          ...this.parameters(
            appointment
          ),
          {
            name: "nextVersion",
            value: nextVersion
          }
        ]
      );

    if (rows !== 1) {
      throw new Error(
        "Appointment was modified or does not exist"
      );
    }

    return {
      ...appointment,
      version: nextVersion
    };
  }

  public async hasConflict(
    criteria: AppointmentConflictCriteria
  ): Promise<boolean> {
    if (
      !criteria.practitionerId &&
      !criteria.clinicalLocationId
    ) {
      return false;
    }

    const resources: string[] = [];

    const parameters: Array<{
      name: string;
      value: unknown;
    }> = [
      {
        name: "tenantId",
        value: criteria.tenantId
      },
      {
        name: "scheduledStart",
        value: criteria.scheduledStart
      },
      {
        name: "scheduledEnd",
        value: criteria.scheduledEnd
      }
    ];

    if (criteria.practitionerId) {
      resources.push(
        "practitioner_id = @practitionerId"
      );

      parameters.push({
        name: "practitionerId",
        value: criteria.practitionerId
      });
    }

    if (criteria.clinicalLocationId) {
      resources.push(
        "clinical_location_id = @clinicalLocationId"
      );

      parameters.push({
        name: "clinicalLocationId",
        value:
          criteria.clinicalLocationId
      });
    }

    let exclusion = "";

    if (criteria.excludeAppointmentId) {
      exclusion =
        "AND id <> @excludeAppointmentId";

      parameters.push({
        name: "excludeAppointmentId",
        value:
          criteria.excludeAppointmentId
      });
    }

    const result =
      await this.database.query<{
        conflictCount: number;
      }>(
        `SELECT
           COUNT_BIG(*) AS conflictCount
         FROM HIS.Appointments
         WHERE tenant_id = @tenantId
           AND status NOT IN (
             'CANCELLED',
             'NO_SHOW'
           )
           AND scheduled_start < @scheduledEnd
           AND scheduled_end > @scheduledStart
           AND (
             ${resources.join(" OR ")}
           )
           ${exclusion}`,
        parameters
      );

    return Number(
      result.rows[0]?.conflictCount ?? 0
    ) > 0;
  }

  private selectSql(): string {
    return `
      SELECT
        id,
        tenant_id AS tenantId,
        patient_id AS patientId,
        facility_id AS facilityId,
        practitioner_id AS practitionerId,
        clinical_location_id AS clinicalLocationId,
        encounter_id AS encounterId,
        appointment_number AS appointmentNumber,
        appointment_type AS appointmentType,
        status,
        source,
        scheduled_start AS scheduledStart,
        scheduled_end AS scheduledEnd,
        reason,
        notes,
        cancellation_reason AS cancellationReason,
        cancelled_at AS cancelledAt,
        checked_in_at AS checkedInAt,
        completed_at AS completedAt,
        created_at AS createdAt,
        updated_at AS updatedAt,
        version
      FROM HIS.Appointments`;
  }

  private parameters(
    appointment: Appointment
  ) {
    return [
      {
        name: "id",
        value: appointment.id
      },
      {
        name: "tenantId",
        value: appointment.tenantId
      },
      {
        name: "patientId",
        value: appointment.patientId
      },
      {
        name: "facilityId",
        value: appointment.facilityId
      },
      {
        name: "practitionerId",
        value:
          appointment.practitionerId ??
          null
      },
      {
        name: "clinicalLocationId",
        value:
          appointment.clinicalLocationId ??
          null
      },
      {
        name: "encounterId",
        value:
          appointment.encounterId ??
          null
      },
      {
        name: "appointmentNumber",
        value:
          appointment.appointmentNumber
      },
      {
        name: "appointmentType",
        value:
          appointment.appointmentType
      },
      {
        name: "status",
        value: appointment.status
      },
      {
        name: "source",
        value: appointment.source
      },
      {
        name: "scheduledStart",
        value:
          appointment.scheduledStart
      },
      {
        name: "scheduledEnd",
        value:
          appointment.scheduledEnd
      },
      {
        name: "reason",
        value:
          appointment.reason ?? null
      },
      {
        name: "notes",
        value:
          appointment.notes ?? null
      },
      {
        name: "cancellationReason",
        value:
          appointment.cancellationReason ??
          null
      },
      {
        name: "cancelledAt",
        value:
          appointment.cancelledAt ??
          null
      },
      {
        name: "checkedInAt",
        value:
          appointment.checkedInAt ??
          null
      },
      {
        name: "completedAt",
        value:
          appointment.completedAt ??
          null
      },
      {
        name: "createdAt",
        value: appointment.createdAt
      },
      {
        name: "updatedAt",
        value: appointment.updatedAt
      },
      {
        name: "version",
        value: appointment.version
      }
    ];
  }

  private mapRow(
    row: AppointmentRow
  ): Appointment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      facilityId: row.facilityId,

      practitionerId:
        row.practitionerId ??
        undefined,

      clinicalLocationId:
        row.clinicalLocationId ??
        undefined,

      encounterId:
        row.encounterId ??
        undefined,

      appointmentNumber:
        row.appointmentNumber,

      appointmentType:
        row.appointmentType,

      status: row.status,
      source: row.source,

      scheduledStart:
        row.scheduledStart,

      scheduledEnd:
        row.scheduledEnd,

      reason:
        row.reason ?? undefined,

      notes:
        row.notes ?? undefined,

      cancellationReason:
        row.cancellationReason ??
        undefined,

      cancelledAt:
        row.cancelledAt ?? undefined,

      checkedInAt:
        row.checkedInAt ?? undefined,

      completedAt:
        row.completedAt ?? undefined,

      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface AppointmentRow {
  id: string;
  tenantId: string;

  patientId: string;
  facilityId: string;

  practitionerId?: string | null;
  clinicalLocationId?: string | null;
  encounterId?: string | null;

  appointmentNumber: string;

  appointmentType:
    Appointment["appointmentType"];

  status:
    Appointment["status"];

  source:
    Appointment["source"];

  scheduledStart: Date;
  scheduledEnd: Date;

  reason?: string | null;
  notes?: string | null;

  cancellationReason?: string | null;
  cancelledAt?: Date | null;

  checkedInAt?: Date | null;
  completedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
  version: number;
}
