-- REVIEW ONLY: no migration runner registers or executes this file.
-- Target a separately provisioned sterilization-owned SQL Server database.
-- No connection fallback to Platform, HIS, Telemetry or BAS/EMS is permitted.
-- Set/approve the database name, migration identity and permissions separately.
-- Draft schema only: no claim of live SQL validation or production readiness.
SET XACT_ABORT ON;
DECLARE @ExpectedDatabase sysname = N'__REVIEW_AND_SET_STERILE_DATABASE__';
IF DB_NAME() <> @ExpectedDatabase
    THROW 51000, 'Sterilization database target has not been explicitly approved.', 1;
IF SCHEMA_ID(N'Sterile') IS NULL EXEC(N'CREATE SCHEMA Sterile AUTHORIZATION dbo');
IF OBJECT_ID(N'Sterile.Instruments', N'U') IS NOT NULL
    THROW 51001, 'Foundation objects already exist; review migration history.', 1;
BEGIN TRANSACTION;
CREATE TABLE Sterile.FacilityReferences (
    TenantId uniqueidentifier NOT NULL,
    FacilityId uniqueidentifier NOT NULL,
    DisplayName nvarchar(200) NOT NULL,
    TimeZoneId nvarchar(100) NOT NULL,
    IsActive bit NOT NULL,
    CONSTRAINT PK_Sterile_Facilities PRIMARY KEY (TenantId, FacilityId)
);
CREATE TABLE Sterile.InstrumentTypes (
    TenantId uniqueidentifier NOT NULL,
    FacilityId uniqueidentifier NOT NULL,
    InstrumentTypeId uniqueidentifier NOT NULL,
    Code nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Name nvarchar(200) NOT NULL,
    Manufacturer nvarchar(200) NOT NULL,
    Model nvarchar(200) NOT NULL,
    CreatedAt datetime2(7) NOT NULL,
    Version int NOT NULL CONSTRAINT CK_Sterile_TypeVersion CHECK (Version > 0),
    CONSTRAINT PK_Sterile_InstrumentTypes PRIMARY KEY (TenantId, FacilityId, InstrumentTypeId),
    CONSTRAINT UQ_Sterile_TypeCode UNIQUE (TenantId, FacilityId, Code),
    CONSTRAINT FK_Sterile_TypeFacility FOREIGN KEY (TenantId, FacilityId)
        REFERENCES Sterile.FacilityReferences(TenantId, FacilityId)
);
CREATE TABLE Sterile.Instruments (
    TenantId uniqueidentifier NOT NULL,
    FacilityId uniqueidentifier NOT NULL,
    InstrumentId uniqueidentifier NOT NULL,
    OwnerFacilityId uniqueidentifier NOT NULL,
    InstrumentTypeId uniqueidentifier NOT NULL,
    Code nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SerialNumber nvarchar(200) NOT NULL,
    State varchar(20) NOT NULL,
    CreatedAt datetime2(7) NOT NULL,
    UpdatedAt datetime2(7) NOT NULL,
    RetiredAt datetime2(7) NULL,
    RetirementReason nvarchar(500) NULL,
    Version int NOT NULL CONSTRAINT CK_Sterile_InstrumentVersion CHECK (Version > 0),
    CONSTRAINT PK_Sterile_Instruments PRIMARY KEY (TenantId, FacilityId, InstrumentId),
    CONSTRAINT UQ_Sterile_InstrumentCode UNIQUE (TenantId, FacilityId, Code),
    CONSTRAINT FK_Sterile_InstrumentType FOREIGN KEY (TenantId, FacilityId, InstrumentTypeId)
        REFERENCES Sterile.InstrumentTypes(TenantId, FacilityId, InstrumentTypeId),
    CONSTRAINT FK_Sterile_InstrumentOwner FOREIGN KEY (TenantId, OwnerFacilityId)
        REFERENCES Sterile.FacilityReferences(TenantId, FacilityId),
    CONSTRAINT CK_Sterile_InstrumentState CHECK (
        (State='registered' AND RetiredAt IS NULL AND RetirementReason IS NULL) OR
        (State='retired' AND RetiredAt IS NOT NULL AND RetirementReason IS NOT NULL AND LEN(LTRIM(RTRIM(RetirementReason)))>0)
    )
);
CREATE TABLE Sterile.AuditEvents (
    TenantId uniqueidentifier NOT NULL,
    FacilityId uniqueidentifier NOT NULL,
    EventId uniqueidentifier NOT NULL,
    ActorId uniqueidentifier NOT NULL,
    At datetime2(7) NOT NULL,
    Action varchar(40) NOT NULL,
    EntityId uniqueidentifier NOT NULL,
    EntityVersion int NOT NULL,
    RequestId uniqueidentifier NOT NULL,
    Reason nvarchar(500) NOT NULL,
    CONSTRAINT PK_Sterile_Audit PRIMARY KEY (TenantId, FacilityId, EventId),
    CONSTRAINT FK_Sterile_AuditFacility FOREIGN KEY (TenantId, FacilityId)
        REFERENCES Sterile.FacilityReferences(TenantId, FacilityId),
    CONSTRAINT UQ_Sterile_AuditRequest UNIQUE (TenantId, FacilityId, RequestId)
);
CREATE TABLE Sterile.CommandReceipts (
    TenantId uniqueidentifier NOT NULL,
    FacilityId uniqueidentifier NOT NULL,
    RequestId uniqueidentifier NOT NULL,
    RequestHash char(64) NOT NULL,
    ResultJson nvarchar(max) NOT NULL CONSTRAINT CK_Sterile_ReceiptJson CHECK (ISJSON(ResultJson)=1),
    CONSTRAINT PK_Sterile_Receipts PRIMARY KEY (TenantId, FacilityId, RequestId),
    CONSTRAINT FK_Sterile_ReceiptFacility FOREIGN KEY (TenantId, FacilityId)
        REFERENCES Sterile.FacilityReferences(TenantId, FacilityId)
);
COMMIT TRANSACTION;
-- Runtime writes must be parameterized, scope all predicates and use expected Version.
-- Catalogue/instance changes, audit and command receipt must share one transaction.
-- Provision only approved facilities; runtime must not invent a facility from a caller ID.
-- Separate runtime/provisioning/migration identities and protect audit updates/deletes.
-- No grants, logins, seed patients, destructive cleanup or foreign-database references here.
