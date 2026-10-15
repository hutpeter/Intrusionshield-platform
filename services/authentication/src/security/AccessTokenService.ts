import jwt from "jsonwebtoken";

import type {
    AccessTokenClaims
} from "../types/authentication.js";

export interface AccessTokenConfiguration {
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly lifetimeSeconds: number;
}

type IssuableClaims =
    Omit<
        AccessTokenClaims,
        "iss" | "aud" | "iat" | "exp"
    >;

export class AccessTokenService {
    public constructor(
        private readonly configuration:
            AccessTokenConfiguration
    ) {
        if (
            configuration.secret.length <
            32
        ) {
            throw new Error(
                "Authentication token secret must be at least 32 characters."
            );
        }

        if (
            configuration.lifetimeSeconds <=
            0
        ) {
            throw new Error(
                "Authentication token lifetime must be greater than zero."
            );
        }
    }

    public issue(
        claims: IssuableClaims
    ): {
        token: string;
        expiresAt: Date;
    } {
        const {
            sub,
            ...applicationClaims
        } = claims;

        const issuedAt =
            Math.floor(Date.now() / 1000);

        const expiresAt =
            issuedAt +
            this.configuration.lifetimeSeconds;

        const token =
            jwt.sign(
                applicationClaims,
                this.configuration.secret,
                {
                    algorithm: "HS256",
                    issuer:
                        this.configuration.issuer,
                    audience:
                        this.configuration.audience,
                    subject: sub,
                    expiresIn:
                        this.configuration.lifetimeSeconds,
                    noTimestamp: false
                }
            );

        return {
            token,
            expiresAt:
                new Date(expiresAt * 1000)
        };
    }

    public verify(
        token: string
    ): AccessTokenClaims {
        const decoded =
            jwt.verify(
                token,
                this.configuration.secret,
                {
                    algorithms: ["HS256"],
                    issuer:
                        this.configuration.issuer,
                    audience:
                        this.configuration.audience
                }
            );

        if (
            typeof decoded === "string"
        ) {
            throw new Error(
                "Invalid access token payload."
            );
        }

        const {
            iss,
            aud,
            sub,
            tenantId,
            identityType,
            displayName,
            language,
            languageSource,
            locale,
            countryCode,
            timeZone,
            iat,
            exp
        } = decoded;

        if (
            typeof iss !== "string" ||
            typeof sub !== "string" ||
            typeof tenantId !== "string" ||
            typeof identityType !== "string" ||
            typeof displayName !== "string" ||
            typeof language !== "string" ||
            typeof languageSource !== "string" ||
            typeof iat !== "number" ||
            typeof exp !== "number"
        ) {
            throw new Error(
                "Invalid access token claims."
            );
        }

        const audience =
            Array.isArray(aud)
                ? aud[0]
                : aud;

        if (
            typeof audience !== "string"
        ) {
            throw new Error(
                "Invalid access token audience."
            );
        }

        return {
            iss,
            aud: audience,
            sub,
            tenantId,
            identityType:
                identityType as
                    AccessTokenClaims["identityType"],
            displayName,
            language,
            languageSource,
            locale:
                typeof locale === "string"
                    ? locale
                    : undefined,
            countryCode:
                typeof countryCode === "string"
                    ? countryCode
                    : undefined,
            timeZone:
                typeof timeZone === "string"
                    ? timeZone
                    : undefined,
            iat,
            exp
        };
    }
}