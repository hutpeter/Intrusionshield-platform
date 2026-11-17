# Athena Azure staging preparation

Owner choices, November 17, 2026:

- Region: **Canada Central**, Azure location `canadacentral`.
- Website: use the Azure-provided staging hostname first.
- Sender: **Ruby Notifications**, proposed address prefix **ruby-notifications**.
  The full sender address remains unset until a domain/provider can verify it.
- An Azure subscription has not yet been set up. Resource group, resource names,
  service tiers, target SQL database and spending limit are not selected.

`staging-plan.example.json` records these choices without credentials. Nulls are
intentional: this is not a deployable template, and its approval field is a record,
not an authorization mechanism. No Azure resources or costs are created by these
files. Do not insert passwords, signing secrets or connection strings into it.

## First owner-side Azure step

Use the Azure portal's Subscriptions page to create or identify the subscription:
<https://portal.azure.com/#view/Microsoft_Azure_Billing/SubscriptionsBlade>

Choose an account/subscription appropriate for the business and available offer.
Account ownership, billing acceptance and identity verification require the owner.
Once ready, provide its subscription name/ID; never send a password, access token,
client secret, certificate private key or billing-card details in chat.
A preferred monthly staging spending limit is also needed before selecting tiers.

The proposed resource group is `rg-ruby-athena-staging-ca`, subject to checking
availability/naming rules in the chosen subscription. A web-app name and actual
`azurewebsites.net` hostname must be selected after checking global availability.
Canada Central is an explicit target; do not silently substitute another region
if a chosen service/tier is unavailable there.

## Independent SQL preparation

Run the supplied local SQL Server metadata inventory from the repository root:

```powershell
sqlcmd -S tcp:localhost,1433 -E -N -I -d intrusionshield -b `
  -i 'deployment/azure/athena/READINESS.READ_ONLY.sql' -W
```

It reads SQL version/edition, compatibility level, collation, file allocation,
schema table counts, required table presence and selected SQL feature/dependency
metadata. It changes no application objects/data and outputs no account rows,
password hashes, module definitions or secrets. Empty missing-table output means
the named tables exist; it does not certify column/schema compatibility.

Nonzero feature counts need review. This report does not inspect every dynamic
SQL dependency, SQL Agent job, server configuration or Azure service restriction.
Complete database-project/SQLPackage compatibility validation and select the data
scope before choosing the migration method or creating the target database.
The inventory has been reviewed here but not executed against the owner's server.

The existing `intrusionshield` database also serves other platform purposes.
Identity/Authentication/EIS/Platform/HIS are candidate migration schemas; inspect
actual dependencies and approve the staging dataset before copying data. Do not
upload all existing databases or unrelated schemas by default. Preserve tenant and
identity IDs, salted credential hashes, role assignments and session versions for
accounts that are intentionally included. Exclude outstanding local setup tokens
from delivery; issue fresh public invitations after the site is ready.

Take a **fresh** backup/export before migration execution. The earlier verified
backup predates some accepted account/testing changes and is not automatically a
current migration source. Store backup/export files privately; credential hashes
and person data must not be pasted into chat or committed.

## Production packaging requirements

Prepare reproducible Node 24 builds for the portal, account API and HIS API using
the repository's pinned pnpm version. The Vite development server and local runtime
helpers are verification tools; they are not the Azure startup configuration.

The deployed browser must use a single HTTPS origin with explicit routes to the
account and HIS APIs. Keep HIS current-session authorization in place. SQL runtime
principals remain separate, without db_owner, and use encrypted certificate-verified
connections. Configure database firewall/private-network access for the actual
hosting topology. Validate SQL login/user provisioning for Azure SQL specifically;
the local CREATE LOGIN scripts must not be assumed compatible unchanged.

Choose the App Service topology/tiers after the subscription and budget are known.
Define process health, startup/failure handling, secret injection and persistence,
trusted HTTPS proxy handling, API route forwarding and logs before deployment.
The persistent signing secret must not change on every restart. Never place SQL
credentials or token-signing secrets in the frontend or source control.

Azure Key Vault/protected application settings and an initial single-instance
staging deployment remain proposed choices. Verify service availability and cost
in Canada Central before provisioning. No billable deployment was performed here.

Email delivery follows a working public URL and verified sender. Prefer the
existing administrator-triggered invitation/reset workflow with clear sent/failed
status and resend. The chosen sender address prefix does not establish domain
ownership or provider verification. Do not send invitations from a fabricated or
unverified address. Miguel remains pending until a valid remote invitation can be
issued and used from another computer.

See [the MVP checkpoint](../../../docs/MVP-CHECKPOINT-2026-11-16.md) and
[Athena access](../../../docs/ATHENA-ACCESS.md) for accepted functionality and
remaining remote acceptance work.
