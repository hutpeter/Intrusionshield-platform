export type PolicyOperator = "AND" | "OR";

export type PolicyCondition =
  | { readonly attribute: string; readonly operator: "equals" | "not_equals" | "in"; readonly value: unknown }
  | { readonly attribute: string; readonly operator: "exists"; readonly value: boolean };

export interface AuthorizationPolicy {
  readonly id: string;
  readonly tenantId: string | null;
  readonly name: string;
  readonly resource: string;
  readonly action: string;
  readonly effect: "ALLOW" | "DENY";
  readonly conditions: readonly PolicyCondition[];
  readonly conditionOperator: PolicyOperator;
  readonly priority: number;
  readonly enabled: boolean;
}
