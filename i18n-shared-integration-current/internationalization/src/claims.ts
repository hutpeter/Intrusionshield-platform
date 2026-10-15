import type { SupportedLanguage } from "./languages.js";
import type { LanguageResolutionSource } from "./language-resolution.js";

/**
 * Internationalization claims suitable for inclusion in an authenticated
 * EIS token/session.
 *
 * These claims describe the effective authenticated context. They are not
 * the authoritative persistence location for the user's preference.
 */
export interface InternationalizationClaims {
  readonly language: SupportedLanguage;
  readonly languageSource: LanguageResolutionSource;
  readonly locale?: string;
  readonly countryCode?: string;
  readonly timeZone?: string;
}
