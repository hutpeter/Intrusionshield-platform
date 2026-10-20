/*
 Ruby database isolation — Phase 3B least-privilege preflight.
 READ-ONLY. Run in SSMS on HUT6Dev before provisioning restricted test logins.
 Targets ONLY the disposable Ruby_Isolation_Rehearsal_* databases.
 No account, permission, schema or data changes.
*/
USE master;
SET NOCOUNT ON;
DECLARE @targets TABLE (db sysname PRIMARY KEY);
INSERT INTO @targets VALUES
 (N'Ruby_Isolation_Rehearsal_Platform'),
 (N'Ruby_Isolation_Rehearsal_Telemetry'),
 (N'Ruby_Isolation_Rehearsal_BasEms');

SELECT t.db AS database_name,
       COALESCE(d.state_desc,N'MISSING') AS state_desc,
       d.is_read_only,
       d.user_access_desc
FROM @targets AS t
LEFT JOIN sys.databases AS d ON d.name=t.db
ORDER BY t.db;

DECLARE @db sysname,@sql nvarchar(max);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT db FROM @targets ORDER BY db;
OPEN c;
FETCH NEXT FROM c INTO @db;
WHILE @@FETCH_STATUS=0
BEGIN
 IF DB_ID(@db) IS NULL
    PRINT N'SKIPPED MISSING: '+@db;
 ELSE
 BEGIN
    SET @sql=N'
    SELECT N'''+REPLACE(@db,'''','''''')+N''' AS database_name,
           s.name AS schema_name,
           COUNT(t.object_id) AS user_tables
    FROM '+QUOTENAME(@db)+N'.sys.schemas AS s
    INNER JOIN '+QUOTENAME(@db)+N'.sys.tables AS t ON t.schema_id=s.schema_id
    WHERE t.is_ms_shipped=0
    GROUP BY s.name
    ORDER BY s.name;';
    EXEC sys.sp_executesql @sql;

    SET @sql=N'
    SELECT N'''+REPLACE(@db,'''','''''')+N''' AS database_name,
           s.name AS schema_name,
           o.type_desc AS object_type,
           COUNT(*) AS object_count
    FROM '+QUOTENAME(@db)+N'.sys.objects AS o
    INNER JOIN '+QUOTENAME(@db)+N'.sys.schemas AS s ON s.schema_id=o.schema_id
    WHERE o.is_ms_shipped=0
      AND o.type IN (''P'',''V'',''FN'',''IF'',''TF'')
    GROUP BY s.name,o.type_desc
    ORDER BY s.name,o.type_desc;';
    EXEC sys.sp_executesql @sql;
 END;
 FETCH NEXT FROM c INTO @db;
END;
CLOSE c;
DEALLOCATE c;

SELECT name AS existing_candidate_login,is_disabled
FROM sys.sql_logins
WHERE name IN
(N'ruby_platform_test_svc',N'ruby_telemetry_test_svc',N'ruby_basems_test_svc');

PRINT N'PRE-FLIGHT COMPLETE — read-only. No restricted accounts have been created.';
