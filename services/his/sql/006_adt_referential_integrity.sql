SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

-- ============================================================
-- 006 - Athena ADT referential integrity hardening
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.Admissions')
      AND name = N'FK_HIS_Admissions_Patient'
)
BEGIN
    ALTER TABLE HIS.Admissions WITH CHECK
    ADD CONSTRAINT FK_HIS_Admissions_Patient
        FOREIGN KEY (tenant_id, patient_id)
        REFERENCES HIS.Patients (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.Admissions')
      AND name = N'FK_HIS_Admissions_Encounter'
)
BEGIN
    ALTER TABLE HIS.Admissions WITH CHECK
    ADD CONSTRAINT FK_HIS_Admissions_Encounter
        FOREIGN KEY (tenant_id, encounter_id)
        REFERENCES HIS.Encounters (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.Admissions')
      AND name = N'FK_HIS_Admissions_Facility'
)
BEGIN
    ALTER TABLE HIS.Admissions WITH CHECK
    ADD CONSTRAINT FK_HIS_Admissions_Facility
        FOREIGN KEY (tenant_id, facility_id)
        REFERENCES HIS.Facilities (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.Admissions')
      AND name = N'FK_HIS_Admissions_Practitioner'
)
BEGIN
    ALTER TABLE HIS.Admissions WITH CHECK
    ADD CONSTRAINT FK_HIS_Admissions_Practitioner
        FOREIGN KEY (tenant_id, admitting_practitioner_id)
        REFERENCES HIS.Practitioners (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.BedAssignments')
      AND name = N'FK_HIS_BedAssignments_Encounter'
)
BEGIN
    ALTER TABLE HIS.BedAssignments WITH CHECK
    ADD CONSTRAINT FK_HIS_BedAssignments_Encounter
        FOREIGN KEY (tenant_id, encounter_id)
        REFERENCES HIS.Encounters (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.BedAssignments')
      AND name = N'FK_HIS_BedAssignments_Patient'
)
BEGIN
    ALTER TABLE HIS.BedAssignments WITH CHECK
    ADD CONSTRAINT FK_HIS_BedAssignments_Patient
        FOREIGN KEY (tenant_id, patient_id)
        REFERENCES HIS.Patients (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.BedAssignments')
      AND name = N'FK_HIS_BedAssignments_Facility'
)
BEGIN
    ALTER TABLE HIS.BedAssignments WITH CHECK
    ADD CONSTRAINT FK_HIS_BedAssignments_Facility
        FOREIGN KEY (tenant_id, facility_id)
        REFERENCES HIS.Facilities (tenant_id, id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE parent_object_id = OBJECT_ID(N'HIS.BedAssignments')
      AND name = N'FK_HIS_BedAssignments_Bed'
)
BEGIN
    ALTER TABLE HIS.BedAssignments WITH CHECK
    ADD CONSTRAINT FK_HIS_BedAssignments_Bed
        FOREIGN KEY (tenant_id, bed_id)
        REFERENCES HIS.Beds (tenant_id, id);
END;
