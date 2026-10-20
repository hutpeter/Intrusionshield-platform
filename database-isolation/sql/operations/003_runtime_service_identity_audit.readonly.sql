/*
 Ruby database isolation - Phase 3B: READ-ONLY application connection audit.
 Run in SSMS with administrative visibility while Ruby isolated services are running.
 No writes, permission changes, login changes, or service changes.
 The application connection pool may have no visible sessions until an API request is made.
*/
USE master;
SET NOCOUNT ON;

-- Active user connections and their login identities. Do not display credentials.
SELECT
    s.session_id,
    s.login_name,
    s.original_login_name,
    s.host_name,
    s.program_name,
    DB_NAME(s.database_id) AS session_database,
    c.client_net_address,
    c.connect_time,
    c.auth_scheme
FROM sys.dm_exec_sessions AS s
LEFT JOIN sys.dm_exec_connections AS c ON c.session_id = s.session_id
WHERE s.is_user_process = 1
  AND s.program_name NOT LIKE N'%Management Studio%'
ORDER BY s.login_name, s.session_id;

-- Per-database presence of explicitly mapped SQL service users (excludes dbo/public).
-- This is a configuration inventory, not proof of effective access via sysadmin.
DECLARE @targets TABLE (DatabaseName sysname PRIMARY KEY);
INSERT INTO @targets VALUES
(N'Ruby_Isolation_Smoke_Platform'),
(N'Ruby_Isolation_Smoke_Telemetry'),
(N'Ruby_Isolation_Smoke_BasEms');

DECLARE @db sysname, @sql nvarchar(max);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT DatabaseName FROM @targets;
OPEN cur;
FETCH NEXT FROM cur INTO @db;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF DB_ID(@db) IS NULL
        PRINT N'MISSING: ' + @db;
    ELSE
    BEGIN
        SET @sql = N'
        SELECT N''' + REPLACE(@db,'''','''''') + N''' AS database_name,
               p.name AS database_user,
               p.type_desc,
               p.authentication_type_desc,
               COALESCE(r.name, N''(no explicit role)'') AS database_role
        FROM ' + QUOTENAME(@db) + N'.sys.database_principals AS p
        LEFT JOIN ' + QUOTENAME(@db) + N'.sys.database_role_members AS m
          ON m.member_principal_id = p.principal_id
        LEFT JOIN ' + QUOTENAME(@db) + N'.sys.database_principals AS r
          ON r.principal_id = m.role_principal_id
        WHERE p.principal_id > 4 AND p.type IN (''S'',''U'',''G'',''E'',''X'')
        ORDER BY p.name, r.name;';
        EXEC sys.sp_executesql @sql;
    END;
    FETCH NEXT FROM cur INTO @db;
END;
CLOSE cur;
DEALLOCATE cur;

PRINT N'READ-ONLY audit complete. Absence of sessions does not prove a service is stopped.';
