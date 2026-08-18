import type {
  AbacCondition,
  AbacDecision,
  AbacPolicy,
  AbacRequest,
  AttributeValue
} from "../types/abac.js";

export interface AbacPolicyRepository {
  getPolicies(tenantId: string): Promise<readonly AbacPolicy[]>;
}

export class AbacService {
  public constructor(private readonly repository: AbacPolicyRepository) {}

  public async evaluate(request: AbacRequest): Promise<AbacDecision> {
    const policies = [...await this.repository.getPolicies(request.subject.tenantId)]
      .filter((policy) => policy.actions.includes(request.action))
      .filter((policy) => policy.resources.includes(request.resource.resource))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const policy of policies) {
      if (!policy.conditions.every((condition) => this.matches(condition, request))) {
        continue;
      }

      return {
        allowed: policy.effect === "ALLOW",
        reason: policy.effect === "ALLOW" ? "ABAC policy granted access" : "ABAC policy denied access",
        policyId: policy.id
      };
    }

    return { allowed: false, reason: "No applicable ABAC policy" };
  }

  private matches(condition: AbacCondition, request: AbacRequest): boolean {
    const value = this.resolveAttribute(condition.attribute, request);

    switch (condition.operator) {
      case "exists":
        return value !== undefined;
      case "equals":
        return this.equal(value, condition.value);
      case "notEquals":
        return !this.equal(value, condition.value);
      case "in":
        return Array.isArray(condition.value) && condition.value.some((item) => this.equal(value, item));
      case "contains":
        return Array.isArray(value) && condition.value !== undefined && value.some((item) => this.equal(item, condition.value));
      default:
        return false;
    }
  }

  private resolveAttribute(attribute: string, request: AbacRequest): AttributeValue | undefined {
    const [scope, ...parts] = attribute.split(".");
    const key = parts.join(".");

    if (scope === "subject") return request.subject.attributes[key];
    if (scope === "resource") return request.resource.attributes[key];
    if (scope === "environment") return request.environment?.attributes[key];
    if (scope === "tenant" && key === "id") return request.subject.tenantId;

    return undefined;
  }

  private equal(left: AttributeValue | undefined, right: AttributeValue | undefined): boolean {
    return left === right;
  }
}
