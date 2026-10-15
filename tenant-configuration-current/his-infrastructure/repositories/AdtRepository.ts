import type {
  IDatabaseProvider
} from "@intrusionshield/database";

export interface AssignBedCommand {
  id: string;
  tenantId: string;
  admissionId: string;
  bedId: string;
  assignedAt: Date;
  notes?: string;
}

export interface TransferCommand {
  newAssignmentId: string;
  tenantId: string;
  admissionId: string;
  destinationBedId: string;
  transferredAt: Date;
  notes?: string;
}

export interface DischargeCommand {
  tenantId: string;
  admissionId: string;
  dischargedAt: Date;
  dischargeDisposition: string;
  dischargeNotes?: string;
  admissionVersion: number;
}

export interface AdtRepository {
  assignBed(
    command: AssignBedCommand
  ): Promise<void>;

  transfer(
    command: TransferCommand
  ): Promise<void>;

  discharge(
    command: DischargeCommand
  ): Promise<void>;
}

export class SqlAdtRepository
implements AdtRepository {
  public constructor(
    private readonly database:
      IDatabaseProvider
  ) {}

  public async assignBed(
    command: AssignBedCommand
  ): Promise<void> {
    await this.database.execute(
      `
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @patientId UNIQUEIDENTIFIER;
  DECLARE @encounterId UNIQUEIDENTIFIER;
  DECLARE @facilityId UNIQUEIDENTIFIER;

  SELECT
    @patientId = patient_id,
    @encounterId = encounter_id,
    @facilityId = facility_id
  FROM HIS.Admissions WITH (
    UPDLOCK,
    HOLDLOCK
  )
  WHERE id = @admissionId
    AND tenant_id = @tenantId
    AND status = 'ACTIVE';

  IF @patientId IS NULL
    THROW 51000,
      'Active admission not found.',
      1;

  IF EXISTS (
    SELECT 1
    FROM HIS.BedAssignments WITH (
      UPDLOCK,
      HOLDLOCK
    )
    WHERE tenant_id = @tenantId
      AND admission_id = @admissionId
      AND status = 'ACTIVE'
  )
    THROW 51001,
      'Admission already has an active bed assignment.',
      1;

  IF NOT EXISTS (
    SELECT 1
    FROM HIS.Beds WITH (
      UPDLOCK,
      HOLDLOCK
    )
    WHERE id = @bedId
      AND tenant_id = @tenantId
      AND facility_id = @facilityId
      AND status = 'ACTIVE'
      AND operational_status = 'AVAILABLE'
  )
    THROW 51002,
      'Bed is not available for this admission.',
      1;

  INSERT INTO HIS.BedAssignments
  (
    id,
    tenant_id,
    admission_id,
    encounter_id,
    patient_id,
    facility_id,
    bed_id,
    assignment_type,
    status,
    assigned_at,
    released_at,
    release_reason,
    notes,
    created_at,
    updated_at,
    version
  )
  VALUES
  (
    @id,
    @tenantId,
    @admissionId,
    @encounterId,
    @patientId,
    @facilityId,
    @bedId,
    'ADMISSION',
    'ACTIVE',
    @assignedAt,
    NULL,
    NULL,
    @notes,
    @assignedAt,
    @assignedAt,
    1
  );

  UPDATE HIS.Beds
  SET
    operational_status = 'OCCUPIED',
    updated_at = @assignedAt,
    version = version + 1
  WHERE id = @bedId
    AND tenant_id = @tenantId;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
      `,
      [
        {
          name: "id",
          value: command.id
        },
        {
          name: "tenantId",
          value: command.tenantId
        },
        {
          name: "admissionId",
          value: command.admissionId
        },
        {
          name: "bedId",
          value: command.bedId
        },
        {
          name: "assignedAt",
          value: command.assignedAt
        },
        {
          name: "notes",
          value: command.notes ?? null
        }
      ]
    );
  }

  public async transfer(
    command: TransferCommand
  ): Promise<void> {
    await this.database.execute(
      `
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @patientId UNIQUEIDENTIFIER;
  DECLARE @encounterId UNIQUEIDENTIFIER;
  DECLARE @facilityId UNIQUEIDENTIFIER;
  DECLARE @currentAssignmentId UNIQUEIDENTIFIER;
  DECLARE @currentBedId UNIQUEIDENTIFIER;

  SELECT
    @patientId = patient_id,
    @encounterId = encounter_id,
    @facilityId = facility_id
  FROM HIS.Admissions WITH (
    UPDLOCK,
    HOLDLOCK
  )
  WHERE id = @admissionId
    AND tenant_id = @tenantId
    AND status = 'ACTIVE';

  IF @patientId IS NULL
    THROW 51010,
      'Active admission not found.',
      1;

  SELECT
    @currentAssignmentId = id,
    @currentBedId = bed_id
  FROM HIS.BedAssignments WITH (
    UPDLOCK,
    HOLDLOCK
  )
  WHERE tenant_id = @tenantId
    AND admission_id = @admissionId
    AND status = 'ACTIVE';

  IF @currentAssignmentId IS NULL
    THROW 51011,
      'Admission does not have an active bed assignment.',
      1;

  IF @currentBedId = @destinationBedId
    THROW 51012,
      'Destination bed is already assigned to this admission.',
      1;

  IF NOT EXISTS (
    SELECT 1
    FROM HIS.Beds WITH (
      UPDLOCK,
      HOLDLOCK
    )
    WHERE id = @destinationBedId
      AND tenant_id = @tenantId
      AND facility_id = @facilityId
      AND status = 'ACTIVE'
      AND operational_status = 'AVAILABLE'
  )
    THROW 51013,
      'Destination bed is not available.',
      1;

  UPDATE HIS.BedAssignments
  SET
    status = 'RELEASED',
    released_at = @transferredAt,
    release_reason = 'TRANSFER',
    updated_at = @transferredAt,
    version = version + 1
  WHERE id = @currentAssignmentId
    AND tenant_id = @tenantId
    AND status = 'ACTIVE';

  UPDATE HIS.Beds
  SET
    operational_status = 'CLEANING',
    updated_at = @transferredAt,
    version = version + 1
  WHERE id = @currentBedId
    AND tenant_id = @tenantId;

  INSERT INTO HIS.BedAssignments
  (
    id,
    tenant_id,
    admission_id,
    encounter_id,
    patient_id,
    facility_id,
    bed_id,
    assignment_type,
    status,
    assigned_at,
    released_at,
    release_reason,
    notes,
    created_at,
    updated_at,
    version
  )
  VALUES
  (
    @newAssignmentId,
    @tenantId,
    @admissionId,
    @encounterId,
    @patientId,
    @facilityId,
    @destinationBedId,
    'TRANSFER',
    'ACTIVE',
    @transferredAt,
    NULL,
    NULL,
    @notes,
    @transferredAt,
    @transferredAt,
    1
  );

  UPDATE HIS.Beds
  SET
    operational_status = 'OCCUPIED',
    updated_at = @transferredAt,
    version = version + 1
  WHERE id = @destinationBedId
    AND tenant_id = @tenantId;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
      `,
      [
        {
          name: "newAssignmentId",
          value: command.newAssignmentId
        },
        {
          name: "tenantId",
          value: command.tenantId
        },
        {
          name: "admissionId",
          value: command.admissionId
        },
        {
          name: "destinationBedId",
          value: command.destinationBedId
        },
        {
          name: "transferredAt",
          value: command.transferredAt
        },
        {
          name: "notes",
          value: command.notes ?? null
        }
      ]
    );
  }

  public async discharge(
    command: DischargeCommand
  ): Promise<void> {
    await this.database.execute(
      `
SET XACT_ABORT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @currentAssignmentId UNIQUEIDENTIFIER;
  DECLARE @currentBedId UNIQUEIDENTIFIER;

  IF NOT EXISTS (
    SELECT 1
    FROM HIS.Admissions WITH (
      UPDLOCK,
      HOLDLOCK
    )
    WHERE id = @admissionId
      AND tenant_id = @tenantId
      AND status = 'ACTIVE'
      AND version = @admissionVersion
  )
    THROW 51020,
      'Admission was modified, is not active, or does not exist.',
      1;

  SELECT
    @currentAssignmentId = id,
    @currentBedId = bed_id
  FROM HIS.BedAssignments WITH (
    UPDLOCK,
    HOLDLOCK
  )
  WHERE tenant_id = @tenantId
    AND admission_id = @admissionId
    AND status = 'ACTIVE';

  IF @currentAssignmentId IS NOT NULL
  BEGIN
    UPDATE HIS.BedAssignments
    SET
      status = 'RELEASED',
      released_at = @dischargedAt,
      release_reason = 'DISCHARGE',
      updated_at = @dischargedAt,
      version = version + 1
    WHERE id = @currentAssignmentId
      AND tenant_id = @tenantId;

    UPDATE HIS.Beds
    SET
      operational_status = 'CLEANING',
      updated_at = @dischargedAt,
      version = version + 1
    WHERE id = @currentBedId
      AND tenant_id = @tenantId;
  END;

  UPDATE HIS.Admissions
  SET
    status = 'DISCHARGED',
    discharged_at = @dischargedAt,
    discharge_disposition =
      @dischargeDisposition,
    discharge_notes = @dischargeNotes,
    updated_at = @dischargedAt,
    version = version + 1
  WHERE id = @admissionId
    AND tenant_id = @tenantId
    AND version = @admissionVersion;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  THROW;
END CATCH;
      `,
      [
        {
          name: "tenantId",
          value: command.tenantId
        },
        {
          name: "admissionId",
          value: command.admissionId
        },
        {
          name: "dischargedAt",
          value: command.dischargedAt
        },
        {
          name: "dischargeDisposition",
          value:
            command.dischargeDisposition
        },
        {
          name: "dischargeNotes",
          value:
            command.dischargeNotes ?? null
        },
        {
          name: "admissionVersion",
          value: command.admissionVersion
        }
      ]
    );
  }
}
