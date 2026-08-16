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
}

export interface ServiceIdentity extends Identity {
  readonly type: "SERVICE";
  readonly serviceName: string;
}
