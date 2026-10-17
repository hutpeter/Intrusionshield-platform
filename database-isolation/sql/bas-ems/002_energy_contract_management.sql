IF SCHEMA_ID(N'Energy') IS NULL EXEC(N'CREATE SCHEMA Energy');
GO
IF OBJECT_ID(N'Energy.Contracts',N'U') IS NULL
BEGIN
 CREATE TABLE Energy.Contracts(
  id uniqueidentifier NOT NULL, tenant_id uniqueidentifier NOT NULL, contract_number nvarchar(100) NOT NULL,
  name nvarchar(250) NOT NULL, vendor_name nvarchar(250) NOT NULL, contract_type nvarchar(100) NOT NULL,
  site_id uniqueidentifier NULL, owner nvarchar(200) NULL, start_date datetime2 NOT NULL, end_date datetime2 NOT NULL,
  renewal_date datetime2 NULL, notice_date datetime2 NULL, value_amount decimal(19,4) NULL, currency nvarchar(3) NULL,
  rate_description nvarchar(500) NULL, status nvarchar(20) NOT NULL, description nvarchar(2000) NULL, notes nvarchar(max) NULL,
  created_at datetime2 NOT NULL, updated_at datetime2 NOT NULL, version int NOT NULL,
  CONSTRAINT PK_Energy_Contracts PRIMARY KEY(id), CONSTRAINT UQ_Energy_Contracts_Tenant_Number UNIQUE(tenant_id,contract_number),
  CONSTRAINT CK_Energy_Contracts_Status CHECK(status IN('DRAFT','ACTIVE','EXPIRING','EXPIRED','TERMINATED')),
  CONSTRAINT CK_Energy_Contracts_Dates CHECK(end_date>=start_date), CONSTRAINT CK_Energy_Contracts_Version CHECK(version>0),
  /* External Telemetry reference: service must validate tenant and site ownership. */
 );
 CREATE INDEX IX_Energy_Contracts_Tenant_Status_EndDate ON Energy.Contracts(tenant_id,status,end_date);
END;
GO
IF OBJECT_ID(N'Energy.ContractCoverage',N'U') IS NULL
BEGIN
 CREATE TABLE Energy.ContractCoverage(
  id uniqueidentifier NOT NULL, tenant_id uniqueidentifier NOT NULL, contract_id uniqueidentifier NOT NULL,
  site_id uniqueidentifier NULL, asset_id uniqueidentifier NULL, created_at datetime2 NOT NULL,
  CONSTRAINT PK_Energy_ContractCoverage PRIMARY KEY(id),
  CONSTRAINT FK_Energy_ContractCoverage_Contract FOREIGN KEY(contract_id) REFERENCES Energy.Contracts(id),
  /* External Telemetry reference: service must validate tenant and site ownership. */,
  /* External Telemetry reference: service must validate tenant and site ownership. */,
  CONSTRAINT CK_Energy_ContractCoverage_Target CHECK(site_id IS NOT NULL OR asset_id IS NOT NULL)
 );
 CREATE INDEX IX_Energy_ContractCoverage_Tenant_Contract ON Energy.ContractCoverage(tenant_id,contract_id);
END;
GO
IF OBJECT_ID(N'Energy.ContractMaintenanceActivities',N'U') IS NULL
BEGIN
 CREATE TABLE Energy.ContractMaintenanceActivities(
  id uniqueidentifier NOT NULL, tenant_id uniqueidentifier NOT NULL, contract_id uniqueidentifier NOT NULL,
  asset_id uniqueidentifier NULL, activity nvarchar(500) NOT NULL, frequency nvarchar(100) NULL, next_due_date datetime2 NULL,
  responsible_party nvarchar(250) NULL, sla nvarchar(500) NULL, status nvarchar(20) NOT NULL,
  last_completed_at datetime2 NULL, notes nvarchar(max) NULL, created_at datetime2 NOT NULL, updated_at datetime2 NOT NULL, version int NOT NULL,
  CONSTRAINT PK_Energy_ContractMaintenance PRIMARY KEY(id),
  CONSTRAINT FK_Energy_ContractMaintenance_Contract FOREIGN KEY(contract_id) REFERENCES Energy.Contracts(id),
  /* External Telemetry reference: service must validate tenant and site ownership. */,
  CONSTRAINT CK_Energy_ContractMaintenance_Status CHECK(status IN('UPCOMING','DUE','OVERDUE','COMPLETED')),
  CONSTRAINT CK_Energy_ContractMaintenance_Version CHECK(version>0)
 );
 CREATE INDEX IX_Energy_ContractMaintenance_Tenant_Contract_Due ON Energy.ContractMaintenanceActivities(tenant_id,contract_id,next_due_date);
END;
GO
