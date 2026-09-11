SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @TenantA UNIQUEIDENTIFIER = NEWID();
DECLARE @TenantB UNIQUEIDENTIFIER = NEWID();

DECLARE @PersonA UNIQUEIDENTIFIER = NEWID();
DECLARE @PersonB UNIQUEIDENTIFIER = NEWID();

DECLARE @PatientA UNIQUEIDENTIFIER = NEWID();
DECLARE @PractitionerA UNIQUEIDENTIFIER = NEWID();
DECLARE @FacilityA UNIQUEIDENTIFIER = NEWID();

BEGIN TRANSACTION;

PRINT '===== HIS DATABASE BEHAVIOR TEST =====';
PRINT 'Tenant A: ' + CONVERT(VARCHAR(36), @TenantA);
PRINT 'Tenant B: ' + CONVERT(VARCHAR(36), @TenantB);

-- ============================================================
-- 1. Create Person A in Tenant A
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
    N'Integration',
    N'TestA',
    N'UNKNOWN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

-- ============================================================
-- 2. Create Person B in Tenant B
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
    @PersonB,
    @TenantB,
    N'Integration',
    N'TestB',
    N'UNKNOWN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

-- ============================================================
-- 3. Same identifier value allowed across tenants
-- ============================================================

INSERT INTO HIS.PersonIdentifiers
(
    tenant_id,
    person_id,
    system_name,
    identifier_value
)
VALUES
(
    @TenantA,
    @PersonA,
    N'TEST',
    N'SAME-VALUE'
);

INSERT INTO HIS.PersonIdentifiers
(
    tenant_id,
    person_id,
    system_name,
    identifier_value
)
VALUES
(
    @TenantB,
    @PersonB,
    N'TEST',
    N'SAME-VALUE'
);

PRINT 'PASS: Same person identifier allowed across tenants.';

-- ============================================================
-- 4. Create Patient A
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
    N'TEST-MRN-001',
    N'TEST-PATIENT-001',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

PRINT 'PASS: Patient created for Tenant A.';

-- ============================================================
-- 5. Create Practitioner A
-- ============================================================

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
    N'TEST-PRAC-001',
    N'PHYSICIAN',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

PRINT 'PASS: Practitioner created for Tenant A.';

-- ============================================================
-- 6. Create Practitioner child records
-- ============================================================

INSERT INTO HIS.PractitionerLicenses
(
    tenant_id,
    practitioner_id,
    jurisdiction,
    license_number
)
VALUES
(
    @TenantA,
    @PractitionerA,
    N'ON',
    N'TEST-LICENSE-001'
);

INSERT INTO HIS.PractitionerSpecialties
(
    tenant_id,
    practitioner_id,
    specialty
)
VALUES
(
    @TenantA,
    @PractitionerA,
    N'TEST-MEDICINE'
);

PRINT 'PASS: Practitioner license and specialty created.';

-- ============================================================
-- 7. Create Facility A
-- ============================================================

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
    N'TEST-FACILITY-001',
    N'Integration Test Facility',
    N'ACTIVE',
    SYSUTCDATETIME(),
    SYSUTCDATETIME(),
    1
);

PRINT 'PASS: Facility created.';

-- ============================================================
-- 8. Verify row counts
-- ============================================================

IF (SELECT COUNT(*) FROM HIS.Persons WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A person count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.PersonIdentifiers WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A identifier count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.Patients WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A patient count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.Practitioners WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A practitioner count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.PractitionerLicenses WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A license count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.PractitionerSpecialties WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A specialty count incorrect.', 1;

IF (SELECT COUNT(*) FROM HIS.Facilities WHERE tenant_id = @TenantA) <> 1
    THROW 51000, 'FAIL: Tenant A facility count incorrect.', 1;

PRINT 'PASS: All expected Tenant A records exist.';

-- ============================================================
-- 9. Roll back test data
-- ============================================================

ROLLBACK TRANSACTION;

PRINT 'PASS: Test transaction rolled back.';
PRINT '===== HIS DATABASE BEHAVIOR TEST COMPLETE =====';
