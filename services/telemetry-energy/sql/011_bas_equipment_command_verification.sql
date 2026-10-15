SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;
GO

ALTER TABLE Energy.BasEquipmentCommands
ADD verified_at datetime2(3) NULL;
GO

ALTER TABLE Energy.BasEquipmentCommands
DROP CONSTRAINT CK_BasEquipmentCommands_Status;
GO

ALTER TABLE Energy.BasEquipmentCommands
ADD CONSTRAINT CK_BasEquipmentCommands_Status
CHECK (
    [status] IN (
        'PENDING',
        'ACCEPTED',
        'EXECUTED',
        'VERIFIED',
        'FAILED'
    )
);
GO

ALTER TABLE Energy.BasEquipmentCommands
DROP CONSTRAINT CK_BasEquipmentCommands_Timestamps;
GO

ALTER TABLE Energy.BasEquipmentCommands
ADD CONSTRAINT CK_BasEquipmentCommands_Timestamps
CHECK (
    ([accepted_at] IS NULL OR [accepted_at] >= [requested_at])
    AND
    ([executed_at] IS NULL OR [executed_at] >= [requested_at])
    AND
    ([verified_at] IS NULL OR [verified_at] >= [requested_at])
    AND
    ([failed_at] IS NULL OR [failed_at] >= [requested_at])
);
GO

ALTER TABLE Energy.BasEquipmentCommands
DROP CONSTRAINT CK_BasEquipmentCommands_TerminalState;
GO

ALTER TABLE Energy.BasEquipmentCommands
ADD CONSTRAINT CK_BasEquipmentCommands_TerminalState
CHECK (
    NOT (
        [failed_at] IS NOT NULL
        AND (
            [executed_at] IS NOT NULL
            OR [verified_at] IS NOT NULL
        )
    )
    AND
    NOT (
        [verified_at] IS NOT NULL
        AND [executed_at] IS NULL
    )
);
GO

COMMIT TRANSACTION;
GO