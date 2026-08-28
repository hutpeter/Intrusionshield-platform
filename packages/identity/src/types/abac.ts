export type AttributeValue = string | number | boolean | null | readonly string[];

export interface AbacSubject {
  readonly identityId: string;
  readonly tenantId: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export interface AbacResource {
  readonly resource: string;
  readonly resourceId?: string;
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export interface AbacEnvironment {
  readonly attributes: Readonly<Record<string, AttributeValue>>;
}

export type AbacOperator = "equals" | "notEquals" | "in" | "contains" | "exists";

export interface AbacCondition {
  readonly attribute: string;
  readonly operator: AbacOperator;
  readonly value?: AttributeValue;
}

export interface AbacPolicy {
  readonly id: string;
  readonly name: string;
  readonly effect: "ALLOW" | "DENY";
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly conditions: readonly AbacCondition[];
  readonly priority?: number;
}

export interface AbacRequest {
  readonly action: string;
  readonly subject: AbacSubject;
  readonly resource: AbacResource;
  readonly environment?: AbacEnvironment;
}

export interface AbacDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policyId?: string;
}
