import type {
    IDatabaseProvider,
    SqlParameter
} from "@intrusionshield/database";

import type {
    AuthenticationRepository,
    AuthenticationUserRecord
} from "../types/authentication.js";

interface AuthenticationUserRow {
    identityId: string;
    tenantId: string;
    identityType: AuthenticationUserRecord["identityType"];
    status: AuthenticationUserRecord["status"];
    displayName: string;
    username: string;
    email: string;
    passwordHash: string;
    preferredLanguage: string | null;
}

export class SqlAuthenticationRepository
implements AuthenticationRepository {
    public constructor(
        private readonly database:
            IDatabaseProvider
    ) {}

    public async findUserByUsername(
        tenantId: string,
        username: string
    ): Promise<AuthenticationUserRecord | null> {
        const parameters:
            SqlParameter[] = [
                {
                    name: "tenantId",
                    value: tenantId
                },
                {
                    name: "username",
                    value: username
                }
            ];

        const result =
            await this.database.query<
                AuthenticationUserRow
            >(
                `
SELECT TOP (1)
    i.Id AS identityId,
    i.TenantId AS tenantId,
    i.IdentityType AS identityType,
    i.Status AS status,
    i.DisplayName AS displayName,
    u.Username AS username,
    u.Email AS email,
    c.PasswordHash AS passwordHash,
    u.PreferredLanguage AS preferredLanguage
FROM [Identity].[Identities] i
INNER JOIN [Identity].[Users] u
    ON u.IdentityId = i.Id
    AND u.TenantId = i.TenantId
INNER JOIN [Authentication].[Credentials] c
    ON c.IdentityId = i.Id
    AND c.TenantId = i.TenantId
WHERE
    i.TenantId = @tenantId
    AND u.NormalizedUsername = UPPER(LTRIM(RTRIM(@username)));
                `,
                parameters
            );

        const row =
            result.rows[0];

        if (!row) {
            return null;
        }

        return {
            identityId: row.identityId,
            tenantId: row.tenantId,
            identityType: row.identityType,
            status: row.status,
            displayName: row.displayName,
            username: row.username,
            email: row.email,
            passwordHash: row.passwordHash,
            preferredLanguage:
                row.preferredLanguage ??
                undefined
        };
    }

    public async updatePreferredLanguage(
        tenantId: string,
        identityId: string,
        preferredLanguage: string | null
    ): Promise<void> {
        const affected =
            await this.database.execute(
                `
UPDATE [Identity].[Users]
SET
    PreferredLanguage = @preferredLanguage,
    UpdatedAt = SYSUTCDATETIME()
WHERE
    TenantId = @tenantId
    AND IdentityId = @identityId;
                `,
                [
                    {
                        name: "tenantId",
                        value: tenantId
                    },
                    {
                        name: "identityId",
                        value: identityId
                    },
                    {
                        name: "preferredLanguage",
                        value:
                            preferredLanguage
                    }
                ]
            );

        if (affected !== 1) {
            throw new Error(
                "Authenticated user was not found."
            );
        }
    }
}
