import { describe, expect, it } from "@jest/globals";
import { InMemoryCapabilityRegistry } from "./registry.js";

describe("InMemoryCapabilityRegistry", () => {
  it("registers and retrieves a capability", () => {
    const registry = new InMemoryCapabilityRegistry();

    const capability = {
      id: "core.auth",
      name: "Auth",
      description: "Authentication",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE" as const
    };

    registry.register(capability);

    expect(registry.get("core.auth")).toEqual(capability);
  });

  it("reports whether a capability is registered", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.auth",
      name: "Auth",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    expect(registry.has("core.auth")).toBe(true);
    expect(registry.has("core.missing")).toBe(false);
  });

  it("lists registered capabilities", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.auth",
      name: "Auth",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.auth"],
      status: "ACTIVE"
    });

    expect(registry.list().map((capability) => capability.id)).toEqual([
      "core.auth",
      "core.ai"
    ]);
  });

  it("rejects duplicate capability registration", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.auth",
      name: "Auth",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    expect(() =>
      registry.register({
        id: "core.auth",
        name: "Auth Duplicate",
        description: "",
        version: "2.0.0",
        category: "security",
        dependencies: [],
        status: "ACTIVE"
      })
    ).toThrow("Capability already registered: core.auth");
  });

  it("resolves capability dependencies", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.auth",
      name: "Auth",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.auth"],
      status: "ACTIVE"
    });

    expect(
      registry.resolveDependencies("core.ai").map((capability) => capability.id)
    ).toEqual(["core.auth"]);
  });

  it("de-duplicates shared dependencies", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.base",
      name: "Base",
      description: "",
      version: "1.0.0",
      category: "platform",
      dependencies: [],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.security",
      name: "Security",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: ["core.base"],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.base"],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.application",
      name: "Application",
      description: "",
      version: "1.0.0",
      category: "application",
      dependencies: ["core.security", "core.ai"],
      status: "ACTIVE"
    });

    expect(
      registry
        .resolveDependencies("core.application")
        .map((capability) => capability.id)
    ).toEqual([
      "core.base",
      "core.security",
      "core.ai"
    ]);
  });

  it("rejects dependency cycles", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "a",
      name: "A",
      description: "",
      version: "1.0.0",
      category: "test",
      dependencies: ["b"],
      status: "ACTIVE"
    });

    registry.register({
      id: "b",
      name: "B",
      description: "",
      version: "1.0.0",
      category: "test",
      dependencies: ["a"],
      status: "ACTIVE"
    });

    expect(() => registry.resolveDependencies("a")).toThrow(
      "dependency cycle"
    );
  });

  it("rejects an unknown capability during dependency resolution", () => {
    const registry = new InMemoryCapabilityRegistry();

    expect(() =>
      registry.resolveDependencies("core.missing")
    ).toThrow("Unknown capability: core.missing");
  });

  it("rejects an unknown dependency", () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.missing"],
      status: "ACTIVE"
    });

    expect(() =>
      registry.resolveDependencies("core.ai")
    ).toThrow("Unknown capability: core.missing");
  });
});