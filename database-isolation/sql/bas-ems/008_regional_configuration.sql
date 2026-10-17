-- BAS/EMS owns trade-resource country identifiers. Platform reference checks occur through tenant-aware services.
IF COL_LENGTH('Energy.TradeResources', 'country_code') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD country_code char(2) NULL;
END;
GO

/*
    Backward-compatible migration of existing records:
    CAD records are assigned CA. Other existing records remain NULL because
    Ruby must not guess a country from free-form Service Region text.
*/
UPDATE Energy.TradeResources
SET country_code = 'CA'
WHERE country_code IS NULL
  AND currency = 'CAD';
GO

