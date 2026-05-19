# Guest Account Migration Plan

## Goal

When someone starts as a guest, creates work, and later signs in or creates a real account, the portal should keep their work attached to them. The upgrade should not only move score/name or Notes. It should migrate every app-owned guest record that can safely become user-owned data.

The target flow:

1. User continues as guest.
2. Apps write guest data under a stable `guestId`.
3. User signs in or creates a portal account.
4. A shared migration runner copies or merges guest-owned data into the signed-in identity.
5. The guest session is cleared only after migration attempts finish.
6. Apps load from the signed-in identity after the redirect.

## Current State

Guest identity is centered on local storage markers and Gun paths:

- `localStorage.guest`
- `localStorage.guestId`
- `localStorage.guestDisplayName`
- `gun.get('3dvr-guests').get(guestId)`

Signed-in identity is centered on Gun SEA user state plus local hints:

- `localStorage.signedIn`
- `localStorage.alias`
- `localStorage.username`
- `localStorage.userPubKey`
- `gun.user()`
- `gun.get('3dvr-portal').get('userIndex').get(alias)`

The first guest upgrade pass migrates:

- Guest display name.
- Guest score.
- Guest Notes folders/pages.
- Guest Contacts and Pocket Workstation records when the guest creates a brand-new SEA account.

That is useful, but it is not a general account migration layer.

## New Account Fast Path

Alias-keyed copy is reasonable when the guest is creating a brand-new account because there should be no
existing user data to reconcile. The sign-in page now distinguishes account creation from existing-account
login and runs a narrow fast path only for new accounts.

Current new-account fast path:

- Copies guest contacts from `3dvr-guests/<guestId>/contacts` into `gun.user().get('contacts')`.
- Copies legacy guest contacts from `3dvr-guests/<guestId>/contacts/contacts` into the same user contacts root.
- Copies Pocket Workstation guest records from
  `3dvr-portal/pocketWorkstation/users/<guestId>/{notes,commands,projects}` into
  `3dvr-portal/pocketWorkstation/users/alias-<alias>/{notes,commands,projects}`.
- Records a migration marker under `3dvr-portal/guestAccountMigrations/<alias>/<guestId>`.
- Records a guest identity link under `3dvr-portal/guestIdentityLinks/<guestId>`.

This path does not run for existing-account sign-ins. Existing accounts still need namespace-specific merge
rules so guest data does not overwrite real account data.

## Desired Architecture

Create a shared guest migration module, for example:

- `guest-migration.js`
- tests under `tests/guest-migration.test.js`

The module should expose a small registry:

```js
window.PortalGuestMigration = {
  register(namespace, handler),
  run({ gun, user, portalRoot, guestId, alias, userPubKey })
}
```

Each app or shared data domain registers one handler. The sign-in page should call the runner once during `finishLogin()` before clearing the guest session.

The runner should:

- Read the `guestId` once at the start.
- Resolve the signed-in user target once.
- Run registered handlers in sequence or with controlled concurrency.
- Record basic migration status under the user account.
- Continue past non-critical app failures so one broken app does not block sign-in.
- Clear guest local storage after migration attempts finish.

## Canonical Paths

Use explicit source and target paths. Avoid guessing based only on alias strings.

Recommended guest source:

```text
3dvr-guests/<guestId>/<namespace>
```

Recommended SEA user target when `gun.user()` is authenticated:

```text
~<user pub>/<namespace>
```

Recommended fallback target when a user is signed in by OAuth or a SEA session is not available:

```text
3dvr-portal/<namespace>Users/<userPubKey-or-alias>/<namespace>
```

Use `alias` as a fallback key only when `userPubKey` is missing. Email-style aliases can change or collide with recovery/contact emails, so `userPubKey` is the better stable account key when present.

## Merge Rules

Not every app should blindly overwrite user data. Each namespace needs a merge policy.

Default merge rules:

- New guest record not present in user account: copy it.
- Same record id present in both places: keep the newest `updatedAt`.
- Score/points totals: keep the max unless the app has a ledger.
- Lists: merge by stable id and dedupe obvious duplicates.
- Settings/preferences: prefer existing signed-in settings unless the guest setting is newer and non-empty.
- Profile fields: prefer signed-in profile fields, but fill blanks from guest profile.
- Billing/customer data: never migrate from guest automatically. Billing must stay tied to verified account identity.
- OAuth/recovery/security data: never migrate from guest.

Every migrated record should keep enough metadata to debug:

