/*
    Ruby BAS Equipment Command persistence.

    Provides a durable, tenant-aware command lifecycle for BAS equipment
    control. Commands are issued by Ruby, accepted by an edge/simulator
    execution layer, and ultimately recorded as EXECUTED or FAILED.

    Lifecycle:
        PENDING -> ACCEPTED -> EXECUTED
                            -> FAILED

        PENDING -----------> FAILED
*/

IF OBJECT_ID('Energy.BasEquipmentCommands', 'U') IS NULL
BEGIN
    CREATE TABLE Energy.BasEquipmentCommands (
        id uniqueidentifier NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_Id DEFAULT NEWID(),

        tenant_id uniqueidentifier NOT NULL,
        site_id uniqueidentifier NOT NULL,
        asset_id uniqueidentifier NULL,
        device_id uniqueidentifier NULL,

        command_type varchar(80) NOT NULL,

        /*
            JSON payload keeps the command envelope extensible for HVAC,
            lighting, meters, solar, batteries and future BAS equipment.
        */
        command_payload nvarchar(max) NOT NULL,

        status varchar(20) NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_Status DEFAULT 'PENDING',

        requested_by nvarchar(200) NULL,
        correlation_id uniqueidentifier NULL,

        requested_at datetime2(7) NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_RequestedAt
            DEFAULT SYSUTCDATETIME(),

        accepted_at datetime2(7) NULL,
        executed_at datetime2(7) NULL,
        failed_at datetime2(7) NULL,

        failure_code varchar(100) NULL,
        failure_message nvarchar(2000) NULL,

        created_at datetime2(7) NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_CreatedAt
            DEFAULT SYSUTCDATETIME(),

        updated_at datetime2(7) NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_UpdatedAt
            DEFAULT SYSUTCDATETIME(),

        version int NOT NULL
            CONSTRAINT DF_BasEquipmentCommands_Version DEFAULT 1,

        CONSTRAINT PK_BasEquipmentCommands
            PRIMARY KEY (id),

        CONSTRAINT UQ_BasEquipmentCommands_Tenant_Id
            UNIQUE (tenant_id, id),

        CONSTRAINT FK_BasEquipmentCommands_Site
            FOREIGN KEY (tenant_id, site_id)
            REFERENCES Telemetry.Sites(tenant_id, id),

        CONSTRAINT FK_BasEquipmentCommands_Asset
            FOREIGN KEY (tenant_id, site_id, asset_id)
            REFERENCES Telemetry.Assets(tenant_id, site_id, id),

        CONSTRAINT FK_BasEquipmentCommands_Device
            FOREIGN KEY (tenant_id, site_id, device_id)
            REFERENCES Telemetry.Devices(tenant_id, site_id, id),

        CONSTRAINT CK_BasEquipmentCommands_Status
            CHECK (status IN (
                'PENDING',
                'ACCEPTED',
                'EXECUTED',
                'FAILED'
            )),

        CONSTRAINT CK_BasEquipmentCommands_PayloadJson
            CHECK (ISJSON(command_payload) = 1),

        CONSTRAINT CK_BasEquipmentCommands_Version
            CHECK (version >= 1),

        CONSTRAINT CK_BasEquipmentCommands_Timestamps
            CHECK (
                (accepted_at IS NULL OR accepted_at >= requested_at)
                AND
                (executed_at IS NULL OR executed_at >= requested_at)
                AND
                (failed_at IS NULL OR failed_at >= requested_at)
            ),

        CONSTRAINT CK_BasEquipmentCommands_TerminalState
            CHECK (
                NOT (
                    executed_at IS NOT NULL
                    AND failed_at IS NOT NULL
                )
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_BasEquipmentCommands_Tenant_Site_Status_Requested'
      AND object_id = OBJECT_ID('Energy.BasEquipmentCommands')
)
BEGIN
    CREATE INDEX IX_BasEquipmentCommands_Tenant_Site_Status_Requested
        ON Energy.BasEquipmentCommands (
            tenant_id,
            site_id,
            status,
            requested_at DESC
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_BasEquipmentCommands_Tenant_Device_Requested'
      AND object_id = OBJECT_ID('Energy.BasEquipmentCommands')
)
BEGIN
    CREATE INDEX IX_BasEquipmentCommands_Tenant_Device_Requested
        ON Energy.BasEquipmentCommands (
            tenant_id,
            device_id,
            requested_at DESC
        );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_BasEquipmentCommands_Correlation'
      AND object_id = OBJECT_ID('Energy.BasEquipmentCommands')
)
BEGIN
    CREATE INDEX IX_BasEquipmentCommands_Correlation
        ON Energy.BasEquipmentCommands (
            tenant_id,
            correlation_id
        )
        WHERE correlation_id IS NOT NULL;
END;
GO
