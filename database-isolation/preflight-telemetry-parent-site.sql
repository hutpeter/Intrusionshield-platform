/* Foundation 6G: read-only preflight for site-aware parent asset FK.
   Execute in SSMS. No data or schema changes. */
USE [Ruby_Isolation_Smoke_Telemetry];
GO
SET NOCOUNT ON;
IF DB_NAME() <> N'Ruby_Isolation_Smoke_Telemetry'
 THROW 51610, 'Disposable Telemetry database required.', 1;
SELECT DB_NAME() AS database_name,
       COUNT_BIG(*) AS assets_with_parent,
       SUM(CASE WHEN p.id IS NOT NULL AND a.site_id <> p.site_id THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS cross_site_parent_links,
       SUM(CASE WHEN p.id IS NULL THEN CONVERT(bigint,1) ELSE CONVERT(bigint,0) END) AS missing_parent_links
FROM Telemetry.Assets a
LEFT JOIN Telemetry.Assets p ON p.id=a.parent_asset_id AND p.tenant_id=a.tenant_id
WHERE a.parent_asset_id IS NOT NULL;
SELECT fk.name AS foreign_key_name, fk.is_disabled, fk.is_not_trusted,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS referenced_schema,
       OBJECT_NAME(fk.referenced_object_id) AS referenced_table
FROM sys.foreign_keys fk
WHERE fk.parent_object_id=OBJECT_ID(N'Telemetry.Assets')
  AND fk.name=N'FK_Telemetry_Assets_ParentAsset';
SELECT i.name, i.is_unique,
       STRING_AGG(c.name, N', ') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE i.object_id=OBJECT_ID(N'Telemetry.Assets') AND i.is_unique=1
GROUP BY i.name,i.is_unique;
PRINT 'PASS: Foundation 6G read-only preflight completed. Review counts and indexes before migration.';