```js
{
  migratedFromGuestId,
  migratedAt,
  migrationNamespace
}
```

## Data Inventory

Known or likely namespaces that need migration handlers:

| Area | Guest source | User target | Merge policy |
| --- | --- | --- | --- |
| Score / points | `3dvr-guests/<guestId>` | `gun.user()` score fields | Max score/points, preserve existing higher totals |
| Profile display | `3dvr-guests/<guestId>` | `gun.user()` and `userIndex/<alias>` | Fill blanks only |
| Notes | `3dvr-guests/<guestId>/notes`, `noteFolders` | `gun.user()/notes`, `noteFolders` | Copy folders/pages by id, newest wins |
| Contacts | `3dvr-guests/<guestId>/contacts` | personal contacts node | Merge by id, dedupe likely same email/phone |
| CRM | `3dvr-guests/<guestId>/crm` or app-specific guest nodes | signed-in CRM workspace | Merge by id, do not overwrite newer signed-in records |
| Chat | guest profile/message attribution | signed-in identity metadata | Preserve messages, optionally link old guest id to alias |
| Meditation / games | `3dvr-guests/<guestId>` app fields | user score/progress fields | Max or newest per stat |
| Tasks/projects | app-specific guest nodes if present | user task/project nodes | Merge by id, newest wins |
| Pocket Workstation | guest/user workstation roots if present | user workstation root | Merge records by id |

This table needs a code audit before implementation. Some apps may still write to shared top-level paths and should be scoped first before migration can be correct.

## Implementation Phases

### Phase 1: Inventory and Shared Helper

- Audit all apps for Gun write paths.
- Document each namespace, source path, target path, and merge policy.
- Add `guest-migration.js`.
- Move current score/name/Notes/new-account fast-path migration out of `sign-in.html` into the shared helper.
- Add unit tests with stub Gun nodes.

### Phase 2: App Storage Scoping

- Fix apps that still write personal data to shared top-level roots.
- Make every app choose one of:
  - guest workspace
  - signed-in personal workspace
  - intentionally shared org/public workspace
- Keep old shared roots as read-only legacy sources where needed.

### Phase 3: Migration Handlers

Add migration handlers for:

- score/profile
- notes
- contacts
- CRM
- tasks/projects
- game and meditation progress
- pocket workstation records

Each handler should be independently testable and safe to re-run.

### Phase 4: Status and Recovery

- Store migration status under the signed-in user:

```text
3dvr-portal/guestMigrations/<alias-or-userPubKey>/<guestId>
```

- Record namespace status:
  - `pending`
  - `copied`
  - `merged`
  - `skipped`
  - `failed`

- Add a small admin/debug view later if needed.
- Do not delete guest Gun nodes immediately. Clear local guest session, but leave source data available for recovery until a retention policy exists.

## User Experience

Guest upgrade copy should stay simple:

- Primary action: `Create account`
- Upgrade page: `Save your guest progress`
- After login: redirect back to the page the user came from.

Avoid exposing detailed migration mechanics to customers. If a migration partially fails, keep sign-in successful and show a low-friction recovery option later rather than blocking account creation.

## Testing

Minimum automated coverage:

- Guest with no data signs in successfully.
- Guest with score/profile migrates to a new account.
- Guest with records in multiple namespaces migrates all supported namespaces.
- Existing signed-in records are not overwritten by older guest records.
- Re-running migration is idempotent.
- One namespace failure does not prevent other namespaces from migrating.
- Guest local storage is cleared only after the runner finishes.
- Billing/security/OAuth data is not migrated from guest.

Manual walkthrough:

1. Clear browser storage.
2. Continue as guest.
3. Create data in at least three apps.
4. Use the floating `Create account` action.
5. Create or sign into an account.
6. Confirm the same data appears under the signed-in account.
7. Sign out and sign back in from another page.
8. Confirm the signed-in account still owns the migrated data.

## Open Questions

- Should migrating into an existing account require an explicit confirmation when that account already has data?
- Should guest records be linked to the user account forever for audit/debug, or only during a retention window?
- Should we support merging a guest session into a different existing account after login, or only during the first upgrade flow?
- Do we need a customer-visible “recover guest session” page for failed migrations?
- Which app data is intentionally shared/community data and should not move into personal account storage?

## Near-Term Recommendation

Do not keep adding one-off migrations in `sign-in.html`. The next implementation pass should create the shared migration runner, move the current score/name/Notes logic into it, and add one more app handler as the pattern. After that, additional apps become straightforward registry entries instead of bespoke sign-in code.
