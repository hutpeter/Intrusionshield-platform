import { randomUUID } from "node:crypto";
import { PasswordHasher } from "../dist/security/PasswordHasher.js";
import { AccountAdministration } from "../dist/accounts/service.js";
import { AccountError } from "../dist/accounts/model.js";
export function accountFixture() {
  const tenantA = randomUUID(),
    tenantB = randomUUID(),
    facility = randomUUID(),
    role = randomUUID(),
    highRole = randomUUID(),
    foreignRole = randomUUID(),
    adminRole = randomUUID();
  const mk = (tenantId, kind, name) => ({
    tenantId,
    id: randomUUID(),
    username: name,
    email: name + "@example.invalid",
    displayName: name,
    kind,
    status: "ACTIVE",
    personId: null,
    roleIds: [role],
    facilityIds: [facility],
    productKeys: ["athena"],
    version: 1,
    sessionVersion: 1,
    requiresSetup: false,
  });
  const root = mk(tenantA, "SUPERUSER", "root"),
    admin = mk(tenantA, "CLIENT_ADMIN", "admin"),
    regular = mk(tenantA, "USER", "regular"),
    foreign = mk(tenantB, "CLIENT_ADMIN", "foreign");
  const state = {
    users: [root, admin, regular, foreign],
    tenants: [
      { id: tenantA, displayName: "Client A", status: "ACTIVE" },
      { id: tenantB, displayName: "Client B", status: "ACTIVE" },
    ],
    roles: [
      {
        tenantId: tenantA,
        id: role,
        name: "Reader",
        permissions: ["athena.people:READ"],
        administrative: false,
      },
      {
        tenantId: tenantA,
        id: highRole,
        name: "Writer",
        permissions: ["athena.people:WRITE"],
        administrative: false,
      },
      {
        tenantId: tenantB,
        id: foreignRole,
        name: "Foreign reader",
        permissions: ["athena.people:READ"],
        administrative: false,
      },
      {
        tenantId: tenantA,
        id: adminRole,
        name: "Admin",
        permissions: ["tenant.users:MANAGE"],
        administrative: true,
      },
    ],
    setups: [],
    audit: [],
    credentials: [],
    admins: [admin.id, foreign.id],
    roots: [root.id],
  };
  const store = {
    state,
    tail: Promise.resolve(),
    failAudit: false,
    async transaction(work) {
      const prev = this.tail;
      let unlock;
      this.tail = new Promise((r) => (unlock = r));
      await prev;
      const before = structuredClone(this.state),
        s = this.state;
      const find = (t, id) =>
          s.users.find((u) => u.tenantId === t && u.id === id),
        tx = {
          user: async (t, id) => structuredClone(find(t, id) ?? null),
          authority: async (p) => {
            const u = find(p.tenantId, p.id);
            return {
              superuser: s.roots.includes(p.id),
              clientAdmin: s.admins.includes(p.id),
              permissions: s.roles
                .filter(
                  (r) => r.tenantId === p.tenantId && u?.roleIds.includes(r.id),
                )
                .flatMap((r) => r.permissions),
            };
          },
          tenants: async (t) =>
            structuredClone(s.tenants.filter((x) => !t || x.id === t)),
          roles: async (t) =>
            structuredClone(s.roles.filter((x) => x.tenantId === t)),
          users: async (t, offset) =>
            structuredClone(
              s.users
                .filter((u) => u.tenantId === t)
                .slice(offset, offset + 51),
            ),
          create: async (u) => {
            if (
              s.users.some(
                (x) =>
                  x.tenantId === u.tenantId &&
                  (x.username.toUpperCase() === u.username.toUpperCase() ||
                    x.email.toUpperCase() === u.email.toUpperCase()),
              )
            )
              throw new AccountError(409, "ACCOUNT_ALREADY_EXISTS");
            s.users.push(structuredClone(u));
            if (u.kind === "CLIENT_ADMIN") s.admins.push(u.id);
          },
          save: async (u, expected, accessChanged) => {
            const old = find(u.tenantId, u.id);
            if (!old || old.version !== expected)
              throw new AccountError(409, "STALE_ACCOUNT");
            Object.assign(old, structuredClone(u));
            if (accessChanged) {
              s.admins = s.admins.filter((id) => id !== u.id);
              if (u.kind === "CLIENT_ADMIN") s.admins.push(u.id);
            }
          },
          setup: async (r) => s.setups.push(structuredClone(r)),
          findSetup: async (hash) =>
            structuredClone(s.setups.find((x) => x.hash === hash) ?? null),
          useSetup: async (hash, at) => {
            for (const r of s.setups)
              if (
                r.hash === hash ||
                hash === "account:" + r.tenantId + ":" + r.id
              )
                r.usedAt = at;
          },
          credential: async (u, hash) => {
            s.credentials = s.credentials.filter(
              (x) => !(x.tenantId === u.tenantId && x.id === u.id),
            );
            s.credentials.push({ tenantId: u.tenantId, id: u.id, hash });
          },
          audit: async (e) => {
            if (this.failAudit) throw Error("simulated audit failure");
            s.audit.push(structuredClone(e));
          },
          history: async (t, offset) =>
            s.audit.filter((e) => e.tenantId === t).slice(offset, offset + 51),
        };
      try {
        return await work(tx);
      } catch (e) {
        this.state = before;
        throw e;
      } finally {
        unlock();
      }
    },
  };
  let now = new Date("2026-11-16T12:00:00Z");
  const accounts = new AccountAdministration(
    store,
    new PasswordHasher(),
    () => now,
  );
  const principal = (u) => ({
    tenantId: u.tenantId,
    id: u.id,
    sessionVersion: store.state.users.find((x) => x.id === u.id)
      ?.sessionVersion,
  });
  const input = (extra = {}) => ({
    username: "new.user",
    email: "new.user@example.invalid",
    displayName: "New user",
    kind: "USER",
    personId: null,
    roleIds: [role],
    facilityIds: [facility],
    productKeys: ["athena"],
    reason: "Test assignment",
    ...extra,
  });
  return {
    store,
    accounts,
    root,
    admin,
    regular,
    foreign,
    tenantA,
    tenantB,
    role,
    highRole,
    foreignRole,
    adminRole,
    facility,
    principal,
    input,
    advance: () => {
      now = new Date(now.getTime() + 3600001);
    },
  };
}
