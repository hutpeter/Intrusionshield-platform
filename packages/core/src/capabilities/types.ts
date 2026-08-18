export type CapabilityStatus = "ACTIVE" | "DEPRECATED" | "DISABLED";

export interface CapabilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly category: string;
  readonly dependencies: readonly string[];
  readonly status: CapabilityStatus;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CapabilityRegistry {
  register(capability: CapabilityDefinition): void;
  get(capabilityId: string): CapabilityDefinition | undefined;
  has(capabilityId: string): boolean;
  list(): readonly CapabilityDefinition[];
  resolveDependencies(capabilityId: string): readonly CapabilityDefinition[];
}
