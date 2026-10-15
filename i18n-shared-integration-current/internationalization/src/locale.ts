import type { SupportedLanguage } from "./languages.js";

export type LocaleIdentifier = string;

export interface LocaleContext {
  readonly language: SupportedLanguage;
  readonly locale?: LocaleIdentifier;
  readonly countryCode?: string;
  readonly timeZone?: string;
}

/**
 * Normalizes a country code without coupling country to language.
 *
 * Canada, for example, cannot imply English because a Canadian tenant
 * or user may operate in English, French, or another supported language.
 */
export function normalizeCountryCode(
  value: string | null | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  return /^[A-Z]{2}$/.test(normalized)
    ? normalized
    : undefined;
}

/**
 * Locale identifiers are kept independent from the supported UI language.
 *
 * The Intl runtime performs the authoritative locale validation when
 * formatting is eventually requested.
 */
export function normalizeLocale(
  value: string | null | undefined
): LocaleIdentifier | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replaceAll("_", "-");

  if (normalized.length === 0) {
    return undefined;
  }

  try {
    const [canonicalLocale] =
      Intl.getCanonicalLocales(normalized);

    return canonicalLocale;
  } catch {
    return undefined;
  }
}
