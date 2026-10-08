# CS Build Lab
Route: /cs-build-lab/. Linked from the existing Education Suite navigation.

Original eight-module 3DVR curriculum: algorithms, data structures, databases,
networking, operating systems, reliability, languages, and a shipped improvement.
The default cadence is three 30-minute sessions per week; modules are not deadlines.
The interactive search demo counts comparisons for the final element of a sorted
list, not wall-clock speed.

Signed-in progress and notes sync through GunJS:
user.get('education').get('cs-build-lab-v2').get('devices').get(writerId).
Each tab uses its own encrypted snapshot. Snapshots merge registers per module
and field by logical timestamp and writer ID, preserving changes to different
checkpoints and modules. Explicit unchecks and empty notes sync too; concurrent
edits to the same note use the newest register. A write acknowledgement is not
proof of delivery to another browser.

SEA encrypts snapshots to the authenticated account key. Session recall and
stored-credential recovery verify the expected public key/alias before writes.
Account cache keys include the authenticated public key. Account changes detach
listeners and hide the prior account view. The old guest cache migrates once to
its first account and remains as a backup; it never migrates to another account.
Signed-out progress stays device-local. Failed writes keep the account cache and
retry. JSON import/export remains a backup and transfer option. No automatic
redirect on recovery failure: retry and a sign-in link return to this exact route.

Finish a module to display review dates at 1, 7, and 30 days. Dates are guidance,
not scheduled notifications. Completion is self-reported, not AI certification.

Practice uses synthetic data and approved development environments. Client work
needs separate scope authorization. External courses are linked, not reproduced.

Validation: load at mobile and desktop widths, complete/uncheck a step, reload,
enter notes, export/import, reject invalid JSON, and exercise search sizes 1/100/1000.
Verify deployed HTML, JS, CSS, and curriculum against the exact GitHub release.
