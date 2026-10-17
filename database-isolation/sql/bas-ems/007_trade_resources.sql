IF SCHEMA_ID(N'Energy') IS NULL EXEC(N'CREATE SCHEMA Energy');
GO

/*
    Ruby Energy Performance Platform
    Trade Resources / Workforce foundation

    Provides:
      - Tradespeople / service resources
      - Configurable skills
      - Multiple skills per resource
      - Certifications / qualification metadata
      - Individual resource calendars
      - Maintenance activity assignments
      - Foundation for future Asset Maintenance & Field Service Management
*/

IF OBJECT_ID(N'Energy.Skills', N'U') IS NULL
BEGIN
    CREATE TABLE Energy.Skills(
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,
        code nvarchar(100) NOT NULL,
        name nvarchar(200) NOT NULL,
        description nvarchar(1000) NULL,
        status nvarchar(20) NOT NULL,
        created_at datetime2 NOT NULL,
        updated_at datetime2 NOT NULL,
        version int NOT NULL,

        CONSTRAINT PK_Energy_Skills
            PRIMARY KEY(id),

        CONSTRAINT UQ_Energy_Skills_Tenant_Code
            UNIQUE(tenant_id, code),

        CONSTRAINT CK_Energy_Skills_Status
            CHECK(status IN('ACTIVE','INACTIVE')),

        CONSTRAINT CK_Energy_Skills_Version
            CHECK(version > 0)
    );

    CREATE INDEX IX_Energy_Skills_Tenant_Status
        ON Energy.Skills(tenant_id, status, name);
END;
GO


IF OBJECT_ID(N'Energy.TradeResources', N'U') IS NULL
BEGIN
    CREATE TABLE Energy.TradeResources(
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,

        resource_number nvarchar(100) NOT NULL,
        first_name nvarchar(150) NOT NULL,
        last_name nvarchar(150) NOT NULL,

        trade nvarchar(150) NOT NULL,

        resource_type nvarchar(30) NOT NULL,
        employer_name nvarchar(250) NULL,

        email nvarchar(320) NULL,
        phone nvarchar(100) NULL,

        service_region nvarchar(250) NULL,

        hourly_rate decimal(19,4) NULL,
        currency nvarchar(3) NULL,

        status nvarchar(20) NOT NULL,

        notes nvarchar(max) NULL,

        created_at datetime2 NOT NULL,
        updated_at datetime2 NOT NULL,
        version int NOT NULL,

        CONSTRAINT PK_Energy_TradeResources
            PRIMARY KEY(id),

        CONSTRAINT UQ_Energy_TradeResources_Tenant_Number
            UNIQUE(tenant_id, resource_number),

        CONSTRAINT CK_Energy_TradeResources_Type
            CHECK(resource_type IN('EMPLOYEE','VENDOR','CONTRACTOR')),

        CONSTRAINT CK_Energy_TradeResources_Status
            CHECK(status IN('ACTIVE','INACTIVE')),

        CONSTRAINT CK_Energy_TradeResources_Rate
            CHECK(hourly_rate IS NULL OR hourly_rate >= 0),

        CONSTRAINT CK_Energy_TradeResources_Version
            CHECK(version > 0)
    );

    CREATE INDEX IX_Energy_TradeResources_Tenant_Trade_Status
        ON Energy.TradeResources(
            tenant_id,
            trade,
            status,
            last_name,
            first_name
        );
END;
GO


IF OBJECT_ID(N'Energy.TradeResourceSkills', N'U') IS NULL
BEGIN
    CREATE TABLE Energy.TradeResourceSkills(
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,
        resource_id uniqueidentifier NOT NULL,
        skill_id uniqueidentifier NOT NULL,

        proficiency nvarchar(30) NULL,

        certification_name nvarchar(250) NULL,
        certification_number nvarchar(150) NULL,
        certification_expires_at datetime2 NULL,

        notes nvarchar(1000) NULL,

        created_at datetime2 NOT NULL,

        CONSTRAINT PK_Energy_TradeResourceSkills
            PRIMARY KEY(id),

        CONSTRAINT UQ_Energy_TradeResourceSkills_Resource_Skill
            UNIQUE(tenant_id, resource_id, skill_id),

        CONSTRAINT FK_Energy_TradeResourceSkills_Resource
            FOREIGN KEY(resource_id)
            REFERENCES Energy.TradeResources(id),

        CONSTRAINT FK_Energy_TradeResourceSkills_Skill
            FOREIGN KEY(skill_id)
            REFERENCES Energy.Skills(id),

        CONSTRAINT CK_Energy_TradeResourceSkills_Proficiency
            CHECK(
                proficiency IS NULL OR
                proficiency IN(
                    'APPRENTICE',
                    'QUALIFIED',
                    'EXPERT'
                )
            )
    );

    CREATE INDEX IX_Energy_TradeResourceSkills_Tenant_Skill
        ON Energy.TradeResourceSkills(
            tenant_id,
            skill_id,
            resource_id
        );
END;
GO


