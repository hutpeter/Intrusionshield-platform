import type {
  IDatabaseProvider
} from "@intrusionshield/database";

import type {
  BedAssignment
} from "@intrusionshield/his";

export interface BedAssignmentRepository {
  findByAdmissionId(
    admissionId: string,
    tenantId: string
  ): Promise<readonly BedAssignment[]>;

  findActiveByAdmissionId(
    admissionId: string,
    tenantId: string
  ): Promise<BedAssignment | null>;
}

export class SqlBedAssignmentRepository
implements BedAssignmentRepository {
  public constructor(
    private readonly database:
      IDatabaseProvider
  ) {}

  public async findByAdmissionId(
    admissionId: string,
    tenantId: string
  ): Promise<readonly BedAssignment[]> {
    const result =
      await this.database.query<
        BedAssignmentRow
      >(
        `${this.selectSql()}
         WHERE assignment.admission_id =
               @admissionId
           AND assignment.tenant_id =
               @tenantId
         ORDER BY
           assignment.assigned_at ASC,
           assignment.id ASC`,
        [
          {
            name: "admissionId",
            value: admissionId
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

  public async findActiveByAdmissionId(
    admissionId: string,
    tenantId: string
  ): Promise<BedAssignment | null> {
    const result =
      await this.database.query<
        BedAssignmentRow
      >(
        `${this.selectSql()}
         WHERE assignment.admission_id =
               @admissionId
           AND assignment.tenant_id =
               @tenantId
           AND assignment.status = 'ACTIVE'`,
        [
          {
            name: "admissionId",
            value: admissionId
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

  private selectSql(): string {
    return `SELECT
              assignment.id,
              assignment.tenant_id
                AS tenantId,
              assignment.admission_id
                AS admissionId,
              assignment.encounter_id
                AS encounterId,
              assignment.patient_id
                AS patientId,
              assignment.facility_id
                AS facilityId,
              assignment.bed_id AS bedId,
              assignment.assignment_type
                AS assignmentType,
              assignment.status,
              assignment.assigned_at
                AS assignedAt,
              assignment.released_at
                AS releasedAt,
              assignment.release_reason
                AS releaseReason,
              assignment.notes,
              assignment.created_at
                AS createdAt,
              assignment.updated_at
                AS updatedAt,
              assignment.version
            FROM HIS.BedAssignments assignment`;
  }

  private toDomain(
    row: BedAssignmentRow
  ): BedAssignment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      admissionId: row.admissionId,
      encounterId: row.encounterId,
      patientId: row.patientId,
      facilityId: row.facilityId,
      bedId: row.bedId,
      assignmentType:
        row.assignmentType,
      status: row.status,
      assignedAt: row.assignedAt,
      releasedAt:
        row.releasedAt ?? undefined,
      releaseReason:
        row.releaseReason ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version
    };
  }
}

interface BedAssignmentRow {
  id: string;
  tenantId: string;
  admissionId: string;
  encounterId: string;
  patientId: string;
  facilityId: string;
  bedId: string;
  assignmentType:
    BedAssignment["assignmentType"];
  status:
    BedAssignment["status"];
  assignedAt: Date;
  releasedAt: Date | null;
  releaseReason:
    BedAssignment["releaseReason"] | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
