export const SUPPORTED_LANGUAGES = [
    "en",
    "es"
] as const;

export type SupportedLanguage =
    (typeof SUPPORTED_LANGUAGES)[number];

export const SYSTEM_DEFAULT_LANGUAGE:
    SupportedLanguage = "en";

export function isSupportedLanguage(
    value: unknown
): value is SupportedLanguage {
    return (
        typeof value === "string" &&
        SUPPORTED_LANGUAGES.includes(
            value.toLowerCase() as SupportedLanguage
        )
    );
}

export function normalizeLanguage(
    value: unknown
): SupportedLanguage | undefined {
    if (
        typeof value !== "string" ||
        value.trim().length === 0
    ) {
        return undefined;
    }

    const normalized =
        value
            .trim()
            .toLowerCase()
            .replace("_", "-");

    const baseLanguage =
        normalized.split("-")[0];

    return isSupportedLanguage(baseLanguage)
        ? baseLanguage
        : undefined;
}

export type LanguageResolutionInput = {
    userPreferredLanguage?: string | null;
    tenantDefaultLanguage?: string | null;
};

export function resolveLanguage(
    input: LanguageResolutionInput
): SupportedLanguage {
    return (
        normalizeLanguage(
            input.userPreferredLanguage
        ) ??
        normalizeLanguage(
            input.tenantDefaultLanguage
        ) ??
        SYSTEM_DEFAULT_LANGUAGE
    );
}
