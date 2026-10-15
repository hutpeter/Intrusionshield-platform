import type { SupportedLanguage } from "./languages.js";
import type { LocaleIdentifier } from "./locale.js";

export interface TenantInternationalizationSettings {
  readonly tenantId: string;

  /**
   * Tenant/client country. This is metadata and does not itself determine
   * the language used by an authenticated user.
   */
  readonly countryCode?: string;

  /**
   * Default UI language used when the authenticated user has not selected
   * an explicit language preference.
   */
  readonly defaultLanguage?: SupportedLanguage;

  /**
   * Default formatting locale for dates, numbers and currencies.
   */
  readonly locale?: LocaleIdentifier;

  /**
   * IANA timezone identifier, for example America/Toronto or America/Lima.
   */
  readonly timeZone?: string;
}
