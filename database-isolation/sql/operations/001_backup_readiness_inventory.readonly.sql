/*
 Ruby Database Isolation — Foundation 7B read-only backup/recovery inventory
 Run in SQL Server Management Studio against the same SQL Server instance as
 Ruby_Isolation_Smoke_* databases. No DDL, DML, BACKUP, RESTORE or DBCC.
 This checks msdb history only; a recorded backup is not proof a file still exists
 or that it can be restored. Restore testing is a separate, explicitly approved step.
*/
SET NOCOUNT ON;
DECLARE @Targets TABLE (DatabaseName sysname NOT NULL PRIMARY KEY);
INSERT INTO @Targets (DatabaseName) VALUES
 (N'Ruby_Isolation_Smoke_Platform'),
 (N'Ruby_Isolation_Smoke_Telemetry'),
 (N'Ruby_Isolation_Smoke_BasEms');

-- 1. Database existence, state and recovery configuration
SELECT t.DatabaseName,
       CASE WHEN d.database_id IS NULL THEN N'MISSING' ELSE d.state_desc END AS database_state,
       d.recovery_model_desc,
       d.compatibility_level,
       d.is_read_only,
       d.user_access_desc,
       d.page_verify_option_desc,
       d.create_date
FROM @Targets AS t
LEFT JOIN sys.databases AS d ON d.name = t.DatabaseName
ORDER BY t.DatabaseName;

-- 2. Most recent FULL backup in msdb (if any)
;WITH ranked AS (
 SELECT t.DatabaseName,
        b.backup_set_id,
        b.backup_start_date,
        b.backup_finish_date,
        b.is_copy_only,
        b.has_backup_checksums,
        b.backup_size,
        b.compressed_backup_size,
        b.recovery_model,
        b.first_lsn,
        b.last_lsn,
        b.database_backup_lsn,
        ROW_NUMBER() OVER (PARTITION BY t.DatabaseName ORDER BY b.backup_finish_date DESC,b.backup_set_id DESC) AS rn
 FROM @Targets AS t
 LEFT JOIN msdb.dbo.backupset AS b
   ON b.database_name = t.DatabaseName AND b.type = 'D'
)
SELECT DatabaseName,
       CASE WHEN backup_set_id IS NULL THEN N'NO FULL BACKUP HISTORY' ELSE N'HISTORY PRESENT - NOT RESTORE VERIFIED' END AS backup_status,
       backup_start_date, backup_finish_date, is_copy_only, has_backup_checksums,
       CAST(backup_size/1048576.0 AS decimal(18,2)) AS backup_size_mib,
       CAST(compressed_backup_size/1048576.0 AS decimal(18,2)) AS compressed_size_mib,
       recovery_model, first_lsn, last_lsn, database_backup_lsn,
       backup_set_id
FROM ranked WHERE rn = 1 ORDER BY DatabaseName;

-- 3. Most recent FULL backup device metadata (may include paths; redact before sharing)
;WITH ranked AS (
 SELECT t.DatabaseName,b.media_set_id,b.backup_set_id,b.backup_finish_date,
        ROW_NUMBER() OVER (PARTITION BY t.DatabaseName ORDER BY b.backup_finish_date DESC,b.backup_set_id DESC) AS rn
 FROM @Targets AS t
 LEFT JOIN msdb.dbo.backupset AS b ON b.database_name=t.DatabaseName AND b.type='D'
)
SELECT r.DatabaseName,r.backup_finish_date,mf.family_sequence_number,
       mf.device_type,mf.physical_device_name
FROM ranked AS r
LEFT JOIN msdb.dbo.backupmediafamily AS mf ON mf.media_set_id=r.media_set_id
WHERE r.rn=1
ORDER BY r.DatabaseName,mf.family_sequence_number;

-- 4. Database file sizes and logical names (no filesystem access)
SELECT t.DatabaseName, mf.name AS logical_file_name, mf.type_desc,
       CAST(mf.size*8.0/1024 AS decimal(18,2)) AS size_mib,
       mf.state_desc
FROM @Targets AS t
LEFT JOIN sys.master_files AS mf ON mf.database_id=DB_ID(t.DatabaseName)
ORDER BY t.DatabaseName,mf.file_id;

PRINT 'READ-ONLY COMPLETE: msdb backup history is not backup-file existence or restore verification.';
