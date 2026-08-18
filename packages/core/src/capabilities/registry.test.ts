import { describe, expect, it } from "@jest/globals";
import { InMemoryCapabilityRegistry } from "./registry.js";

describe("InMemoryCapabilityRegistry", () => {
  it("resolves capability dependencies", () => {
    const registry = new InMemoryCapabilityRegistry();
    registry.register({ id: "core.auth", name: "Auth", description: "", version: "1.0.0", category: "security", dependencies: [], status: "ACTIVE" });
    registry.register({ id: "core.ai", name: "AI", description: "", version: "1.0.0", category: "intelligence", dependencies: ["core.auth"], status: "ACTIVE" });

    expect(registry.resolveDependencies("core.ai").map((c) => c.id)).toEqual(["core.auth"]);
  });

  it("rejects dependency cycles", () => {
    const registry = new InMemoryCapabilityRegistry();
    registry.register({ id: "a", name: "A", description: "", version: "1.0.0", category: "test", dependencies: ["b"], status: "ACTIVE" });
    registry.register({ id: "b", name: "B", description: "", version: "1.0.0", category: "test", dependencies: ["a"], status: "ACTIVE" });

    expect(() => registry.resolveDependencies("a")).toThrow("dependency cycle");
  });
});
