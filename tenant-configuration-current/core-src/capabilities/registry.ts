import type { CapabilityDefinition, CapabilityRegistry } from "./types.js";

export class InMemoryCapabilityRegistry implements CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDefinition>();

  public register(capability: CapabilityDefinition): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`Capability already registered: ${capability.id}`);
    }

    this.capabilities.set(capability.id, Object.freeze({
      ...capability,
      dependencies: Object.freeze([...capability.dependencies])
    }));
  }

  public get(capabilityId: string): CapabilityDefinition | undefined {
    return this.capabilities.get(capabilityId);
  }

  public has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId);
  }

  public list(): readonly CapabilityDefinition[] {
    return [...this.capabilities.values()];
  }

  public resolveDependencies(capabilityId: string): readonly CapabilityDefinition[] {
    const resolved = new Map<string, CapabilityDefinition>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (resolved.has(id)) return;
      if (visiting.has(id)) throw new Error(`Capability dependency cycle detected: ${id}`);

      const capability = this.capabilities.get(id);
      if (!capability) throw new Error(`Unknown capability: ${id}`);

      visiting.add(id);
      for (const dependency of capability.dependencies) visit(dependency);
      visiting.delete(id);
      resolved.set(id, capability);
    };

    visit(capabilityId);
    resolved.delete(capabilityId);
    return [...resolved.values()];
  }
}
