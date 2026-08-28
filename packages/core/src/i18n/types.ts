export type Locale = string;

export interface TranslationCatalog {
  readonly locale: Locale;
  readonly messages: Readonly<Record<string, string>>;
}

export interface LocaleContext {
  readonly userLocale?: Locale | null;
  readonly tenantLocale?: Locale | null;
  readonly fallbackLocale?: Locale;
}

export interface I18nService {
  resolveLocale(context: LocaleContext): Locale;
  translate(key: string, context?: LocaleContext, variables?: Readonly<Record<string, string | number>>): string;
  formatDate(value: Date | number, locale?: Locale, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, locale?: Locale, options?: Intl.NumberFormatOptions): string;
  formatCurrency(value: number, currency: string, locale?: Locale): string;
}
