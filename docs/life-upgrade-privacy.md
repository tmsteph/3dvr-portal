# Daily Direction and Life Upgrade privacy

## Current behavior

Daily Direction stores check-ins in the browser's local storage key `portal-life-checkins`.
Draft text uses `portal-life-draft`. The life page does not write check-ins to Gun and does
not subscribe to a shared life collection. It remains usable when Gun, a relay, or an account
is unavailable.

On first visit after this privacy change, a local migration sanitizes the old check-in cache
before anything is rendered. It retains only legacy records whose non-empty `author` exactly
matches the existing local `guestId` (or the legacy `userId` fallback), removes records whose
ownership cannot be proven, and records a versioned migration marker. Later visits continue to
reject records with a different non-empty author while preserving new device-local records that
do not need an author field. Drafts in `portal-life-draft` are not part of this migration.

This is device-only storage, not encrypted sync. A check-in saved in one browser or device is
not available on another device.

## Browser-storage limitations

Browser storage can be cleared by the user, browser settings, private browsing behavior, site
data cleanup, or a browser profile reset. Anyone with access to the unlocked device and browser
profile may be able to inspect it. The current page does not promise recovery, encryption, or
cross-device availability.

## Explicit sync requirement

Future sync requires an explicit product decision and an approved design for encryption,
owner-scoped authorization, key recovery, deletion, and relay behavior. A signed-in account or
an author field alone is not sufficient privacy.

## Shared-node prohibition

Never store plaintext moods, constraints, life notes, outcomes, evidence, or reviews in a shared
global Gun node. Do not treat an obscure node path, random identifier, or hidden author field as
an access control boundary. Until encrypted owner-scoped sync exists, guest life data stays on
the device.

## Separate relay audit

Any records synchronized by an earlier version require a separate relay audit and an intentional
cleanup or migration plan. The local cache sanitation above does not delete or modify historical
relay records. Browser code for Daily Direction must not attempt relay cleanup. The audit should
identify historical paths, retention, backups, replicas, and deletion guarantees before a future
privacy release is approved.
