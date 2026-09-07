import { describe, expect, it } from "@jest/globals";
import { DefaultI18nService } from "./service.js";

describe("DefaultI18nService", () => {
  it("resolves user locale before tenant locale", () => {
    const service = new DefaultI18nService();

    expect(
      service.resolveLocale({
        userLocale: "fr-CA",
        tenantLocale: "en-CA"
      })
    ).toBe("fr-CA");
  });

  it("resolves tenant locale when user locale is not provided", () => {
    const service = new DefaultI18nService();

    expect(
      service.resolveLocale({
        tenantLocale: "fr-CA"
      })
    ).toBe("fr-CA");
  });

  it("resolves fallback locale when user and tenant locales are not provided", () => {
    const service = new DefaultI18nService("en-CA");

    expect(
      service.resolveLocale({
        fallbackLocale: "de-DE"
      })
    ).toBe("de-DE");
  });

  it("resolves the configured default locale when no locale is provided", () => {
    const service = new DefaultI18nService("fr-CA");

    expect(service.resolveLocale({})).toBe("fr-CA");
  });

  it("registers and translates a message from the requested locale", () => {
    const service = new DefaultI18nService("en-CA");

    service.registerCatalog({
      locale: "fr-CA",
      messages: {
        greeting: "Bonjour {name}"
      }
    });

    expect(
      service.translate(
        "greeting",
        { userLocale: "fr-CA" },
        { name: "Peter" }
      )
    ).toBe("Bonjour Peter");
  });

  it("falls back to the default locale for missing translations", () => {
    const service = new DefaultI18nService("en-CA");

    service.registerCatalog({
      locale: "en-CA",
      messages: {
        greeting: "Hello {name}"
      }
    });

    service.registerCatalog({
      locale: "fr-CA",
      messages: {}
    });

    expect(
      service.translate(
        "greeting",
        { userLocale: "fr-CA" },
        { name: "Peter" }
      )
    ).toBe("Hello Peter");
  });

  it("returns the translation key when no translation exists", () => {
    const service = new DefaultI18nService("en-CA");

    expect(
      service.translate("missing.key", {
        userLocale: "fr-CA"
      })
    ).toBe("missing.key");
  });

  it("preserves an interpolation placeholder when its variable is missing", () => {
    const service = new DefaultI18nService();

    service.registerCatalog({
      locale: "en-CA",
      messages: {
        greeting: "Hello {name}, welcome to {product}."
      }
    });

    expect(
      service.translate(
        "greeting",
        {},
        { name: "Peter" }
      )
    ).toBe("Hello Peter, welcome to {product}.");
  });

  it("interpolates multiple string and numeric variables", () => {
    const service = new DefaultI18nService();

    service.registerCatalog({
      locale: "en-CA",
      messages: {
        summary: "{name} has {count} notifications."
      }
    });

    expect(
      service.translate(
        "summary",
        {},
        {
          name: "Peter",
          count: 5
        }
      )
    ).toBe("Peter has 5 notifications.");
  });

  it("uses the most recently registered catalog for a locale", () => {
    const service = new DefaultI18nService();

    service.registerCatalog({
      locale: "en-CA",
      messages: {
        greeting: "Hello"
      }
    });

    service.registerCatalog({
      locale: "en-CA",
      messages: {
        greeting: "Welcome"
      }
    });

    expect(
      service.translate("greeting", {
        userLocale: "en-CA"
      })
    ).toBe("Welcome");
  });

  it("formats a date using the requested locale", () => {
    const service = new DefaultI18nService();

    const formatted = service.formatDate(
      new Date("2026-01-15T00:00:00Z"),
      "en-CA",
      {
        timeZone: "UTC"
      }
    );

    expect(formatted).toContain("2026");
    expect(formatted).toContain("15");
  });

  it("formats a number using the requested locale", () => {
    const service = new DefaultI18nService();

    expect(
      service.formatNumber(1234.5, "en-CA")
    ).toContain("1,234.5");
  });

  it("formats currency using the requested locale", () => {
    const service = new DefaultI18nService();

    expect(
      service.formatCurrency(1234.5, "CAD", "en-CA")
    ).toContain("1,234.50");
  });
});