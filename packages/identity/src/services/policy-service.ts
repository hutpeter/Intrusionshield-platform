import type { AuthorizationPolicy, PolicyCondition } from "../types/policy.js";
import type { AuthorizationContext, AuthorizationDecision, AuthorizationRequest } from "../types/authorization.js";

export interface PolicyRepository {
  findApplicablePolicies(tenantId: string, resource: string, action: string): Promise<readonly AuthorizationPolicy[]>;
}

export class PolicyService {
  public constructor(private readonly repository: PolicyRepository) {}

  public async evaluate(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const policies = (await this.repository.findApplicablePolicies(
      request.context.tenantId,
      request.resource,
      request.action
    )).filter((policy) => policy.enabled).sort((a, b) => b.priority - a.priority);

    for (const policy of policies) {
      if (!this.conditionsMatch(policy.conditions, policy.conditionOperator, request.context)) {
        continue;
      }

      return {
        allowed: policy.effect === "ALLOW",
        reason: `ABAC policy ${policy.effect.toLowerCase()}: ${policy.name}`
      };
    }

    return { allowed: false, reason: "No applicable ABAC policy matched" };
  }

  private conditionsMatch(
    conditions: readonly PolicyCondition[],
    operator: "AND" | "OR",
    context: AuthorizationContext
  ): boolean {
    const results = conditions.map((condition) => {
      const actual = context.attributes[condition.attribute];
      switch (condition.operator) {
        case "equals": return actual === condition.value;
        case "not_equals": return actual !== condition.value;
        case "exists": return (actual !== undefined) === condition.value;
        case "in": return Array.isArray(condition.value) && condition.value.includes(actual);
      }
    });

    if (results.length === 0) return true;
    return operator === "AND" ? results.every(Boolean) : results.some(Boolean);
  }
}
