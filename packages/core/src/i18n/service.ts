import type { I18nService, LocaleContext, TranslationCatalog } from "./types.js";

const interpolate = (template: string, variables: Readonly<Record<string, string | number>> = {}): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(variables[key] ?? `{${key}}`));

export class DefaultI18nService implements I18nService {
  private readonly catalogs = new Map<string, TranslationCatalog>();

  public constructor(private readonly defaultLocale = "en-CA") {}

  public registerCatalog(catalog: TranslationCatalog): void {
    this.catalogs.set(catalog.locale, catalog);
  }

  public resolveLocale(context: LocaleContext): string {
    return context.userLocale || context.tenantLocale || context.fallbackLocale || this.defaultLocale;
  }

  public translate(key: string, context: LocaleContext = {}, variables: Readonly<Record<string, string | number>> = {}): string {
    const locale = this.resolveLocale(context);
    const message = this.catalogs.get(locale)?.messages[key]
      ?? this.catalogs.get(this.defaultLocale)?.messages[key]
      ?? key;
    return interpolate(message, variables);
  }

  public formatDate(value: Date | number, locale = this.defaultLocale, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(locale, options).format(value);
  }

  public formatNumber(value: number, locale = this.defaultLocale, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(locale, options).format(value);
  }

  public formatCurrency(value: number, currency: string, locale = this.defaultLocale): string {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
  }
}
