import {
    createHmac,
    timingSafeEqual
} from "node:crypto";

import type {
    AccessTokenClaims
} from "../types/authentication.js";

export interface AccessTokenConfiguration {
    readonly secret: string;
    readonly issuer: string;
    readonly audience: string;
    readonly lifetimeSeconds: number;
}

function encode(value: string): string {
    return Buffer
        .from(value, "utf8")
        .toString("base64url");
}

function decode(value: string): string {
    return Buffer
        .from(value, "base64url")
        .toString("utf8");
}

export class AccessTokenService {
    public constructor(
        private readonly configuration:
            AccessTokenConfiguration
    ) {
        if (
            configuration.secret.length < 32
        ) {
            throw new Error(
                "Authentication token secret must be at least 32 characters."
            );
        }

        if (
            configuration.lifetimeSeconds <= 0
        ) {
            throw new Error(
                "Authentication token lifetime must be greater than zero."
            );
        }
    }

    public issue(
        claims: Omit<
            AccessTokenClaims,
            "iss" | "aud" | "iat" | "exp"
        >
    ): {
        token: string;
        expiresAt: Date;
    } {
        const issuedAt = Math.floor(
            Date.now() / 1000
        );

        const expiresAt =
            issuedAt +
            this.configuration.lifetimeSeconds;

        const completeClaims:
            AccessTokenClaims = {
                ...claims,
                iss:
                    this.configuration.issuer,
                aud:
                    this.configuration.audience,
                iat: issuedAt,
                exp: expiresAt
            };

        const header = encode(
            JSON.stringify({
                alg: "HS256",
                typ: "JWT"
            })
        );

        const payload = encode(
            JSON.stringify(
                completeClaims
            )
        );

        const unsigned =
            `${header}.${payload}`;

        const signature =
            this.sign(unsigned);

        return {
            token:
                `${unsigned}.${signature}`,
            expiresAt:
                new Date(expiresAt * 1000)
        };
    }

    public verify(
        token: string
    ): AccessTokenClaims {
        const parts = token.split(".");

        if (parts.length !== 3) {
            throw new Error(
                "Invalid access token."
            );
        }

        const [
            header,
            payload,
            signature
        ] = parts;

        if (
            !header ||
            !payload ||
            !signature
        ) {
            throw new Error(
                "Invalid access token."
            );
        }

        const unsigned =
            `${header}.${payload}`;

        const expected =
            Buffer.from(
                this.sign(unsigned),
                "utf8"
            );

        const actual =
            Buffer.from(
                signature,
                "utf8"
            );

        if (
            actual.length !==
                expected.length ||
            !timingSafeEqual(
                actual,
                expected
            )
        ) {
            throw new Error(
                "Invalid access token signature."
            );
        }

        const parsedHeader =
            JSON.parse(
                decode(header)
            ) as {
                alg?: string;
                typ?: string;
            };

        if (
            parsedHeader.alg !== "HS256" ||
            parsedHeader.typ !== "JWT"
        ) {
            throw new Error(
                "Unsupported access token."
            );
        }

        const claims =
            JSON.parse(
                decode(payload)
            ) as AccessTokenClaims;

        const now = Math.floor(
            Date.now() / 1000
        );

        if (
            claims.iss !==
                this.configuration.issuer ||
            claims.aud !==
                this.configuration.audience ||
            claims.exp <= now
        ) {
            throw new Error(
                "Access token is expired or invalid."
            );
        }

        return claims;
    }

    private sign(
        unsignedToken: string
    ): string {
        return createHmac(
            "sha256",
            this.configuration.secret
        )
            .update(unsignedToken)
            .digest("base64url");
    }
}
