# Daily Direction and Life Upgrade privacy

## Current behavior

Daily Direction stores check-ins in the browser's local storage key `portal-life-checkins`.
Draft text uses `portal-life-draft`. The life page does not write check-ins to Gun and does
not subscribe to a shared life collection. It remains usable when Gun, a relay, or an account
is unavailable.

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
cleanup or migration plan. Browser code for Daily Direction must not attempt relay cleanup. The
audit should identify historical paths, retention, backups, replicas, and deletion guarantees
before a future privacy release is approved.
