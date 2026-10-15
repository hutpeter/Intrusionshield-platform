import type {
    AuthenticatedIdentityContext
} from "@intrusionshield/identity";

import {
    createAuthenticatedInternationalizationContext,
    normalizeLanguage,
    type InternationalizationClaims
} from "@intrusionshield/internationalization";

import type {
    AuthenticateRequest,
    AuthenticationRepository,
    AuthenticationResult,
    TenantInternationalizationSettingsProvider
} from "../types/authentication.js";

import {
    AccessTokenService
} from "../security/AccessTokenService.js";

import {
    PasswordHasher
} from "../security/PasswordHasher.js";

export class AuthenticationError
extends Error {
    public constructor(
        message = "Authentication failed."
    ) {
        super(message);
        this.name = "AuthenticationError";
    }
}

export class AuthenticationService {
    public constructor(
        private readonly repository:
            AuthenticationRepository,
        private readonly tenantSettings:
            TenantInternationalizationSettingsProvider,
        private readonly passwordHasher:
            PasswordHasher,
        private readonly tokens:
            AccessTokenService
    ) {}

    public async authenticate(
        request: AuthenticateRequest
    ): Promise<AuthenticationResult> {
        const user =
            await this.repository
                .findUserByUsername(
                    request.tenantId,
                    request.username
                );

        if (
            !user ||
            user.identityType !== "USER" ||
            user.status !== "ACTIVE"
        ) {
            throw new AuthenticationError();
        }

        const passwordValid =
            await this.passwordHasher.verify(
                request.password,
                user.passwordHash
            );

        if (!passwordValid) {
            throw new AuthenticationError();
        }

        const tenant =
            await this.tenantSettings
                .getInternationalizationSettings(
                    user.tenantId
                );

        const internationalization =
            createAuthenticatedInternationalizationContext({
                userPreferredLanguage:
                    user.preferredLanguage,
                tenant
            });

        const identity:
            AuthenticatedIdentityContext = {
                identityId:
                    user.identityId,
                tenantId:
                    user.tenantId,
                identityType:
                    user.identityType,
                displayName:
                    user.displayName,
                language:
                    internationalization.language,
                locale:
                    internationalization.locale,
                countryCode:
                    internationalization.countryCode,
                timeZone:
                    internationalization.timeZone
            };

        const claims:
            InternationalizationClaims = {
                language:
                    internationalization.language,
                languageSource:
                    internationalization.languageSource,
                locale:
                    internationalization.locale,
                countryCode:
                    internationalization.countryCode,
                timeZone:
                    internationalization.timeZone
            };

        const issued =
            this.tokens.issue({
                sub: user.identityId,
                tenantId: user.tenantId,
                identityType:
                    user.identityType,
                displayName:
                    user.displayName,
                language:
                    claims.language,
                languageSource:
                    claims.languageSource,
                locale:
                    claims.locale,
                countryCode:
                    claims.countryCode,
                timeZone:
                    claims.timeZone
            });

        return {
            accessToken:
                issued.token,
            expiresAt:
                issued.expiresAt,
            identity,
            internationalization:
                claims
        };
    }

    public async setPreferredLanguage(
        tenantId: string,
        identityId: string,
        language: string | null
    ): Promise<void> {
        if (language === null) {
            await this.repository
                .updatePreferredLanguage(
                    tenantId,
                    identityId,
                    null
                );

            return;
        }

        const normalized =
            normalizeLanguage(language);

        if (normalized === undefined) {
            throw new Error(
                "Unsupported preferred language."
            );
        }

        await this.repository
            .updatePreferredLanguage(
                tenantId,
                identityId,
                normalized
            );
    }
}