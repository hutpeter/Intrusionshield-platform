/*
 Foundation 6F: SQL Server behavioral FK tests on the disposable Telemetry database.
 SSMS only. All synthetic records are rolled back. Never run against legacy/production.
*/
USE [Ruby_Isolation_Smoke_Telemetry];
GO
SET NOCOUNT ON;
SET XACT_ABORT OFF;
IF DB_NAME() <> N'Ruby_Isolation_Smoke_Telemetry'
    THROW 51600, 'Wrong database: disposable Telemetry only.', 1;
DECLARE @tenantA uniqueidentifier=NEWID(), @tenantB uniqueidentifier=NEWID();
DECLARE @siteA uniqueidentifier=NEWID(), @siteA2 uniqueidentifier=NEWID(), @siteB uniqueidentifier=NEWID();
DECLARE @assetA uniqueidentifier=NEWID(), @assetA2 uniqueidentifier=NEWID(), @assetB uniqueidentifier=NEWID();
DECLARE @deviceA uniqueidentifier=NEWID(), @deviceB uniqueidentifier=NEWID();
DECLARE @measurementA uniqueidentifier=NEWID(), @measurementB uniqueidentifier=NEWID();
DECLARE @reading uniqueidentifier=NEWID(), @policy uniqueidentifier=NEWID();
DECLARE @passed int=0, @failed int=0, @unexpected int=0;
BEGIN TRY
 BEGIN TRANSACTION;
 INSERT INTO Telemetry.Sites(id,tenant_id,code,name,status,created_at,updated_at,version)
 VALUES (@siteA,@tenantA,N'6F-A',N'6F Site A',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@siteA2,@tenantA,N'6F-A2',N'6F Site A2',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@siteB,@tenantB,N'6F-B',N'6F Site B',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
 INSERT INTO Telemetry.Assets(id,tenant_id,site_id,code,name,asset_type,status,created_at,updated_at,version)
 VALUES (@assetA,@tenantA,@siteA,N'6F-AS-A',N'6F Asset A',N'HVAC',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@assetA2,@tenantA,@siteA2,N'6F-AS-A2',N'6F Asset A2',N'HVAC',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@assetB,@tenantB,@siteB,N'6F-AS-B',N'6F Asset B',N'HVAC',N'ACTIVE',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
 INSERT INTO Telemetry.Devices(id,tenant_id,site_id,asset_id,code,name,device_type,status,created_at,updated_at,version)
 VALUES (@deviceA,@tenantA,@siteA,@assetA,N'6F-DEV-A',N'6F Device A',N'SENSOR',N'ONLINE',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@deviceB,@tenantB,@siteB,@assetB,N'6F-DEV-B',N'6F Device B',N'SENSOR',N'ONLINE',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
 INSERT INTO Telemetry.MeasurementDefinitions(id,tenant_id,code,name,data_type,created_at,updated_at,version)
 VALUES (@measurementA,@tenantA,N'6F-TEMP-A',N'6F Temperature A',N'NUMBER',SYSUTCDATETIME(),SYSUTCDATETIME(),1),
        (@measurementB,@tenantB,N'6F-TEMP-B',N'6F Temperature B',N'NUMBER',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
 PRINT 'PASS: synthetic two-tenant, three-site fixtures inserted in rollback transaction.';
 -- Each deliberately invalid statement must fail with SQL FK error 547.
 BEGIN TRY
  UPDATE Telemetry.Devices SET asset_id=@assetB WHERE id=@deviceA;
  SET @failed+=1; PRINT 'FAIL: cross-tenant device asset was accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: cross-tenant device asset rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR device tenant: ',ERROR_MESSAGE()); END
 END CATCH;
 BEGIN TRY
  UPDATE Telemetry.Devices SET asset_id=@assetA2 WHERE id=@deviceA;
  SET @failed+=1; PRINT 'FAIL: wrong-site device asset was accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: wrong-site device asset rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR device site: ',ERROR_MESSAGE()); END
 END CATCH;
 BEGIN TRY
  INSERT INTO Telemetry.Readings(id,tenant_id,site_id,device_id,measurement_definition_id,observed_at,received_at,numeric_value,quality,source)
  VALUES (@reading,@tenantA,@siteA,@deviceB,@measurementA,SYSUTCDATETIME(),SYSUTCDATETIME(),21,N'GOOD',N'6F');
  SET @failed+=1; PRINT 'FAIL: cross-tenant reading device accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: cross-tenant reading device rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR reading device: ',ERROR_MESSAGE()); END
 END CATCH;
 BEGIN TRY
  INSERT INTO Telemetry.Readings(id,tenant_id,site_id,device_id,measurement_definition_id,observed_at,received_at,numeric_value,quality,source)
  VALUES (@reading,@tenantA,@siteA,@deviceA,@measurementB,SYSUTCDATETIME(),SYSUTCDATETIME(),21,N'GOOD',N'6F');
  SET @failed+=1; PRINT 'FAIL: cross-tenant reading measurement accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: cross-tenant reading measurement rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR reading measurement: ',ERROR_MESSAGE()); END
 END CATCH;
 BEGIN TRY
  INSERT INTO Telemetry.StoragePolicies(id,tenant_id,scope_type,site_id,device_id,enabled,storage_interval_seconds,created_by,updated_by,created_at,updated_at,version)
  VALUES (@policy,@tenantA,N'DEVICE',@siteA,@deviceB,1,60,N'6F',N'6F',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
  SET @failed+=1; PRINT 'FAIL: cross-tenant storage policy device accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: cross-tenant storage policy device rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR storage policy: ',ERROR_MESSAGE()); END
 END CATCH;
 BEGIN TRY
  UPDATE Telemetry.Assets SET parent_asset_id=@assetB WHERE id=@assetA;
  SET @failed+=1; PRINT 'FAIL: cross-tenant parent asset accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: cross-tenant parent asset rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR parent tenant: ',ERROR_MESSAGE()); END
 END CATCH;
 -- Regression: the strengthened parent FK must reject a different-site parent.
 BEGIN TRY
  UPDATE Telemetry.Assets SET parent_asset_id=@assetA2 WHERE id=@assetA;
  SET @failed+=1; PRINT 'FAIL: same-tenant different-site parent asset accepted';
 END TRY BEGIN CATCH
  IF ERROR_NUMBER()=547 BEGIN SET @passed+=1; PRINT 'PASS: same-tenant different-site parent asset rejected'; END
  ELSE BEGIN SET @unexpected+=1; PRINT CONCAT('ERROR parent site: ',ERROR_MESSAGE()); END
 END CATCH;
 IF XACT_STATE()<>1 THROW 51601,'Transaction not committable; cannot finish normal validation.',1;
 ROLLBACK TRANSACTION;
 PRINT CONCAT('ROLLBACK complete; accepted checks=',@passed,', unexpected acceptance=',@failed,', other errors=',@unexpected);
 IF @failed<>0 OR @unexpected<>0 THROW 51602,'Foundation 6F unexpected behavior; review output.',1;
 PRINT 'PASS: Foundation 6F rollback-only behavioral tests complete.';
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 PRINT CONCAT('ROLLBACK on error: ',ERROR_MESSAGE());
 THROW;
END CATCH;
