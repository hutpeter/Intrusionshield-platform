import type { IDatabaseProvider } from "@intrusionshield/database";

export interface TradeResourceRegionalReferences {
    readonly tenantId: string;
    readonly countryCode?: string;
    readonly administrativeRegionCode?: string;
    readonly serviceAreaId?: string;
}

/** Enforces cross-database references without relying on SQL Server cross-DB FKs. */
export async function validateTradeResourceRegionalReferences(
    platform: IDatabaseProvider,
    input: TradeResourceRegionalReferences
): Promise<void> {
    const country = input.countryCode?.trim().toUpperCase();
    const region = input.administrativeRegionCode?.trim();
    const area = input.serviceAreaId?.trim();

    if (region && !country) {
        throw new Error("countryCode is required when administrativeRegionCode is supplied.");
    }
    if (country) {
        const result = await platform.query<{ code: string }>(
            "SELECT code FROM Platform.Countries WHERE code = @code",
            [{ name: "code", value: country }]
        );
        if (result.rows.length !== 1) throw new Error("countryCode does not reference a valid country.");
    }
    if (region) {
        const result = await platform.query<{ code: string }>(
            "SELECT code FROM Platform.AdministrativeRegions WHERE country_code = @countryCode AND code = @regionCode",
            [{ name: "countryCode", value: country }, { name: "regionCode", value: region }]
        );
        if (result.rows.length !== 1) throw new Error("administrativeRegionCode does not belong to countryCode.");
    }
    if (area) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(area)) {
            throw new Error("serviceAreaId must be a UUID.");
        }
        const result = await platform.query<{ id: string; countryCode: string; regionCode: string }>(
            "SELECT CONVERT(varchar(36), id) AS id, country_code AS countryCode, region_code AS regionCode FROM Platform.ServiceAreas WHERE id = @id AND tenant_id = @tenantId",
            [{ name: "id", value: area }, { name: "tenantId", value: input.tenantId }]
        );
        const found = result.rows[0];
        if (!found) throw new Error("serviceAreaId does not belong to this tenant.");
        if (country && found.countryCode.trim().toUpperCase() !== country) throw new Error("serviceAreaId country does not match countryCode.");
        if (region && found.regionCode.trim() !== region) throw new Error("serviceAreaId region does not match administrativeRegionCode.");
    }
}
