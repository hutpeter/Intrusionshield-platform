import type {
    AuthenticatedIdentityContext,
    IdentityStatus,
    IdentityType
} from "@intrusionshield/identity";

import type {
    InternationalizationClaims,
    TenantInternationalizationSettings
} from "@intrusionshield/internationalization";

export interface AuthenticationUserRecord {
    readonly identityId: string;
    readonly tenantId: string;
    readonly identityType: IdentityType;
    readonly status: IdentityStatus;
    readonly displayName: string;
    readonly username: string;
    readonly email: string;
    readonly passwordHash: string;
    readonly preferredLanguage?: string;
}

export interface AuthenticationRepository {
    findUserByUsername(
        tenantId: string,
        username: string
    ): Promise<AuthenticationUserRecord | null>;

    updatePreferredLanguage(
        tenantId: string,
        identityId: string,
        preferredLanguage: string | null
    ): Promise<void>;
}

export interface TenantInternationalizationSettingsProvider {
    getInternationalizationSettings(
        tenantId: string
    ): Promise<TenantInternationalizationSettings | null>;
}

export interface AuthenticateRequest {
    readonly tenantId: string;
    readonly username: string;
    readonly password: string;
}

export interface AuthenticationResult {
    readonly accessToken: string;
    readonly expiresAt: Date;
    readonly identity: AuthenticatedIdentityContext;
    readonly internationalization: InternationalizationClaims;
}

export interface AccessTokenClaims {
    readonly iss: string;
    readonly aud: string;
    readonly sub: string;
    readonly tenantId: string;
    readonly identityType: IdentityType;
    readonly displayName: string;
    readonly language: string;
    readonly languageSource: string;
    readonly locale?: string;
    readonly countryCode?: string;
    readonly timeZone?: string;
    readonly iat: number;
    readonly exp: number;
}
