import { describe, expect, it } from "vitest";
import { DefaultI18nService } from "./service.js";

describe("DefaultI18nService", () => {
  it("resolves user locale before tenant locale", () => {
    const service = new DefaultI18nService();
    expect(service.resolveLocale({ userLocale: "fr-CA", tenantLocale: "en-CA" })).toBe("fr-CA");
  });

  it("falls back to the default locale for missing translations", () => {
    const service = new DefaultI18nService("en-CA");
    service.registerCatalog({ locale: "en-CA", messages: { greeting: "Hello {name}" } });
    service.registerCatalog({ locale: "fr-CA", messages: {} });
    expect(service.translate("greeting", { userLocale: "fr-CA" }, { name: "Peter" })).toBe("Hello Peter");
  });

  it("formats currency using the requested locale", () => {
    const service = new DefaultI18nService();
    expect(service.formatCurrency(1234.5, "CAD", "en-CA")).toContain("1,234.50");
  });
});
