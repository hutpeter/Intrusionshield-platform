import { randomUUID } from "node:crypto";
import {
  SqlServerProvider,
  type DatabaseOptions,
  type IDatabaseProvider,
} from "@intrusionshield/database";
import {
  type Tx,
  type Store,
  type User,
  type Principal,
  type Authority,
  type Role,
  type Tenant,
  type Setup,
  type Audit,
  AccountError,
  fail,
} from "./model.js";
const params = (value: object) =>
  Object.entries(value).map(([name, value]) => ({
    name,
    value: value as string | number | boolean | null,
  }));
const profileSql = `SELECT i.TenantId AS tenantId,i.Id AS id,u.Username AS username,u.Email AS email,i.DisplayName AS displayName,i.Status AS status,
 COALESCE(a.AccountType,N'USER') AS kind,a.PersonId AS personId,COALESCE(a.Version,0) AS version,COALESCE(a.SessionVersion,0) AS sessionVersion,
 COALESCE(a.RequiresSetup,CASE WHEN i.Status=N'PENDING' THEN 1 ELSE 0 END) AS requiresSetup,
 COALESCE(a.FacilityIds,N'[]') AS facilityIds,COALESCE(a.ProductKeys,N'[]') AS productKeys
 FROM [Identity].[Identities] i WITH(UPDLOCK,HOLDLOCK)
 JOIN [Identity].[Users] u WITH(HOLDLOCK) ON u.TenantId=i.TenantId AND u.IdentityId=i.Id
 LEFT JOIN [Identity].[UserAdministration] a WITH(UPDLOCK,HOLDLOCK) ON a.TenantId=i.TenantId AND a.IdentityId=i.Id`;
export class SqlAccountStore implements Store {
  constructor(private factory: () => IDatabaseProvider) {}
  async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const db = this.factory();
    let begun = false;
    try {
      await db.connect();
      await db.beginTransaction();
      begun = true;
      const result = await work(new SqlAccountTx(db));
      await db.commitTransaction();
      begun = false;
      return result;
    } catch (error) {
      if (begun) await db.rollbackTransaction();
      if (error instanceof AccountError) throw error;
      const number =
        (
          error as {
            number?: number;
            originalError?: { info?: { number?: number } };
          }
        )?.number ??
        (error as { originalError?: { info?: { number?: number } } })
          ?.originalError?.info?.number;
      if (number === 2601 || number === 2627 || number === 50001)
        fail(409, "ACCOUNT_ALREADY_EXISTS");
      throw error;
    } finally {
      await db.disconnect();
    }
  }
}
export const createSqlAccountStore = (options: DatabaseOptions) =>
  new SqlAccountStore(() => new SqlServerProvider(options));
