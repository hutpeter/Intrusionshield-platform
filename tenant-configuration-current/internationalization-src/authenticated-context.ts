import type { SupportedLanguage } from "./languages.js";
import type { LocaleIdentifier } from "./locale.js";
import {
  resolveLanguage,
  type LanguageResolutionSource
} from "./language-resolution.js";
import type {
  TenantInternationalizationSettings
} from "./tenant-settings.js";

export interface AuthenticatedInternationalizationContext {
  readonly language: SupportedLanguage;
  readonly languageSource: LanguageResolutionSource;
  readonly locale?: LocaleIdentifier;
  readonly countryCode?: string;
  readonly timeZone?: string;
}

export interface CreateAuthenticatedInternationalizationContextRequest {
  readonly userPreferredLanguage?: string | null;
  readonly tenant?: TenantInternationalizationSettings | null;
  readonly systemDefaultLanguage?: string | null;
}

/**
 * Creates the effective internationalization context used by an
 * authenticated EIS application session.
 *
 * Language resolution:
 *
 *   user preference
 *        ->
 *   tenant default
 *        ->
 *   system default
 *        ->
 *   English
 *
 * Locale, country and timezone remain independent from UI language.
 */
export function createAuthenticatedInternationalizationContext(
  request: CreateAuthenticatedInternationalizationContextRequest
): AuthenticatedInternationalizationContext {
  const resolution = resolveLanguage({
    userPreferredLanguage: request.userPreferredLanguage,
    tenantDefaultLanguage: request.tenant?.defaultLanguage,
    systemDefaultLanguage: request.systemDefaultLanguage
  });

  return {
    language: resolution.language,
    languageSource: resolution.source,
    locale: request.tenant?.locale,
    countryCode: request.tenant?.countryCode,
    timeZone: request.tenant?.timeZone
  };
}
