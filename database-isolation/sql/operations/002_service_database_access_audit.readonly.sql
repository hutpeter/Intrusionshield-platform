/*
 Ruby database isolation - Phase 3A: READ-ONLY service/database access audit.
 Run in SSMS against the SQL Server instance used for Ruby isolation.
 No DDL, DML, permissions changes, impersonation, DBCC, or service changes.
 Result sets may contain login/user names and file locations: review before sharing.
*/
USE master;
SET NOCOUNT ON;

DECLARE @Targets TABLE (DatabaseName sysname PRIMARY KEY);
INSERT INTO @Targets VALUES
 (N'Ruby_Isolation_Smoke_Platform'),
 (N'Ruby_Isolation_Smoke_Telemetry'),
 (N'Ruby_Isolation_Smoke_BasEms');

-- 1. Database configuration and ownership.
SELECT t.DatabaseName,
       COALESCE(d.state_desc,N'MISSING') AS state_desc,
       d.recovery_model_desc,
       d.page_verify_option_desc,
       d.user_access_desc,
       d.is_read_only,
       d.is_trustworthy_on,
       d.is_db_chaining_on,
       d.containment_desc,
       SUSER_SNAME(d.owner_sid) AS owner_login
FROM @Targets t
LEFT JOIN sys.databases d ON d.name=t.DatabaseName
ORDER BY t.DatabaseName;

-- 2. SQL Server principals and broad server-role membership.
SELECT sp.name AS principal_name,sp.type_desc,
       sp.is_disabled,role.name AS server_role
FROM sys.server_principals sp
LEFT JOIN sys.server_role_members rm ON rm.member_principal_id=sp.principal_id
LEFT JOIN sys.server_principals role ON role.principal_id=rm.role_principal_id
WHERE sp.type IN ('S','U','G') AND sp.name NOT LIKE '##MS_%'
ORDER BY sp.name,role.name;

-- 3. Per-database principals and memberships. Dynamic SQL is read-only and
-- constructed only from three exact database names.
DECLARE @Db sysname,@Sql nvarchar(max);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT DatabaseName FROM @Targets ORDER BY DatabaseName;
OPEN c; FETCH NEXT FROM c INTO @Db;
WHILE @@FETCH_STATUS=0
BEGIN
 IF DB_ID(@Db) IS NULL
 BEGIN
  PRINT 'MISSING database: '+@Db;
 END
 ELSE
 BEGIN
  SET @Sql=N'
  SELECT N'''+REPLACE(@Db,'''','''''')+N''' AS database_name,
         p.name AS principal_name,p.type_desc,p.authentication_type_desc,
         p.default_schema_name,
         COALESCE(r.name,N''(no explicit role)'') AS database_role
  FROM '+QUOTENAME(@Db)+N'.sys.database_principals p
  LEFT JOIN '+QUOTENAME(@Db)+N'.sys.database_role_members m
    ON m.member_principal_id=p.principal_id
  LEFT JOIN '+QUOTENAME(@Db)+N'.sys.database_principals r
    ON r.principal_id=m.role_principal_id
  WHERE p.type IN (''S'',''U'',''G'',''E'',''X'')
    AND p.name NOT IN (''guest'',''INFORMATION_SCHEMA'',''sys'')
  ORDER BY p.name,r.name;';
  EXEC sys.sp_executesql @Sql;

  SET @Sql=N'
  SELECT N'''+REPLACE(@Db,'''','''''')+N''' AS database_name,
         grantee.name AS grantee_name,permission.state_desc,
         permission.permission_name,permission.class_desc,
         CASE WHEN permission.class=0 THEN N''DATABASE''
              WHEN permission.class=1 THEN
                   COALESCE(OBJECT_SCHEMA_NAME(permission.major_id,DB_ID(N'''+REPLACE(@Db,'''','''''')+N'''))
                   +N''.''+OBJECT_NAME(permission.major_id,DB_ID(N'''+REPLACE(@Db,'''','''''')+N''')),N''OBJECT'')
              ELSE CONVERT(nvarchar(30),permission.major_id) END AS securable
  FROM '+QUOTENAME(@Db)+N'.sys.database_permissions permission
  JOIN '+QUOTENAME(@Db)+N'.sys.database_principals grantee
    ON grantee.principal_id=permission.grantee_principal_id
  WHERE grantee.name NOT IN (''guest'',''INFORMATION_SCHEMA'',''sys'')
  ORDER BY grantee.name,permission.permission_name;';
  EXEC sys.sp_executesql @Sql;
 END;
 FETCH NEXT FROM c INTO @Db;
END
CLOSE c; DEALLOCATE c;

PRINT 'READ-ONLY AUDIT COMPLETE. Permissions shown do not include all effective access through ownership, fixed roles or Windows groups.';