IF OBJECT_ID(N'Energy.TradeResourceCalendar', N'U') IS NULL
BEGIN
    CREATE TABLE Energy.TradeResourceCalendar(
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,
        resource_id uniqueidentifier NOT NULL,

        maintenance_activity_id uniqueidentifier NULL,

        entry_type nvarchar(30) NOT NULL,

        title nvarchar(250) NOT NULL,

        start_at datetime2 NOT NULL,
        end_at datetime2 NOT NULL,

        status nvarchar(30) NOT NULL,

        notes nvarchar(1000) NULL,

        created_at datetime2 NOT NULL,
        updated_at datetime2 NOT NULL,
        version int NOT NULL,

        CONSTRAINT PK_Energy_TradeResourceCalendar
            PRIMARY KEY(id),

        CONSTRAINT FK_Energy_TradeResourceCalendar_Resource
            FOREIGN KEY(resource_id)
            REFERENCES Energy.TradeResources(id),

        CONSTRAINT FK_Energy_TradeResourceCalendar_Maintenance
            FOREIGN KEY(maintenance_activity_id)
            REFERENCES Energy.ContractMaintenanceActivities(id),

        CONSTRAINT CK_Energy_TradeResourceCalendar_Type
            CHECK(
                entry_type IN(
                    'MAINTENANCE',
                    'WORK_ORDER',
                    'INSPECTION',
                    'UNAVAILABLE',
                    'OTHER'
                )
            ),

        CONSTRAINT CK_Energy_TradeResourceCalendar_Status
            CHECK(
                status IN(
                    'TENTATIVE',
                    'CONFIRMED',
                    'COMPLETED',
                    'CANCELLED'
                )
            ),

        CONSTRAINT CK_Energy_TradeResourceCalendar_Dates
            CHECK(end_at > start_at),

        CONSTRAINT CK_Energy_TradeResourceCalendar_Version
            CHECK(version > 0)
    );

    CREATE INDEX IX_Energy_TradeResourceCalendar_Availability
        ON Energy.TradeResourceCalendar(
            tenant_id,
            resource_id,
            start_at,
            end_at,
            status
        );
END;
GO


/*
    Preserve responsible_party for:
      - existing data
      - unknown/external responsible parties
      - backward compatibility

    responsible_resource_id points to a managed Ruby trade resource.
*/

IF COL_LENGTH(
    'Energy.ContractMaintenanceActivities',
    'responsible_resource_id'
) IS NULL
BEGIN
    ALTER TABLE Energy.ContractMaintenanceActivities
        ADD responsible_resource_id uniqueidentifier NULL;
END;
GO


IF NOT EXISTS(
    SELECT 1
    FROM sys.foreign_keys
    WHERE name =
        'FK_Energy_ContractMaintenance_ResponsibleResource'
)
BEGIN
    ALTER TABLE Energy.ContractMaintenanceActivities
        ADD CONSTRAINT
            FK_Energy_ContractMaintenance_ResponsibleResource
        FOREIGN KEY(responsible_resource_id)
        REFERENCES Energy.TradeResources(id);
END;
GO


IF NOT EXISTS(
    SELECT 1
    FROM sys.indexes
    WHERE name =
        'IX_Energy_ContractMaintenance_ResponsibleResource'
      AND object_id =
        OBJECT_ID(
            N'Energy.ContractMaintenanceActivities'
        )
)
BEGIN
    CREATE INDEX
        IX_Energy_ContractMaintenance_ResponsibleResource
    ON Energy.ContractMaintenanceActivities(
        tenant_id,
        responsible_resource_id,
        next_due_date
    );
END;
GO


/*
    Initial configurable Ruby BAS/EMS skill catalogue.
    Tenant-specific skills can be added later through the API/UI.

    The seed uses the standard local demonstration tenant only.
*/

DECLARE @tenantId uniqueidentifier =
    '11111111-1111-4111-8111-111111111111';

DECLARE @now datetime2 = SYSUTCDATETIME();

DECLARE @skills TABLE(
    code nvarchar(100),
    name nvarchar(200),
    description nvarchar(1000)
);

INSERT INTO @skills(code, name, description)
VALUES
    ('HVAC',
     'HVAC',
     'Heating, ventilation and air-conditioning service and maintenance.'),

    ('HVAC_CONTROLS',
     'HVAC Controls / BAS',
     'HVAC controls and building automation systems.'),

    ('REFRIGERATION',
     'Refrigeration',
     'Commercial and industrial refrigeration systems.'),

    ('ELECTRICAL',
     'Electrical',
     'Electrical systems, panels, motors and related equipment.'),

    ('PLUMBING',
     'Plumbing',
     'Building plumbing systems and equipment.'),

    ('MECHANICAL',
     'Mechanical',
     'General mechanical systems and equipment.'),

    ('ELEVATOR',
     'Elevator',
     'Elevator and lift maintenance and service.'),

    ('SOLAR_PV',
     'Solar / PV',
     'Solar photovoltaic systems and associated equipment.'),

    ('ENERGY_METERING',
     'Energy Metering',
     'Energy meters, submeters and measurement systems.'),

    ('INSTRUMENTATION',
     'Instrumentation',
     'Sensors, instrumentation and measurement devices.'),

    ('BACNET',
     'BACnet',
     'BACnet building automation integration and diagnostics.'),

    ('MODBUS',
     'Modbus',
     'Modbus device integration and diagnostics.'),

    ('MBUS',
     'M-Bus',
     'M-Bus metering integration and diagnostics.'),

    ('SCADA_CONTROLS',
     'SCADA / Controls',
     'SCADA, industrial controls and telemetry systems.'),

    ('GENERAL_MAINTENANCE',
     'General Maintenance',
     'General building and equipment maintenance.');

INSERT INTO Energy.Skills(
    id,
    tenant_id,
    code,
    name,
    description,
    status,
    created_at,
    updated_at,
    version
)
SELECT
    NEWID(),
    @tenantId,
    source.code,
    source.name,
    source.description,
    'ACTIVE',
    @now,
    @now,
    1
FROM @skills source
WHERE NOT EXISTS(
    SELECT 1
    FROM Energy.Skills existing
    WHERE existing.tenant_id = @tenantId
      AND existing.code = source.code
);
GO
