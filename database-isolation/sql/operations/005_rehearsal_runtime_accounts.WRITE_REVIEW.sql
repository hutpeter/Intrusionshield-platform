/*
 Ruby database isolation — Phase 3B: REHEARSAL-ONLY runtime identities.
 WRITE SCRIPT: creates three SQL logins, users and schema-scoped runtime permissions.
 DO NOT RUN against production. Review and approve before executing in SSMS.
 Targets ONLY Ruby_Isolation_Rehearsal_* databases.
 No changes to smoke, recovery, legacy or Athena databases.
 No sysadmin, db_owner, db_ddladmin, CREATE/ALTER/DROP permissions.
 Run as SQL Server administrator. Set distinct strong passwords at the placeholders.
*/
USE master;
SET NOCOUNT ON;

IF DB_ID(N'Ruby_Isolation_Rehearsal_Platform') IS NULL
 OR DB_ID(N'Ruby_Isolation_Rehearsal_Telemetry') IS NULL
 OR DB_ID(N'Ruby_Isolation_Rehearsal_BasEms') IS NULL
 THROW 51000, 'Missing rehearsal database. Aborted without provisioning.', 1;

IF EXISTS (SELECT 1 FROM sys.sql_logins WHERE name IN
 (N'ruby_platform_test_svc',N'ruby_telemetry_test_svc',N'ruby_basems_test_svc'))
 THROW 51001, 'A test login already exists. Aborted to avoid altering it.', 1;

/* Replace each placeholder with a UNIQUE, strong password locally.
   Never commit actual passwords to Git. SQL Server password policies apply.
   The script refuses to run while placeholders remain. */
DECLARE @platform_password nvarchar(256)=N'REPLACE_PLATFORM_PASSWORD';
DECLARE @telemetry_password nvarchar(256)=N'REPLACE_TELEMETRY_PASSWORD';
DECLARE @basems_password nvarchar(256)=N'REPLACE_BASEMS_PASSWORD';

IF @platform_password LIKE N'REPLACE_%'
 OR @telemetry_password LIKE N'REPLACE_%'
 OR @basems_password LIKE N'REPLACE_%'
 OR @platform_password=@telemetry_password
 OR @platform_password=@basems_password
 OR @telemetry_password=@basems_password
 THROW 51002, 'Set three distinct passwords locally before executing.', 1;

-- CREATE LOGIN does not accept a variable directly; quote passwords as literals
-- using QUOTENAME with apostrophe quoting, including embedded apostrophes.
DECLARE @sql nvarchar(max);
SET @sql=N'CREATE LOGIN [ruby_platform_test_svc] WITH PASSWORD = '
 +QUOTENAME(@platform_password,'''')
 +N', CHECK_POLICY = ON, DEFAULT_DATABASE = [Ruby_Isolation_Rehearsal_Platform];';
EXEC sys.sp_executesql @sql;

SET @sql=N'CREATE LOGIN [ruby_telemetry_test_svc] WITH PASSWORD = '
 +QUOTENAME(@telemetry_password,'''')
 +N', CHECK_POLICY = ON, DEFAULT_DATABASE = [Ruby_Isolation_Rehearsal_Telemetry];';
EXEC sys.sp_executesql @sql;

SET @sql=N'CREATE LOGIN [ruby_basems_test_svc] WITH PASSWORD = '
 +QUOTENAME(@basems_password,'''')
 +N', CHECK_POLICY = ON, DEFAULT_DATABASE = [Ruby_Isolation_Rehearsal_BasEms];';
EXEC sys.sp_executesql @sql;

-- Schema-level DML permits normal runtime operations but no schema migrations.
USE [Ruby_Isolation_Rehearsal_Platform];
CREATE USER [ruby_platform_test_svc] FOR LOGIN [ruby_platform_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[Platform] TO [ruby_platform_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[Identity] TO [ruby_platform_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[Authentication] TO [ruby_platform_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[EIS] TO [ruby_platform_test_svc];

USE [Ruby_Isolation_Rehearsal_Telemetry];
CREATE USER [ruby_telemetry_test_svc] FOR LOGIN [ruby_telemetry_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[Telemetry] TO [ruby_telemetry_test_svc];

USE [Ruby_Isolation_Rehearsal_BasEms];
CREATE USER [ruby_basems_test_svc] FOR LOGIN [ruby_basems_test_svc];
GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[Energy] TO [ruby_basems_test_svc];

USE master;
SELECT sp.name AS login_name, sp.is_disabled,
       COALESCE(sr.name,N'(none)') AS server_role
FROM sys.sql_logins AS sp
LEFT JOIN sys.server_role_members AS srm ON srm.member_principal_id=sp.principal_id
LEFT JOIN sys.server_principals AS sr ON sr.principal_id=srm.role_principal_id
WHERE sp.name IN (N'ruby_platform_test_svc',N'ruby_telemetry_test_svc',N'ruby_basems_test_svc')
ORDER BY sp.name,sr.name;

PRINT N'REHEARSAL TEST IDENTITIES CREATED. Verify access and denials before use.';
