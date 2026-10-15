import {
    normalizeCountryCode,
    normalizeLanguage,
    normalizeLocale,
    type SupportedLanguage
} from "@intrusionshield/internationalization";

export interface NormalizedTenantInternationalization {
    readonly countryCode?: string;
    readonly defaultLanguage?: SupportedLanguage;
    readonly locale?: string;
    readonly timeZone?: string;
}

export function normalizeTimeZone(
    value: string | null | undefined
): string | undefined {
    if (!value) {
        return undefined;
    }

    const normalized = value.trim();

    if (!normalized) {
        return undefined;
    }

    try {
        new Intl.DateTimeFormat(
            "en",
            { timeZone: normalized }
        ).format();

        return normalized;
    } catch {
        return undefined;
    }
}

export function normalizeTenantInternationalization(
    input: {
        countryCode?: string | null;
        defaultLanguage?: string | null;
        locale?: string | null;
        timeZone?: string | null;
    }
): NormalizedTenantInternationalization {
    const countryCode =
        normalizeCountryCode(input.countryCode);

    if (input.countryCode && !countryCode) {
        throw new Error(
            "Tenant countryCode must be a valid two-letter country code."
        );
    }

    const defaultLanguage =
        normalizeLanguage(input.defaultLanguage);

    if (
        input.defaultLanguage &&
        !defaultLanguage
    ) {
        throw new Error(
            "Tenant defaultLanguage is not supported by EIS."
        );
    }

    const locale =
        normalizeLocale(input.locale);

    if (input.locale && !locale) {
        throw new Error(
            "Tenant locale is invalid."
        );
    }

    const timeZone =
        normalizeTimeZone(input.timeZone);

    if (input.timeZone && !timeZone) {
        throw new Error(
            "Tenant timeZone is invalid."
        );
    }

    return {
        countryCode,
        defaultLanguage,
        locale,
        timeZone
    };
}
