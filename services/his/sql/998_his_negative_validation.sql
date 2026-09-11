SET NOCOUNT ON;
SET XACT_ABORT OFF;

DECLARE @TenantA UNIQUEIDENTIFIER = NEWID();
DECLARE @TenantB UNIQUEIDENTIFIER = NEWID();

DECLARE @PersonA UNIQUEIDENTIFIER = NEWID();
DECLARE @PersonB UNIQUEIDENTIFIER = NEWID();

DECLARE @PatientA UNIQUEIDENTIFIER = NEWID();
DECLARE @PractitionerA UNIQUEIDENTIFIER = NEWID();
DECLARE @FacilityA UNIQUEIDENTIFIER = NEWID();

BEGIN TRANSACTION;

PRINT '===== HIS NEGATIVE / SECURITY VALIDATION =====';
PRINT 'Tenant A: ' + CONVERT(VARCHAR(36), @TenantA);
PRINT 'Tenant B: ' + CONVERT(VARCHAR(36), @TenantB);

-- ============================================================
-- Establish valid records for both tenants
-- ============================================================

INSERT INTO HIS.Persons
(
    id,
    tenant_id,
    first_name,
    last_name,
    sex,
    status,
    created_at,
    updated_at,
    version
)
VALUES
(
    @PersonA,
    @TenantA,
    N'Test',
    N'TenantA',
    N'UNKNOWN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

INSERT INTO HIS.Persons
(
    id,
    tenant_id,
    first_name,
    last_name,
    sex,
    status,
    created_at,
    updated_at,
    version
)
VALUES
(
    @PersonB,
    @TenantB,
    N'Test',
    N'TenantB',
    N'UNKNOWN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

PRINT 'PASS: Baseline persons created.';

-- ============================================================
-- TEST 1: Cross-tenant Patient -> Person reference
-- Expected: FOREIGN KEY violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Patients
    (
        id,
        tenant_id,
        person_id,
        medical_record_number,
        patient_number,
        status,
        registration_date,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        @PatientA,
        @TenantA,
        @PersonB,
        N'TEST-CROSS-MRN',
        N'TEST-CROSS-PATIENT',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51001, 'FAIL: Cross-tenant Patient -> Person reference was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51001
        THROW;

    PRINT 'PASS: Cross-tenant Patient -> Person reference rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 2: Cross-tenant Practitioner -> Person reference
-- Expected: FOREIGN KEY violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Practitioners
    (
        id,
        tenant_id,
        person_id,
        practitioner_number,
        practitioner_type,
        status,
        effective_from,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        @PractitionerA,
        @TenantA,
        @PersonB,
        N'TEST-CROSS-PRAC',
        N'PHYSICIAN',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51002, 'FAIL: Cross-tenant Practitioner -> Person reference was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51002
        THROW;

    PRINT 'PASS: Cross-tenant Practitioner -> Person reference rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- Create valid Patient and Practitioner for child-record tests
-- ============================================================

INSERT INTO HIS.Patients
(
    id,
    tenant_id,
    person_id,
    medical_record_number,
    patient_number,
    status,
    registration_date,
    created_at,
    updated_at,
    version
)
VALUES
(
    @PatientA,
    @TenantA,
    @PersonA,
    N'TEST-MRN-NEG-001',
    N'TEST-PATIENT-NEG-001',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

INSERT INTO HIS.Practitioners
(
    id,
    tenant_id,
    person_id,
    practitioner_number,
    practitioner_type,
    status,
    effective_from,
    created_at,
    updated_at,
    version
)
VALUES
(
    @PractitionerA,
    @TenantA,
    @PersonA,
    N'TEST-PRAC-NEG-001',
    N'PHYSICIAN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

-- ============================================================
-- TEST 3: Cross-tenant Practitioner License
-- Expected: FOREIGN KEY violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.PractitionerLicenses
    (
        tenant_id,
        practitioner_id,
        jurisdiction,
        license_number
    )
    VALUES
    (
        @TenantB,
        @PractitionerA,
        N'ON',
        N'TEST-CROSS-LICENSE'
    );

    THROW 51003, 'FAIL: Cross-tenant Practitioner License was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51003
        THROW;

    PRINT 'PASS: Cross-tenant Practitioner License rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 4: Cross-tenant Practitioner Specialty
-- Expected: FOREIGN KEY violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.PractitionerSpecialties
    (
        tenant_id,
        practitioner_id,
        specialty
    )
    VALUES
    (
        @TenantB,
        @PractitionerA,
        N'TEST-CROSS-SPECIALTY'
    );

    THROW 51004, 'FAIL: Cross-tenant Practitioner Specialty was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51004
        THROW;

    PRINT 'PASS: Cross-tenant Practitioner Specialty rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 5: Duplicate MRN within same tenant
-- Expected: UNIQUE constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Patients
    (
        id,
        tenant_id,
        person_id,
        medical_record_number,
        patient_number,
        status,
        registration_date,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        NEWID(),
        @TenantA,
        @PersonA,
        N'TEST-MRN-NEG-001',
        N'TEST-PATIENT-DUP-MRN',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51005, 'FAIL: Duplicate MRN within tenant was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51005
        THROW;

    PRINT 'PASS: Duplicate MRN within same tenant rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 6: Duplicate patient number within same tenant
-- Expected: UNIQUE constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Patients
    (
        id,
        tenant_id,
        person_id,
        medical_record_number,
        patient_number,
        status,
        registration_date,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        NEWID(),
        @TenantA,
        @PersonA,
        N'TEST-MRN-DUP-PATIENT',
        N'TEST-PATIENT-NEG-001',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51006, 'FAIL: Duplicate patient number within tenant was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51006
        THROW;

    PRINT 'PASS: Duplicate patient number within same tenant rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 7: Duplicate practitioner number within same tenant
-- Expected: UNIQUE constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Practitioners
    (
        id,
        tenant_id,
        person_id,
        practitioner_number,
        practitioner_type,
        status,
        effective_from,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        NEWID(),
        @TenantA,
        @PersonA,
        N'TEST-PRAC-NEG-001',
        N'PHYSICIAN',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51007, 'FAIL: Duplicate practitioner number was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51007
        THROW;

    PRINT 'PASS: Duplicate practitioner number within same tenant rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 8: Invalid Person status
-- Expected: CHECK constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Persons
    (
        id,
        tenant_id,
        first_name,
        last_name,
        sex,
        status,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        NEWID(),
        @TenantA,
        N'Invalid',
        N'Status',
        N'UNKNOWN',
        N'INVALID',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51008, 'FAIL: Invalid Person status was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51008
        THROW;

    PRINT 'PASS: Invalid Person status rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 9: Invalid Practitioner effective dates
-- Expected: CHECK constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Practitioners
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
        NEWID(),
        @TenantA,
        @PersonA,
        N'TEST-INVALID-DATES',
        N'PHYSICIAN',
        N'ACTIVE',
        '2026-01-01',
        '2025-01-01',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        1
    );

    THROW 51009, 'FAIL: Invalid Practitioner effective dates were accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51009
        THROW;

    PRINT 'PASS: Invalid Practitioner effective dates rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 10: Facility self-parenting
-- Expected: CHECK constraint violation
-- ============================================================

SET @FacilityA = NEWID();

INSERT INTO HIS.Facilities
(
    id,
    tenant_id,
    facility_type,
    code,
    name,
    status,
    created_at,
    updated_at,
    version
)
VALUES
(
    @FacilityA,
    @TenantA,
    N'HOSPITAL',
    N'TEST-SELF-PARENT',
    N'Self Parent Test',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

BEGIN TRY

    UPDATE HIS.Facilities
    SET parent_facility_id = @FacilityA
    WHERE tenant_id = @TenantA
      AND id = @FacilityA;

    THROW 51010, 'FAIL: Facility self-parenting was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51010
        THROW;

    PRINT 'PASS: Facility self-parenting rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- TEST 11: Invalid version
-- Expected: CHECK constraint violation
-- ============================================================

BEGIN TRY

    INSERT INTO HIS.Persons
    (
        id,
        tenant_id,
        first_name,
        last_name,
        sex,
        status,
        created_at,
        updated_at,
        version
    )
    VALUES
    (
        NEWID(),
        @TenantA,
        N'Invalid',
        N'Version',
        N'UNKNOWN',
        N'ACTIVE',
        SYSUTCDATETIME(),
        SYSUTCDATETIME(),
        0
    );

    THROW 51011, 'FAIL: Invalid version was accepted.', 1;

END TRY
BEGIN CATCH

    IF ERROR_NUMBER() = 51011
        THROW;

    PRINT 'PASS: Invalid version rejected.';
    PRINT '  Error: ' + ERROR_MESSAGE();

END CATCH;

-- ============================================================
-- Cleanup
-- ============================================================

ROLLBACK TRANSACTION;

PRINT 'PASS: All negative/security tests completed.';
PRINT 'PASS: Test transaction rolled back.';
PRINT '===== HIS NEGATIVE / SECURITY VALIDATION COMPLETE =====';
