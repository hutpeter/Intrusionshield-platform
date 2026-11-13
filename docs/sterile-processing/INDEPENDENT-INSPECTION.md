# Independent inspection — MVP functionality

November 13, 2026 · `feature/sterile-processing-preview`

The resumed MVP now enforces a dedicated inspection permission and separation
from the people who performed cleaning. This supersedes the earlier one-person
dummy demonstration. RSP-ISS-001's functional rule is implemented; owner and
operational/clinical acceptance are still pending.

## Authorization and person separation

- API inspection writes require `processing:inspect`. `processing:write` grants
  cleaning/receipt actions and does not grant inspection. Inspector-only accounts
  can read/inspect without cleaning rights; the server enforces each permission.
- Canonical person identity is trusted server context. Real-account authentication
  requires the access enrollment's `personId`, in addition to current ACTIVE/USER
  identity and facility grants. Browser/token role/person claims and custom
  headers cannot select it. Cleaning/inspection API actions without trusted person
  context fail closed.
- Cleaning stores `startedByPersonId` and `finishedByPersonId` alongside existing
  account actors; inspection stores its `personId` and account actor. The domain
  checks the current version and all attempts inside the transaction that saves
  inspection and releases holds.
- Anyone who started **or** finished **any** cleaning attempt in the episode is
  disqualified, including failed attempts and retries. A person who inspected a
  failed result and then performed renewed cleaning cannot inspect again. Both
  cleaning and inspection permissions do not override that restriction. The rule
  applies to the whole receiving episode/group, not individual item exceptions.
- Rejected inspection attempts leave versions, results, holds, audit and command
  receipts unchanged. Concurrent/stale submissions and idempotent retries retain
  the existing transaction guarantees.

## Establishing canonical person identity

Authorized administration must establish a stable UUID for each actual person
from the approved identity source. Accounts/aliases belonging to that person must
share it. The software does not infer people from usernames, emails or names.
The local assignment is an administrative assertion backed by that process; it
does not independently verify a human's identity.

The trusted offline access-change file now requires `personId`. The
[access example](examples/account-access.example.json) includes it. For an existing
enrollment lacking it, submit an audited update using the current expected version
and correct approved mapping. That update does not backfill old workflow facts.

Once assigned, an account's person mapping cannot be changed or removed through
`replaceAccess` or the offline tool, even by disabling the enrollment first.
Permission/status changes retain the same mapping. This prevents ordinary access
updates from turning a cleaner into an apparently different person. Incorrect
assignments need an explicitly designed identity-correction policy; there is no
silent remapping/unblock route. Keep historical access versions and attribution.

For an inspector, assign the separate `processing:inspect` permission plus the
read permissions needed for the person's work, including `processing:read`,
`instruments:read` for the current workspace catalogue, and `procedures:read` for
procedure selection. Add `dashboard:read` if that workspace is used. Do not grant
cleaning rights merely to make the inspection form available.

## Historical records and the dummy preview

Existing records remain readable. An old cleaning attempt without complete valid
person snapshots cannot receive a new inspection approval. The API reports
`INSPECTION_IDENTITY_REQUIRED`; holds remain. It does not infer historical people
from today's directory, overwrite old versions, reset a database, mark items clean
or supply an override. Already completed historical facts remain recorded as they
were; this increment does not retroactively certify or re-evaluate them. Legacy
resolution and operational acceptance require a separate approved policy.

In the dummy preview, operator/reviewer fixture IDs represent distinct fictional
people. The operator can clean; the reviewer has inspection permission separately
from release decisions and cannot clean. Automatically prepared fictional packages
now attribute their simulated inspection to that separate reviewer. Preview-only
batches can record those two fixed simulated actors atomically; normal transactions
remain bound to one actor, and account-mode persistence rejects a multi-actor
fixture transaction. No preview helper is mounted in account mode.

The processing screen shows the independent-person requirement. Inspectors who
participated in cleaning see the specific block and a disabled action. Other
authorized inspectors can open/save inspection with `canInspect` even when
`canWrite` is false. English, Spanish and French guidance/error messages are included.

## Verification and one owner check

Developer: 233 domain tests, 178 service tests, 92 web tests and six account-runtime
tests passed; core/service/web builds passed. Coverage includes aliases, both
permissions held by a cleaner, both cleaning participants, retries/reinspection,
historical gaps, person enrollment/remapping refusal, API spoof denial, inspector-only
access, SQLite restart/history, audit rollback and races. Updated existing workflow
fixtures now use an independent inspector rather than bypassing the new rule.
Chromium verified operator exclusion, a separate reviewer opening/saving the form,
different persisted person IDs and mobile layout. No live identity database or
owner records were used. Existing large-chunk build guidance remains a performance
backlog item.

**U-INDEPENDENT-01 passed November 13, 2026 — only owner check for this build:**

1. Stop the preview with Ctrl+C, then update/start:

   ```powershell
   git pull --ff-only origin feature/sterile-processing-preview
   pnpm sterile:preview
   ```

2. After Ready, refresh. As **Demo operator**, open **Receiving and cleaning** →
   **Prepare fictional inspection example**.
3. Expect the independent-person guidance and no **Record inspection** action
   for this operator. This creates fictional prerequisite records only.

The full independent-reviewer handoff is developer-verified and not an additional
owner request now. Actual person mapping/competency verification, live identity
acceptance, broader M-AUTH-01 and clinical sign-off remain pending. The client MVP
is still in development; no additional reporting features are introduced.

Owner screenshot confirms the fresh fictional receipt at version 3, Awaiting
inspection — held, independent-person guidance and no operator inspection action.
It does not establish owner acceptance of reviewer completion or alias controls.
