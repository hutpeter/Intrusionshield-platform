import {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  type SupportedLanguage
} from "./languages.js";

export type LanguageResolutionSource =
  | "USER"
  | "TENANT"
  | "SYSTEM";

export interface LanguageResolutionRequest {
  /**
   * Explicit language preference stored against the authenticated user.
   */
  readonly userPreferredLanguage?: string | null;

  /**
   * Tenant/client default language.
   */
  readonly tenantDefaultLanguage?: string | null;

  /**
   * Optional system fallback. EIS defaults to English.
   */
  readonly systemDefaultLanguage?: string | null;
}

export interface LanguageResolution {
  readonly language: SupportedLanguage;
  readonly source: LanguageResolutionSource;
}

/**
 * Resolves the effective EIS language using the platform policy:
 *
 *   User preference
 *        ↓
 *   Tenant default
 *        ↓
 *   System default
 *        ↓
 *   English
 *
 * Invalid or unsupported language values are ignored rather than
 * propagated into the authenticated application context.
 */
export function resolveLanguage(
  request: LanguageResolutionRequest
): LanguageResolution {
  const userLanguage =
    normalizeLanguage(request.userPreferredLanguage);

  if (userLanguage) {
    return {
      language: userLanguage,
      source: "USER"
    };
  }

  const tenantLanguage =
    normalizeLanguage(request.tenantDefaultLanguage);

  if (tenantLanguage) {
    return {
      language: tenantLanguage,
      source: "TENANT"
    };
  }

  const systemLanguage =
    normalizeLanguage(request.systemDefaultLanguage);

  if (systemLanguage) {
    return {
      language: systemLanguage,
      source: "SYSTEM"
    };
  }

  return {
    language: DEFAULT_LANGUAGE,
    source: "SYSTEM"
  };
}
