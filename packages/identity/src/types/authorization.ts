export interface Permission {
  readonly id: string;
  readonly name: string;
  readonly resource: string;
  readonly action: string;
}

export interface Role {
  readonly id: string;
  readonly tenantId: string | null;
  readonly name: string;
  readonly permissions: readonly Permission[];
}

export interface AuthorizationContext {
  readonly identityId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface AuthorizationRequest {
  readonly capabilityId?: string;
  readonly resource: string;
  readonly action: string;
  readonly context: AuthorizationContext;
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason: string;
}
