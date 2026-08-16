export const IDENTITY_EVENTS = {
  USER_CREATED: "Identity.UserCreated",
  USER_UPDATED: "Identity.UserUpdated",
  USER_DELETED: "Identity.UserDeleted",
  LOGIN_SUCCEEDED: "Identity.LoginSucceeded",
  LOGIN_FAILED: "Identity.LoginFailed",
  LOGOUT: "Identity.Logout",
  ROLE_ASSIGNED: "Identity.RoleAssigned",
  ROLE_REMOVED: "Identity.RoleRemoved",
  PASSWORD_CHANGED: "Identity.PasswordChanged",
  TOKEN_REVOKED: "Identity.TokenRevoked",
  SESSION_EXPIRED: "Identity.SessionExpired"
} as const;

export type IdentityEventType = typeof IDENTITY_EVENTS[keyof typeof IDENTITY_EVENTS];

export interface IdentityEvent<TPayload = unknown> {
  readonly id: string;
  readonly type: IdentityEventType;
  readonly occurredAt: Date;
  readonly tenantId: string;
  readonly identityId?: string;
  readonly actorId?: string;
  readonly payload: TPayload;
}
