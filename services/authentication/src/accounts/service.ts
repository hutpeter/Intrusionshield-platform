import { PasswordHasher } from "../security/PasswordHasher.js";
import {
  type Store,
  type Tx,
  type User,
  type Principal,
  type Authority,
  fail,
  uuid,
  optionalPersonId,
  exact,
  text,
  scopes,
  ids,
  newSetup,
  tokenHash,
  newId,
} from "./model.js";
export class AccountAdministration {
  constructor(
    private store: Store,
    private hasher = new PasswordHasher(),
    private clock = () => new Date(),
  ) {}
  private async actor(tx: Tx, p: Principal) {
    uuid(p.id);
    uuid(p.tenantId);
    const user = await tx.user(p.tenantId, p.id);
    if (
      !user ||
      user.status !== "ACTIVE" ||
      user.requiresSetup ||
      p.sessionVersion !== user.sessionVersion
    )
      fail(401, "SIGN_IN_REQUIRED");
    const authority = await tx.authority(p);
    if (!authority.superuser) await this.tenant(tx, p.tenantId);
    return { user, authority };
  }
  private manage(p: Principal, a: Authority, tenantId: string) {
    if (!a.superuser && (!a.clientAdmin || p.tenantId !== tenantId))
      fail(403, "ACCOUNT_ADMIN_REQUIRED");
  }
  private async tenant(tx: Tx, id: string) {
    const t = (await tx.tenants(id)).find((x) => x.id === id);
    if (!t || t.status !== "ACTIVE") fail(409, "CLIENT_UNAVAILABLE");
  }
  private async access(
    tx: Tx,
    actor: User,
    a: Authority,
    tenantId: string,
    input: Record<string, unknown>,
  ) {
    if (input.kind !== "USER" && input.kind !== "CLIENT_ADMIN")
      fail(400, "INVALID_ACCOUNT_TYPE");
    if (input.kind === "CLIENT_ADMIN" && !a.superuser)
      fail(403, "SUPERUSER_REQUIRED");
    const assigned = scopes(input),
      roleIds = ids(input.roleIds),
      catalog = await tx.roles(tenantId);
    for (const id of roleIds) {
      const r = catalog.find((x) => x.id === id);
      if (!r || r.administrative) fail(403, "ROLE_NOT_DELEGATABLE");
      if (!a.superuser && r.permissions.some((x) => !a.permissions.includes(x)))
        fail(403, "ROLE_NOT_DELEGATABLE");
    }
    if (
      !a.superuser &&
      (assigned.facilityIds.some((x) => !actor.facilityIds.includes(x)) ||
        assigned.productKeys.some((x) => !actor.productKeys.includes(x)))
    )
      fail(403, "ACCESS_NOT_DELEGATABLE");
    return {
      ...assigned,
      roleIds,
      kind: input.kind as "USER" | "CLIENT_ADMIN",
    };
  }
  private event(tx: Tx, p: Principal, u: User, action: string, reason: string) {
    return tx.audit({
      id: newId(),
      tenantId: u.tenantId,
      actorTenantId: p.tenantId,
      actorId: p.id,
      targetId: u.id,
      action,
      at: this.clock().toISOString(),
      reason,
      version: u.version,
      details: JSON.stringify({
        kind: u.kind,
        status: u.status,
        personId: u.personId,
        roleIds: u.roleIds,
        facilityIds: u.facilityIds,
        productKeys: u.productKeys,
      }),
    });
  }
  async context(p: Principal) {
    return this.store.transaction(async (tx) => {
      const { user, authority } = await this.actor(tx, p);
      return {
        kind: authority.superuser
          ? "SUPERUSER"
          : authority.clientAdmin
            ? "CLIENT_ADMIN"
            : "USER",
        tenantId: p.tenantId,
        facilityIds: user.facilityIds,
        productKeys: user.productKeys,
      };
    });
  }
  async tenants(p: Principal) {
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, p.tenantId);
      return tx.tenants(authority.superuser ? undefined : p.tenantId);
    });
  }
  async list(p: Principal, tenantId: string, offset = 0) {
    uuid(tenantId);
    this.page(offset);
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, tenantId);
      return tx.users(tenantId, offset);
    });
  }
  async roles(p: Principal, tenantId: string) {
    uuid(tenantId);
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, tenantId);
      return (await tx.roles(tenantId)).filter(
        (r) =>
          !r.administrative &&
          (authority.superuser ||
            r.permissions.every((x) => authority.permissions.includes(x))),
      );
    });
  }
  async history(p: Principal, tenantId: string, offset = 0) {
    uuid(tenantId);
    this.page(offset);
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, tenantId);
      return tx.history(tenantId, offset);
    });
  }
  private page(offset: number) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      fail(400, "INVALID_PAGE");
  }
  async create(p: Principal, tenantId: string, input: unknown) {
    uuid(tenantId);
    const v = exact(input, [
      "username",
      "email",
      "displayName",
      "kind",
      "personId",
      "roleIds",
      "facilityIds",
      "productKeys",
      "reason",
    ]);
    return this.store.transaction(async (tx) => {
      const { user: actor, authority } = await this.actor(tx, p);
      this.manage(p, authority, tenantId);
      await this.tenant(tx, tenantId);
      const access = await this.access(tx, actor, authority, tenantId, v),
        username = text(v.username, 200),
        email = text(v.email, 320),
        displayName = text(v.displayName, 200),
        reason = text(v.reason, 500);
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{1,199}$/.test(username) ||
        !/^\S+@\S+\.\S+$/.test(email)
      )
        fail(400, "INVALID_PROFILE");
      const user: User = {
        ...access,
        tenantId,
        id: newId(),
        username,
        email,
        displayName,
        personId: optionalPersonId(v.personId),
        status: "PENDING",
        version: 1,
        sessionVersion: 1,
        requiresSetup: true,
      };
      await tx.create(user);
      const setup = newSetup(user, this.clock());
      await tx.setup(setup.record);
      await this.event(tx, p, user, "ACCOUNT_CREATED", reason);
      return {
        user,
        setupToken: setup.token,
        expiresAt: setup.record.expiresAt,
      };
    });
  }
  async accessChange(
    p: Principal,
    tenantId: string,
    id: string,
    input: unknown,
  ) {
    uuid(tenantId);
    uuid(id);
    const v = exact(input, [
      "version",
      "kind",
      "personId",
      "roleIds",
      "facilityIds",
      "productKeys",
      "reason",
    ]);
    return this.store.transaction(async (tx) => {
      const { user: actor, authority } = await this.actor(tx, p);
      this.manage(p, authority, tenantId);
      await this.tenant(tx, tenantId);
      const old = await this.target(tx, p, authority, tenantId, id, v.version);
      const personId = optionalPersonId(v.personId);
      if (old.personId && old.personId !== personId)
        fail(409, "PERSON_MAPPING_IMMUTABLE");
      const access = await this.access(tx, actor, authority, tenantId, v),
        reason = text(v.reason, 500),
        user = {
          ...old,
          ...access,
          personId,
          version: old.version + 1,
          sessionVersion: old.sessionVersion + 1,
        };
      await tx.save(user, old.version, true);
      await this.event(tx, p, user, "ACCOUNT_ACCESS_CHANGED", reason);
      return { user };
    });
  }
  private async target(
    tx: Tx,
    p: Principal,
    a: Authority,
    t: string,
    id: string,
    version: unknown,
  ) {
    if (!Number.isInteger(version) || Number(version) < 0)
      fail(400, "INVALID_VERSION");
    const user = await tx.user(t, id);
    if (!user) fail(404, "ACCOUNT_NOT_FOUND");
    if (
      user.kind === "SUPERUSER" ||
      (p.tenantId === t && p.id === id) ||
      (!a.superuser && user.kind !== "USER")
    )
      fail(403, "ACCOUNT_NOT_MANAGEABLE");
    if (!a.superuser) {
      const actor = await tx.user(p.tenantId, p.id);
      const roles = await tx.roles(t);
      if (
        !actor ||
        user.facilityIds.some((x) => !actor.facilityIds.includes(x)) ||
        user.productKeys.some((x) => !actor.productKeys.includes(x)) ||
        user.roleIds.some((id) => {
          const role = roles.find((r) => r.id === id);
          return (
            !role ||
            role.administrative ||
            role.permissions.some(
              (permission) => !a.permissions.includes(permission),
            )
          );
        })
      )
        fail(403, "ACCESS_NOT_DELEGATABLE");
    }
    if (user.version !== version) fail(409, "STALE_ACCOUNT");
    return user;
  }
  async status(p: Principal, t: string, id: string, input: unknown) {
    uuid(t);
    uuid(id);
    const v = exact(input, ["version", "enabled", "reason"]);
    if (typeof v.enabled !== "boolean") fail(400, "INVALID_STATUS");
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, t);
      const old = await this.target(tx, p, authority, t, id, v.version);
      if (v.enabled) await this.tenant(tx, t);
      const user: User = {
        ...old,
        status: v.enabled
          ? old.requiresSetup
            ? "PENDING"
            : "ACTIVE"
          : "DISABLED",
        version: old.version + 1,
        sessionVersion: old.sessionVersion + 1,
      };
      await tx.save(user, old.version);
      if (!v.enabled)
        await tx.useSetup(
          "account:" + t + ":" + id,
          this.clock().toISOString(),
        );
      await this.event(
        tx,
        p,
        user,
        v.enabled ? "ACCOUNT_ENABLED" : "ACCOUNT_DISABLED",
        text(v.reason, 500),
      );
      return { user };
    });
  }
  async reset(p: Principal, t: string, id: string, input: unknown) {
    uuid(t);
    uuid(id);
    const v = exact(input, ["version", "reason"]);
    return this.store.transaction(async (tx) => {
      const { authority } = await this.actor(tx, p);
      this.manage(p, authority, t);
      await this.tenant(tx, t);
      const old = await this.target(tx, p, authority, t, id, v.version);
      if (old.status === "DISABLED" || old.status === "SUSPENDED")
        fail(409, "ACCOUNT_DISABLED");
      const user: User = {
        ...old,
        status: "PENDING",
        requiresSetup: true,
        version: old.version + 1,
        sessionVersion: old.sessionVersion + 1,
      };
      await tx.save(user, old.version);
      await tx.useSetup("account:" + t + ":" + id, this.clock().toISOString());
      const setup = newSetup(user, this.clock());
      await tx.setup(setup.record);
      await this.event(
        tx,
        p,
        user,
        "PASSWORD_SETUP_ISSUED",
        text(v.reason, 500),
      );
      return {
        user,
        setupToken: setup.token,
        expiresAt: setup.record.expiresAt,
      };
    });
  }
  async complete(input: unknown) {
    const v = exact(input, ["token", "password"]);
    if (
      typeof v.token !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(v.token) ||
      typeof v.password !== "string" ||
      v.password.length < 12 ||
      v.password.length > 128
    )
      fail(400, "INVALID_SETUP");
    const token = v.token,
      hash = await this.hasher.hash(v.password);
    return this.store.transaction(async (tx) => {
      const setup = await tx.findSetup(tokenHash(token));
      if (
        !setup ||
        setup.usedAt ||
        Date.parse(setup.expiresAt) <= this.clock().getTime()
      )
        fail(400, "SETUP_LINK_EXPIRED_OR_USED");
      const old = await tx.user(setup.tenantId, setup.id);
      if (!old || old.status !== "PENDING" || !old.requiresSetup)
        fail(400, "SETUP_LINK_EXPIRED_OR_USED");
      await this.tenant(tx, old.tenantId);
      const user: User = {
        ...old,
        status: "ACTIVE",
        requiresSetup: false,
        version: old.version + 1,
        sessionVersion: old.sessionVersion + 1,
      };
      await tx.credential(user, hash);
      await tx.save(user, old.version);
      await tx.useSetup(
        "account:" + old.tenantId + ":" + old.id,
        this.clock().toISOString(),
      );
      await this.event(
        tx,
        { tenantId: old.tenantId, id: old.id },
        user,
        "PASSWORD_CONFIGURED",
        "User completed private password setup",
      );
      return { configured: true };
    });
  }
  async session(tenantId: string, id: string) {
    return this.store.transaction(async (tx) => {
      const user = await tx.user(tenantId, id);
      if (!user) return null;
      const authority = await tx.authority({ tenantId, id });
      const activeClient =
        authority.superuser ||
        (await tx.tenants(tenantId)).some(
          (t) => t.id === tenantId && t.status === "ACTIVE",
        );
      return {
        sessionVersion: user.sessionVersion,
        requiresSetup: user.requiresSetup || !activeClient,
      };
    });
  }
}
