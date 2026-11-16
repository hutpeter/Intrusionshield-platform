# MVP checkpoint — November 16, 2026

Feature development is paused at the completed local account-management checkpoint.
The next proposed milestone is supervised remote Athena testing with fictional
data, beginning with a regular tester. No Azure deployment or email was sent as
part of this assessment.

## Local acceptance completed by the owner

- Platform owner bootstrap, private password setup and sign-in.
- Client/company registration and creation of regular users within that client.
- Dedicated account SQL runtime login with database-control and superuser-assignment
  permission checks returning 0, and account creation permission returning 1.
- Dedicated HIS SQL runtime login with database control/account creation returning
  0, and Person read/create permissions returning 1. Both service health checks
  passed, using intrusionshield and the existing 19 HIS tables.
- Regular editor private password setup/sign-in, empty Person list, creation of a
  fictional Person and editing that record.
- Regular user denied user-administration authority.
- Disabling the verification account invalidated its existing session without a
  browser refresh; re-enabling allowed a fresh sign-in and access to the record.
- Temporary client-admin verification: own-client user-management view, regular-user
  creation, and restricted account-type choices. The owner restored the verification
  identity to Regular user afterward, retaining Athena editor access.

Developer tests additionally cover direct cross-client request denial, viewer
write denial, editor creation under the authenticated client despite a forged body
client, current-role/session revocation, permission/audit rollback and unavailable
account verification. These are separate from the owner's manual acceptance.

The first external tester remains PENDING. Existing localhost setup links are
local-only and expire; generate a new invitation when the public site is ready.
The verifier account and fictional Person are local test records. Their creation
is not acceptance of patient registration, scheduling, admission or other clinical
workflows. Tiger/sterile-processing verification remains paused.

## Scope of the next milestone

Carry the accepted account hierarchy and basic Athena records to one public HTTPS
staging environment. Keep owner and client-user identities/tenant IDs stable.
Use one client with a regular editor tester to begin. A named permanent client
administrator can be appointed when the client supplies that person.

The initial roles remain client-wide: Athena viewer and Athena editor. Facility-
limited Athena access is currently refused, rather than silently widened. Product
subscription administration and fine-grained clinical roles are separate scope.

## Remaining work and indicative effort

These are planning estimates in **focused engineering hours**, not elapsed days,
not a measured extrapolation of the owner's part-time working pace. Owner input,
Azure access, DNS propagation, provider verification and review delays are outside
the ranges. Revised estimates follow Azure/database compatibility discovery.

| Work | Concrete result | Focused effort |
| --- | --- | --- |
| Production runtime and Azure staging | Reproducible builds/startup; public frontend and same-origin API routing; trusted HTTPS/proxy configuration; private service-to-service settings; persistent secrets/configuration and appropriate SQL network access | 6–10 hours |
| SQL compatibility and migration | Verify Azure SQL compatibility; choose required Identity/Authentication/EIS/Platform/HIS objects and data; copy to a new staging target; retain IDs/hashes; provision bounded runtime principals and verify connectivity/backups | 6–12 hours |
| Invitation/reset email workflow | Configure a verified sender/provider; generate public setup links with company sign-in context; send invitations and admin-triggered reset emails; surface send failures and allow a new invitation without recreating the user | 6–10 hours |
| Remote acceptance | Repeat owner/client-admin/regular-user checks on HTTPS, confirm isolation and session revocation, verify invitation/setup/sign-in and basic record creation/editing from another computer | 2–4 hours |
| **Planning total** | **First remote tester milestone** | **20–36 hours** |

The email scope above uses the existing administrator-mediated reset workflow.
A self-service forgotten-password page, bulk account import, elaborate role designer
and new product features are deferred. For this small first tester milestone,
visible send failure plus an administrator-triggered resend is sufficient; do not
silently mark a failed invitation as delivered.

## Proposed Azure baseline

- Azure App Service for the web/API workloads, with the account and HIS services
  retaining their separate database credentials and authorization boundary.
- Public HTTPS site with browser API calls routed under the same origin. Set
  account-service transport/proxy trust explicitly for the actual Azure deployment;
  the local HTTP helpers are not production launchers.
- Azure SQL Database as the first compatibility target. Investigate incompatibilities
  before committing to a more costly SQL hosting option. Do not copy all existing
  databases or unrelated application schemas by default.
- Azure Key Vault or appropriate protected App Service configuration for runtime
  credentials and the persistent token-signing secret. Keep credentials out of the
  frontend and source control.
- One email provider with a verified sender, such as Azure Communication Services
  Email if suitable for the selected Azure account and domain.
- A single initial staging instance, explicit health checks and useful error logs.
  Avoid promising distributed rate limiting from the existing per-process setup
  limiter; scaling requires a separate review.

This is a proposed architecture, not existing Azure infrastructure or a confirmed
provider selection. No subscription, resource group, region, hostname, sender or
budget has been selected in this session.

## Inputs needed when deployment work resumes

1. Azure subscription and resource-group choice, plus preferred hosting region.
2. Public hostname/domain ownership (an Azure-provided staging hostname can come first).
3. Invitation sender address and an email provider that can verify it.
4. Approved initial staging dataset and confirmation of the database compatibility
   findings before migration execution.

The next development sequence is Azure discovery/packaging, a staging database
copy and service deployment, then public invitations and remote acceptance. Keep
feature work paused outside that scope. Assess feedback from the first tester
before expanding product functionality.
