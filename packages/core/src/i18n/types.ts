export type Locale = string;

export interface LocalePreferences {
  readonly tenantDefaultLocale: Locale;
  readonly userLocale?: Locale | null;
  readonly fallbackLocale: Locale;
  readonly timezone?: string | null;
}

export interface TranslationCatalog {
  readonly locale: Locale;
  readonly namespace: string;
  readonly translations: Readonly<Record<string, string>>;
}