class SqlAccountTx implements Tx {
  constructor(private db: IDatabaseProvider) {}
  private async query<T>(sql: string, p: object = {}) {
    return (await this.db.query<T>(sql, params(p))).rows;
  }
  private async execute(sql: string, p: object = {}) {
    return this.db.execute(sql, params(p));
  }
  async authority(p: Principal): Promise<Authority> {
    const platform = await this.query<{ resource: string; action: string }>(
      `SELECT p.Resource AS resource,p.Action AS action FROM [Identity].[PlatformRoleAssignments] a WITH(HOLDLOCK)
   JOIN [Identity].[Roles] r WITH(HOLDLOCK) ON r.Id=a.RoleId AND r.Scope=N'PLATFORM' AND r.TenantId IS NULL
   JOIN [Identity].[RolePermissions] rp WITH(HOLDLOCK) ON rp.RoleId=r.Id AND rp.Scope=N'PLATFORM'
   JOIN [Identity].[Permissions] p WITH(HOLDLOCK) ON p.Id=rp.PermissionId AND p.Scope=N'PLATFORM'
   WHERE a.TenantId=@tenantId AND a.IdentityId=@id AND a.Scope=N'PLATFORM'`,
      p,
    );
    const rows = await this.query<{ resource: string; action: string }>(
      `SELECT p.Resource AS resource,p.Action AS action FROM [Identity].[IdentityRoles] a WITH(HOLDLOCK)
   JOIN [Identity].[Roles] r WITH(HOLDLOCK) ON r.Id=a.RoleId AND r.TenantId=a.TenantId AND r.Scope=N'TENANT'
   JOIN [Identity].[RolePermissions] rp WITH(HOLDLOCK) ON rp.RoleId=r.Id AND rp.Scope=N'TENANT'
   JOIN [Identity].[Permissions] p WITH(HOLDLOCK) ON p.Id=rp.PermissionId AND p.Scope=N'TENANT'
   WHERE a.TenantId=@tenantId AND a.IdentityId=@id AND a.Scope=N'TENANT'`,
      p,
    );
    return {
      superuser: platform.some(
        (x) => x.resource === "platform.users" && x.action === "MANAGE",
      ),
      clientAdmin: rows.some(
        (x) => x.resource === "tenant.users" && x.action === "MANAGE",
      ),
      permissions: rows.map((x) => x.resource + ":" + x.action),
    };
  }
  async user(tenantId: string, id: string): Promise<User | null> {
    const row = (
      await this.query<
        Omit<User, "facilityIds" | "productKeys"> & {
          facilityIds: string;
          productKeys: string;
        }
      >(
        profileSql +
          " WHERE i.TenantId=@tenantId AND i.Id=@id AND i.IdentityType=N'USER'",
        {
          tenantId,
          id,
        },
      )
    )[0];
    if (!row) return null;
    const roles = await this.query<{ id: string }>(
      `SELECT a.RoleId AS id FROM [Identity].[IdentityRoles] a WITH(HOLDLOCK) WHERE a.TenantId=@tenantId AND a.IdentityId=@id AND NOT EXISTS(SELECT 1 FROM [Identity].[RolePermissions] rp JOIN [Identity].[Permissions] p ON p.Id=rp.PermissionId WHERE rp.RoleId=a.RoleId AND (p.Resource=N'tenant.users' OR p.Scope=N'PLATFORM' OR p.Resource LIKE N'platform.%'))`,
      { tenantId, id },
    );
    const authority = await this.authority({ tenantId, id });
    return {
      ...row,
      kind: authority.superuser
        ? "SUPERUSER"
        : authority.clientAdmin
          ? "CLIENT_ADMIN"
          : "USER",
      facilityIds: JSON.parse(row.facilityIds as string),
      productKeys: JSON.parse(row.productKeys as string),
      roleIds: roles.map((x) => x.id),
      requiresSetup: !!row.requiresSetup,
    };
  }
  async tenants(tenantId?: string) {
    return this.query<Tenant>(
      `SELECT TOP(501) Id AS id,DisplayName AS displayName,Status AS status FROM [Platform].[Tenants] WITH(HOLDLOCK) ${tenantId ? "WHERE Id=@tenantId" : ""} ORDER BY DisplayName,Id`,
      tenantId ? { tenantId } : {},
    );
  }
  async roles(tenantId: string) {
    const rows = await this.query<{
      id: string;
      name: string;
      resource: string | null;
      action: string | null;
      scope: string | null;
    }>(
      `SELECT r.Id AS id,r.Name AS name,p.Resource AS resource,p.Action AS action,p.Scope AS scope FROM [Identity].[Roles] r WITH(HOLDLOCK)
   LEFT JOIN [Identity].[RolePermissions] rp WITH(HOLDLOCK) ON rp.RoleId=r.Id AND rp.Scope=N'TENANT'
   LEFT JOIN [Identity].[Permissions] p WITH(HOLDLOCK) ON p.Id=rp.PermissionId
   WHERE r.TenantId=@tenantId AND r.Scope=N'TENANT' ORDER BY r.Id,p.Resource,p.Action`,
      { tenantId },
    );
    const out = new Map<string, Role>();
    for (const row of rows) {
      const r = out.get(row.id) ?? {
        id: row.id,
        name: row.name,
        permissions: [],
        administrative: false,
      };
      if (row.resource) {
        r.permissions.push(row.resource + ":" + row.action);
        if (
          row.scope !== "TENANT" ||
          row.resource === "tenant.users" ||
          row.resource.startsWith("platform.")
        )
          r.administrative = true;
      }
      out.set(row.id, r);
    }
    if (out.size > 500) fail(503, "ROLE_CATALOG_TOO_LARGE");
    return [...out.values()];
  }
  async users(tenantId: string, offset: number) {
    const rows = await this.query<{ id: string }>(
      `SELECT i.Id AS id FROM [Identity].[Identities] i JOIN [Identity].[Users] u ON u.TenantId=i.TenantId AND u.IdentityId=i.Id WHERE i.TenantId=@tenantId AND i.IdentityType=N'USER' ORDER BY u.Username,i.Id OFFSET @offset ROWS FETCH NEXT 51 ROWS ONLY`,
      { tenantId, offset },
    );
    const result: User[] = [];
    for (const r of rows) {
      const u = await this.user(tenantId, r.id);
      if (u) result.push(u);
    }
    return result;
  }
  async create(user: User) {
    await this.execute(
      `IF EXISTS(SELECT 1 FROM [Identity].[Users] WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenantId AND (NormalizedUsername=UPPER(@username) OR NormalizedEmail=UPPER(@email))) THROW 50001,'Account already exists',1;
   INSERT INTO [Identity].[Identities](TenantId,Id,IdentityType,Status,DisplayName,CreatedAt,UpdatedAt) VALUES(@tenantId,@id,N'USER',@status,@displayName,SYSUTCDATETIME(),SYSUTCDATETIME());
   INSERT INTO [Identity].[Users](TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail,EmailVerified,PreferredLanguage,CreatedAt,UpdatedAt) VALUES(@tenantId,@id,@username,UPPER(@username),@email,UPPER(@email),0,NULL,SYSUTCDATETIME(),SYSUTCDATETIME());`,
      {
        tenantId: user.tenantId,
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        displayName: user.displayName,
      },
    );
    await this.metadata(user, 0);
    await this.assign(user);
  }
  private async metadata(u: User, expected: number) {
    const p = {
      tenantId: u.tenantId,
      id: u.id,
      kind: u.kind,
      personId: u.personId,
      version: u.version,
      sessionVersion: u.sessionVersion,
      requiresSetup: u.requiresSetup,
      facilityIds: JSON.stringify(u.facilityIds),
      productKeys: JSON.stringify(u.productKeys),
      expected,
    };
    if (expected === 0)
      await this.execute(
        `INSERT INTO [Identity].[UserAdministration](TenantId,IdentityId,AccountType,PersonId,Version,SessionVersion,RequiresSetup,FacilityIds,ProductKeys) VALUES(@tenantId,@id,@kind,@personId,@version,@sessionVersion,@requiresSetup,@facilityIds,@productKeys)`,
        p,
      );
    else if (
      (await this.execute(
        `UPDATE [Identity].[UserAdministration] SET AccountType=@kind,PersonId=@personId,Version=@version,SessionVersion=@sessionVersion,RequiresSetup=@requiresSetup,FacilityIds=@facilityIds,ProductKeys=@productKeys WHERE TenantId=@tenantId AND IdentityId=@id AND Version=@expected`,
        p,
      )) !== 1
    )
      fail(409, "STALE_ACCOUNT");
  }
  async save(u: User, expected: number, accessChanged = false) {
    await this.metadata(u, expected);
    if (
      (await this.execute(
        `UPDATE [Identity].[Identities] SET Status=@status,UpdatedAt=SYSUTCDATETIME() WHERE TenantId=@tenantId AND Id=@id`,
        { tenantId: u.tenantId, id: u.id, status: u.status },
      )) !== 1
    )
      fail(409, "STALE_ACCOUNT");
    if (accessChanged) await this.assign(u);
  }
  private async assign(u: User) {
    await this.execute(
      `DELETE FROM [Identity].[IdentityRoles] WHERE TenantId=@tenantId AND IdentityId=@id AND Scope=N'TENANT'`,
      { tenantId: u.tenantId, id: u.id },
    );
    const roles = [...u.roleIds];
    if (u.kind === "CLIENT_ADMIN") {
      let r = (
        await this.query<{ id: string }>(
          `SELECT Id AS id FROM [Identity].[Roles] WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenantId AND Scope=N'TENANT' AND Name=N'Ruby client administrator'`,
          { tenantId: u.tenantId },
        )
      )[0];
      if (!r) {
        r = { id: randomUUID() };
        await this.execute(
          `INSERT INTO [Identity].[Roles](Id,TenantId,Name,Scope) VALUES(@id,@tenantId,N'Ruby client administrator',N'TENANT'); INSERT INTO [Identity].[RolePermissions](RoleId,PermissionId,Scope) SELECT @id,Id,N'TENANT' FROM [Identity].[Permissions] WHERE Resource=N'tenant.users' AND Action=N'MANAGE' AND Scope=N'TENANT';`,
          { id: r.id, tenantId: u.tenantId },
        );
      }
      const permissions = (await this.roles(u.tenantId)).find(
        (x) => x.id === r!.id,
      );
      if (
        !permissions ||
        permissions.permissions.length !== 1 ||
        permissions.permissions[0] !== "tenant.users:MANAGE"
      )
        fail(409, "ADMIN_ROLE_CONFLICT");
      roles.push(r.id);
    }
    for (const roleId of roles)
      await this.execute(
        `INSERT INTO [Identity].[IdentityRoles](TenantId,IdentityId,RoleId,Scope) VALUES(@tenantId,@id,@roleId,N'TENANT')`,
        { tenantId: u.tenantId, id: u.id, roleId },
      );
  }
  async setup(r: Setup) {
    await this.execute(
      `INSERT INTO [Authentication].[AccountSetupTokens](TokenHash,TenantId,IdentityId,ExpiresAt,UsedAt) VALUES(@hash,@tenantId,@id,@expiresAt,NULL)`,
      r,
    );
  }
  async findSetup(hash: string) {
    const r = (
      await this.query<Setup & { expiresAt: Date; usedAt: Date | null }>(
        `SELECT TokenHash AS hash,TenantId AS tenantId,IdentityId AS id,ExpiresAt AS expiresAt,UsedAt AS usedAt FROM [Authentication].[AccountSetupTokens] WITH(UPDLOCK,HOLDLOCK) WHERE TokenHash=@hash`,
        { hash },
      )
    )[0];
    return r
      ? {
          ...r,
          expiresAt: new Date(r.expiresAt).toISOString(),
          usedAt: r.usedAt ? new Date(r.usedAt).toISOString() : null,
        }
      : null;
  }
  async useSetup(hash: string, at: string) {
    if (hash.startsWith("account:")) {
      const [, tenantId, id] = hash.split(":");
      await this.execute(
        `UPDATE [Authentication].[AccountSetupTokens] SET UsedAt=@at WHERE TenantId=@tenantId AND IdentityId=@id AND UsedAt IS NULL`,
        { tenantId, id, at },
      );
    } else
      await this.execute(
        `UPDATE [Authentication].[AccountSetupTokens] SET UsedAt=@at WHERE TokenHash=@hash AND UsedAt IS NULL`,
        { hash, at },
      );
  }
  async credential(u: User, hash: string) {
    await this.execute(
      `IF EXISTS(SELECT 1 FROM [Authentication].[Credentials] WITH(UPDLOCK,HOLDLOCK) WHERE TenantId=@tenantId AND IdentityId=@id)
 UPDATE [Authentication].[Credentials] SET PasswordHash=@hash,PasswordChangedAt=SYSUTCDATETIME(),UpdatedAt=SYSUTCDATETIME() WHERE TenantId=@tenantId AND IdentityId=@id;
 ELSE INSERT INTO [Authentication].[Credentials](TenantId,IdentityId,PasswordHash,PasswordChangedAt,FailedAttemptCount,LockedUntil,CreatedAt,UpdatedAt) VALUES(@tenantId,@id,@hash,SYSUTCDATETIME(),0,NULL,SYSUTCDATETIME(),SYSUTCDATETIME());`,
      { tenantId: u.tenantId, id: u.id, hash },
    );
  }
  async audit(e: Audit) {
    await this.execute(
      `INSERT INTO [Identity].[AccountAdministrationAudit](Id,TenantId,ActorTenantId,ActorId,TargetId,Action,At,Reason,Version,Details) VALUES(@id,@tenantId,@actorTenantId,@actorId,@targetId,@action,@at,@reason,@version,@details)`,
      e,
    );
  }
  async history(tenantId: string, offset: number) {
    return this.query<Audit>(
      `SELECT Id AS id,TenantId AS tenantId,ActorTenantId AS actorTenantId,ActorId AS actorId,TargetId AS targetId,Action AS action,At AS at,Reason AS reason,Version AS version,Details AS details FROM [Identity].[AccountAdministrationAudit] WHERE TenantId=@tenantId ORDER BY At DESC,Id DESC OFFSET @offset ROWS FETCH NEXT 51 ROWS ONLY`,
      { tenantId, offset },
    );
  }
}
