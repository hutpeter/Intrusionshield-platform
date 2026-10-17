-- Platform administrative-region and service-area identifiers are externally validated.
/* Persist the configured geographic hierarchy on workforce resources. */
IF COL_LENGTH('Energy.TradeResources', 'administrative_region_code') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD administrative_region_code varchar(40) NULL;
END;
GO

IF COL_LENGTH('Energy.TradeResources', 'service_area_id') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD service_area_id uniqueidentifier NULL;
END;
GO

-- Legacy geographic backfill requires controlled cross-database application migration; intentionally omitted.
