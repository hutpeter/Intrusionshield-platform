import type { I18nService, Locale, LocalePreferences, TranslationCatalog } from "./types.js";

export class DefaultI18nService implements I18nService {
  public constructor(private readonly catalogs: readonly TranslationCatalog[] = []) {}

  public resolveLocale(preferences: LocalePreferences): Locale {
    return preferences.userLocale?.trim() || preferences.tenantDefaultLocale || preferences.fallbackLocale;
  }

  public translate(key: string, locale: Locale, namespace = "common"): string {
    const exact = this.catalogs.find((catalog) => catalog.locale === locale && catalog.namespace === namespace);
    const fallback = this.catalogs.find((catalog) => catalog.locale === "en-CA" && catalog.namespace === namespace);
    return exact?.translations[key] ?? fallback?.translations[key] ?? key;
  }

  public formatDate(value: Date, locale: Locale, timeZone?: string): string {
    return new Intl.DateTimeFormat(locale, timeZone ? { timeZone } : undefined).format(value);
  }

  public formatNumber(value: number, locale: Locale): string {
    return new Intl.NumberFormat(locale).format(value);
  }

  public formatCurrency(value: number, currency: string, locale: Locale): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  }
}
