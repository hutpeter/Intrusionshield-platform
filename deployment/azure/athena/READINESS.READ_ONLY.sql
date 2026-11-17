/* Local SQL Server metadata inventory for Athena Azure preparation.
   Run with sqlcmd -E -N -I -b against the explicitly selected application DB.
   No application rows, credential hashes, module definitions or secrets are read.
   No permanent database objects or application data are changed.
   This inventory is NOT a complete Azure SQL compatibility certification. */
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
    THROW 50000,'Select the Athena application database explicitly.',1;

SELECT DB_NAME() AS DatabaseName,
       CONVERT(nvarchar(100),SERVERPROPERTY('ProductVersion')) AS SqlVersion,
       CONVERT(nvarchar(100),SERVERPROPERTY('Edition')) AS SqlEdition,
       d.compatibility_level AS CompatibilityLevel,
       d.collation_name AS DatabaseCollation,
       d.is_read_only AS IsReadOnly
FROM sys.databases d WHERE d.database_id=DB_ID();

SELECT N'Allocated database files (not a service tier recommendation)' AS SizeDescription,
       CONVERT(decimal(18,2),SUM(CONVERT(bigint,size))*8.0/1024) AS AllocatedMB
FROM sys.database_files;

SELECT s.name AS SchemaName, COUNT(*) AS TableCount,
       CASE WHEN s.name IN(N'Identity',N'Authentication',N'EIS',N'Platform',N'HIS')
            THEN N'Athena candidate; review dependencies and data scope'
            ELSE N'Outside initial Athena scope; review separately' END AS MigrationScope
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
WHERE t.is_ms_shipped=0
GROUP BY s.name ORDER BY s.name;

/* Empty output means these named runtime prerequisites exist. This does not
   verify every column, constraint, schema version or product workflow. */
SELECT required.TableName AS MissingRequiredTable
FROM (VALUES
 (N'Identity.Identities'),(N'Identity.Users'),(N'Identity.Roles'),
 (N'Identity.Permissions'),(N'Identity.RolePermissions'),(N'Identity.IdentityRoles'),
 (N'Identity.PlatformRoleAssignments'),(N'Identity.UserAdministration'),
 (N'Identity.AccountAdministrationAudit'),(N'Identity.AuthorizationAudit'),
 (N'Authentication.Credentials'),(N'Authentication.AccountSetupTokens'),
 (N'EIS.TenantConfigurations'),(N'Platform.Tenants'),
 (N'Platform.TenantProvisioningAudit'),(N'Platform.EventOutbox'),
 (N'HIS.Persons'),(N'HIS.PersonIdentifiers'),(N'HIS.PersonAddresses'),
 (N'HIS.Patients'),(N'HIS.PatientEmergencyContacts'),(N'HIS.Practitioners'),
 (N'HIS.PractitionerLicenses'),(N'HIS.PractitionerSpecialties'),(N'HIS.Facilities'),
 (N'HIS.PersonFacilityAffiliations'),(N'HIS.PatientRegistrations'),(N'HIS.Encounters'),
 (N'HIS.Appointments'),(N'HIS.AvailabilityRules'),(N'HIS.AvailabilityExceptions'),
 (N'HIS.ClinicalLocations'),(N'HIS.Beds'),(N'HIS.Admissions'),(N'HIS.BedAssignments')
) required(TableName)
WHERE OBJECT_ID(required.TableName,N'U') IS NULL
ORDER BY required.TableName;

/* Nonzero counts are review items, not an automatic unsupported-feature verdict.
   Azure SQL support may depend on service tier or require a different design. */
SELECT N'User SQL CLR assemblies' AS CompatibilityReviewItem,COUNT(*) AS ItemCount
FROM sys.assemblies WHERE is_user_defined=1
UNION ALL SELECT N'FILESTREAM columns',COUNT(*) FROM sys.columns WHERE is_filestream=1
UNION ALL SELECT N'FileTables',COUNT(*) FROM sys.tables WHERE is_filetable=1
UNION ALL SELECT N'External tables',COUNT(*) FROM sys.external_tables
UNION ALL SELECT N'Memory-optimized tables',COUNT(*) FROM sys.tables WHERE is_memory_optimized=1
UNION ALL SELECT N'Synonyms',COUNT(*) FROM sys.synonyms
UNION ALL SELECT N'Cross-server expression dependencies',COUNT(*)
FROM sys.sql_expression_dependencies WHERE referenced_server_name IS NOT NULL
UNION ALL SELECT N'Cross-database expression dependencies',COUNT(*)
FROM sys.sql_expression_dependencies
WHERE referenced_database_name IS NOT NULL AND referenced_database_name<>DB_NAME();

/* Object names only; never return stored module definitions or connection text. */
SELECT OBJECT_SCHEMA_NAME(referencing_id) AS ReferencingSchema,
       OBJECT_NAME(referencing_id) AS ReferencingObject,
       referenced_server_name AS ReferencedServer,
       referenced_database_name AS ReferencedDatabase,
       referenced_schema_name AS ReferencedSchema,
       referenced_entity_name AS ReferencedObject
FROM sys.sql_expression_dependencies
WHERE referenced_server_name IS NOT NULL OR
      (referenced_database_name IS NOT NULL AND referenced_database_name<>DB_NAME())
ORDER BY ReferencingSchema,ReferencingObject;

SELECT N'Metadata inventory complete. No database migration or data export performed.' AS Result;
