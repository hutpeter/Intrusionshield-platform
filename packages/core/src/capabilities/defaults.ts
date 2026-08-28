import { InMemoryCapabilityRegistry } from "./registry.js";
import type { CapabilityDefinition } from "./types.js";

export const CORE_CAPABILITIES: readonly CapabilityDefinition[] = [
  { id: "core.authentication", name: "Authentication", description: "Platform authentication capabilities.", version: "1.0.0", category: "security", dependencies: [], status: "ACTIVE" },
  { id: "core.authorization", name: "Authorization", description: "RBAC, ABAC, and authorization policy capabilities.", version: "1.0.0", category: "security", dependencies: ["core.authentication"], status: "ACTIVE" },
  { id: "core.i18n", name: "Internationalization", description: "Platform localization, translation, locale, timezone, and formatting capabilities.", version: "1.0.0", category: "platform", dependencies: ["core.authentication"], status: "ACTIVE" },
  { id: "core.ai", name: "AI Hub", description: "AI routing and AI service orchestration capabilities.", version: "1.0.0", category: "intelligence", dependencies: ["core.authorization"], status: "ACTIVE" },
  { id: "core.compliance", name: "Compliance", description: "Compliance framework and contextual compliance capabilities.", version: "1.0.0", category: "governance", dependencies: ["core.authorization"], status: "ACTIVE" },
  { id: "core.data-classification", name: "Data Classification", description: "Data discovery, classification, labeling, and classification policy capabilities.", version: "1.0.0", category: "governance", dependencies: ["core.authorization"], status: "ACTIVE" },
  { id: "core.workflow", name: "Workflow", description: "Workflow orchestration and policy-driven process automation.", version: "1.0.0", category: "automation", dependencies: ["core.authorization"], status: "ACTIVE" },
  { id: "core.analytics", name: "Security Analytics", description: "Security analytics, event analysis, and risk intelligence.", version: "1.0.0", category: "analytics", dependencies: ["core.authorization"], status: "ACTIVE" }
];

export function createDefaultCapabilityRegistry(): InMemoryCapabilityRegistry {
  const registry = new InMemoryCapabilityRegistry();
  for (const capability of CORE_CAPABILITIES) registry.register(capability);
  return registry;
}
