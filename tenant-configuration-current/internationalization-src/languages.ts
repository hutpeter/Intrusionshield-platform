/**
 * Languages currently supported by EIS.
 *
 * Language is intentionally separate from country, locale, and timezone.
 *
 * Examples:
 *
 *   language: en
 *   locale:   en-CA
 *   country:  CA
 *
 *   language: es
 *   locale:   es-PE
 *   country:  PE
 */

export const SUPPORTED_LANGUAGES = [
  "en",
  "es"
] as const;

export type SupportedLanguage =
  (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export interface LanguageDefinition {
  readonly code: SupportedLanguage;
  readonly englishName: string;
  readonly nativeName: string;
}

export const LANGUAGE_DEFINITIONS:
  Readonly<Record<SupportedLanguage, LanguageDefinition>> = {
    en: {
      code: "en",
      englishName: "English",
      nativeName: "English"
    },
    es: {
      code: "es",
      englishName: "Spanish",
      nativeName: "Español"
    }
  };

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

/**
 * Converts a language or locale identifier into an EIS-supported language.
 *
 * Examples:
 *
 *   en       -> en
 *   en-CA    -> en
 *   en_US    -> en
 *   es       -> es
 *   es-PE    -> es
 *   es_MX    -> es
 *
 * Unsupported languages return undefined so the language-resolution
 * policy can apply its fallback chain.
 */
export function normalizeLanguage(
  value: string | null | undefined
): SupportedLanguage | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll("_", "-");

  if (normalized.length === 0) {
    return undefined;
  }

  const languageCode = normalized.split("-")[0];

  if (!languageCode) {
    return undefined;
  }

  return isSupportedLanguage(languageCode)
    ? languageCode
    : undefined;
}
