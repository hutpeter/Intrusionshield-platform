SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @TenantId uniqueidentifier =
    '11111111-1111-4111-8111-111111111111';

DECLARE @Now datetime2 =
    SYSUTCDATETIME();

DECLARE @Mappings TABLE
(
    person_identifier nvarchar(100) NOT NULL,
    facility_code nvarchar(100) NOT NULL,
    affiliation_type nvarchar(30) NOT NULL
);

INSERT INTO @Mappings
(
    person_identifier,
    facility_code,
    affiliation_type
)
VALUES
(
    N'PER-100001',
    N'CENTRAL-HOSP',
    N'PATIENT_CARE'
),
(
    N'PER-100002',
    N'CENTRAL-HOSP',
    N'PRACTITIONER_ASSIGNMENT'
),
(
    N'PER-100003',
    N'WESTSIDE-MED',
    N'PATIENT_CARE'
),
(
    N'PER-100004',
    N'NORTH-CLINIC',
    N'GENERAL'
),
(
    N'PER-100005',
    N'CENTRAL-HOSP',
    N'PRACTITIONER_ASSIGNMENT'
);

DECLARE @Resolved TABLE
(
    person_id uniqueidentifier NOT NULL,
    facility_id uniqueidentifier NOT NULL,
    person_identifier nvarchar(100) NOT NULL,
    facility_code nvarchar(100) NOT NULL,
    affiliation_type nvarchar(30) NOT NULL
);

INSERT INTO @Resolved
(
    person_id,
    facility_id,
    person_identifier,
    facility_code,
    affiliation_type
)
SELECT
    p.id,
    f.id,
    m.person_identifier,
    m.facility_code,
    m.affiliation_type
FROM @Mappings m
INNER JOIN HIS.PersonIdentifiers pi
    ON pi.tenant_id = @TenantId
   AND pi.identifier_value =
       m.person_identifier
INNER JOIN HIS.Persons p
    ON p.id = pi.person_id
   AND p.tenant_id = pi.tenant_id
INNER JOIN HIS.Facilities f
    ON f.tenant_id = @TenantId
   AND f.code = m.facility_code;

IF
(
    SELECT COUNT(*)
    FROM @Resolved
) <> 5
BEGIN
    SELECT
        m.person_identifier,
        m.facility_code,
        m.affiliation_type,
        p.id AS resolved_person_id,
        f.id AS resolved_facility_id
    FROM @Mappings m
    LEFT JOIN HIS.PersonIdentifiers pi
        ON pi.tenant_id = @TenantId
       AND pi.identifier_value =
           m.person_identifier
    LEFT JOIN HIS.Persons p
        ON p.id = pi.person_id
       AND p.tenant_id = pi.tenant_id
    LEFT JOIN HIS.Facilities f
        ON f.tenant_id = @TenantId
       AND f.code = m.facility_code;

    THROW 50001,
        'Unable to resolve all Person/Facility seed mappings.',
        1;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO HIS.PersonFacilityAffiliations
    (
        id,
        tenant_id,
        person_id,
        facility_id,
        affiliation_type,
        is_primary,
        effective_from,
        effective_until,
        created_at,
        updated_at,
        version
    )
    SELECT
        NEWID(),
        @TenantId,
        r.person_id,
        r.facility_id,
        r.affiliation_type,
        CAST(1 AS bit),
        @Now,
        NULL,
        @Now,
        @Now,
        1
    FROM @Resolved r
    WHERE NOT EXISTS
    (
        SELECT 1
        FROM HIS.PersonFacilityAffiliations existing
        WHERE existing.tenant_id =
              @TenantId
          AND existing.person_id =
              r.person_id
          AND existing.facility_id =
              r.facility_id
          AND existing.affiliation_type =
              r.affiliation_type
          AND existing.effective_until IS NULL
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;

SELECT
    p.first_name AS firstName,
    p.last_name AS lastName,
    pi.identifier_value AS personIdentifier,
    f.code AS facilityCode,
    f.name AS facilityName,
    pfa.affiliation_type AS affiliationType,
    pfa.is_primary AS isPrimary,
    pfa.effective_from AS effectiveFrom
FROM HIS.PersonFacilityAffiliations pfa
INNER JOIN HIS.Persons p
    ON p.id = pfa.person_id
   AND p.tenant_id = pfa.tenant_id
INNER JOIN HIS.Facilities f
    ON f.id = pfa.facility_id
   AND f.tenant_id = pfa.tenant_id
OUTER APPLY
(
    SELECT TOP (1)
        identifier_value
    FROM HIS.PersonIdentifiers identifier
    WHERE identifier.person_id = p.id
      AND identifier.tenant_id = p.tenant_id
    ORDER BY
        identifier.system_name,
        identifier.identifier_value
) pi
WHERE pfa.tenant_id = @TenantId
  AND pfa.effective_until IS NULL
ORDER BY
    p.last_name,
    p.first_name;