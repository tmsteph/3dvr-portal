# Hosted Operator pilot deployment checklist

This pilot is OFF by default. Do not enable it for public users until signed SEA
end-to-end verification, storage permissions, and worker lifecycle are tested.

Verified on OVH: the production release symlink is
`/opt/3dvr-portal-production/current`, and the self-host server uses
`scripts/self-host-server.mjs`. The pilot API is now explicitly routed in
that server. The worker account and private state directory were not present
at inspection time.

Required operator-controlled setup (not executed by this PR):

1. Create a dedicated unprivileged `3dvr-hosted-pilot` system account.
2. Create `/var/lib/3dvr-hosted-pilot` with ownership by that account and
   mode 0700. The Portal API service must have access to the same task store
   without broadening access to other tenant data. Prefer a dedicated narrow
   broker over making the state world-readable.
3. Configure `/etc/3dvr/hosted-operator-pilot.env` with
   `HOSTED_OPERATOR_PILOT_STORE=/var/lib/3dvr-hosted-pilot/tasks.json`
   and `HOSTED_OPERATOR_PILOT_ORIGIN=https://portal.3dvr.tech`.
   Keep `HOSTED_OPERATOR_PILOT_ENABLED` unset until ready.
4. Validate the real SEA proof, cross-tenant denial, read-only GitHub fetch,
   task completion, and mobile status display against an isolated deployment.
5. Install the systemd service and timer only after their filesystem and
   identity permissions are reviewed. Confirm the timer does not run
   concurrently and that a failed task is bounded by retry limits.
6. Explicitly enable the pilot for a restricted cohort only after verification.

The pilot does not support arbitrary shell commands, repository writes,
private repositories, or per-user virtual machines.
