/* Foundation 6H/6J — transactional site-aware parent FK forward migration.
   This file is portable and deliberately has no USE statement.
   Execution is NOT authorized by this file: the isolated migration runner remains
   plan-only. Execute only through a separately reviewed, target-guarded process
   with verified backups and preflight. Original 003 remains unchanged.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() IS NULL OR DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb',N'intrusionshield')
    THROW 51620, 'Refusing to alter a system or legacy shared database.', 1;
IF OBJECT_ID(N'Telemetry.Assets',N'U') IS NULL
    THROW 51621, 'Telemetry.Assets missing.', 1;
IF NOT EXISTS (
 SELECT 1 FROM sys.indexes i
 JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 WHERE i.object_id=OBJECT_ID(N'Telemetry.Assets') AND i.is_unique=1
 GROUP BY i.object_id,i.index_id
 HAVING STRING_AGG(c.name,N',') WITHIN GROUP (ORDER BY ic.key_ordinal)=N'tenant_id,site_id,id'
)
    THROW 51622, 'Required unique tenant/site/id key missing.', 1;
IF EXISTS (
 SELECT 1 FROM Telemetry.Assets child
 JOIN Telemetry.Assets parent ON parent.id=child.parent_asset_id AND parent.tenant_id=child.tenant_id
 WHERE child.site_id<>parent.site_id
)
    THROW 51623, 'Existing cross-site parent relationships must be resolved first.', 1;
IF EXISTS (
 SELECT 1 FROM Telemetry.Assets child
 WHERE child.parent_asset_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM Telemetry.Assets parent
  WHERE parent.id=child.parent_asset_id AND parent.tenant_id=child.tenant_id
 )
)
    THROW 51624, 'Existing missing/cross-tenant parent relationship.', 1;
IF NOT EXISTS (
 SELECT 1 FROM sys.foreign_keys
 WHERE parent_object_id=OBJECT_ID(N'Telemetry.Assets')
 AND name=N'FK_Telemetry_Assets_ParentAsset'
 AND is_disabled=0 AND is_not_trusted=0
)
    THROW 51625, 'Expected enabled trusted original FK not found.', 1;
IF EXISTS (
 SELECT 1 FROM sys.foreign_key_columns fkc
 JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id
 WHERE fk.parent_object_id=OBJECT_ID(N'Telemetry.Assets')
 AND fk.name=N'FK_Telemetry_Assets_ParentAsset'
 GROUP BY fk.object_id HAVING COUNT(*)<>2
)
    THROW 51626, 'Parent FK already changed; refusing to rerun.', 1;
BEGIN TRY
 BEGIN TRANSACTION;
 ALTER TABLE Telemetry.Assets DROP CONSTRAINT FK_Telemetry_Assets_ParentAsset;
 ALTER TABLE Telemetry.Assets WITH CHECK
 ADD CONSTRAINT FK_Telemetry_Assets_ParentAsset
 FOREIGN KEY (tenant_id,site_id,parent_asset_id)
 REFERENCES Telemetry.Assets (tenant_id,site_id,id);
 IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys fk
  WHERE fk.name=N'FK_Telemetry_Assets_ParentAsset'
    AND fk.parent_object_id=OBJECT_ID(N'Telemetry.Assets')
    AND fk.is_disabled=0 AND fk.is_not_trusted=0
 ) THROW 51627,'New parent FK is not enabled and trusted.',1;
 IF (SELECT COUNT(*) FROM sys.foreign_key_columns fkc
     JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id
     WHERE fk.parent_object_id=OBJECT_ID(N'Telemetry.Assets')
       AND fk.name=N'FK_Telemetry_Assets_ParentAsset')<>3
    THROW 51628,'New parent FK does not have three columns.',1;
 COMMIT TRANSACTION;
 PRINT 'PASS: Foundation 6H site-aware parent asset FK committed to disposable Telemetry DB.';
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
