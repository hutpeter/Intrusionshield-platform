export type IdentityType = "USER" | "SERVICE" | "APPLICATION" | "API";

export type IdentityStatus = "ACTIVE" | "SUSPENDED" | "DISABLED" | "PENDING";

export interface Identity {
  readonly id: string;
  readonly tenantId: string;
  readonly type: IdentityType;
  readonly status: IdentityStatus;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserIdentity extends Identity {
  readonly type: "USER";
  readonly username: string;
  readonly email: string;
  readonly emailVerified: boolean;

  /**
   * Explicit language preference selected by the user.
   *
   * Undefined means the user has not selected a preference and the
   * tenant/system language-resolution policy should be used.
   *
   * This value is intentionally represented as a language identifier
   * rather than a locale, country, or timezone.
   */
  readonly preferredLanguage?: string;
}

export interface ServiceIdentity extends Identity {
  readonly type: "SERVICE";
  readonly serviceName: string;
}

/**
 * Language-aware identity information made available after authentication.
 *
 * `language` is the effective language for the current authenticated
 * session. The persisted user preference remains on UserIdentity.
 *
 * The type remains string here so the identity package does not need to
 * depend directly on the internationalization package.
 */
export interface AuthenticatedIdentityContext {
  readonly identityId: string;
  readonly tenantId: string;
  readonly identityType: IdentityType;
  readonly displayName: string;
  readonly language: string;
  readonly locale?: string;
  readonly countryCode?: string;
  readonly timeZone?: string;
}
