# 3DVR Helm

A phone-first OpenClaw workspace inside the Portal monorepo. Operator remains the
main conversational entry point; Helm is its dedicated OpenClaw app, linked from
Operator and the home app launcher. It does not create a second gateway or worker.

## Connection

Browser → signed owner POST `/api/openclaw` → OVH SSH mesh → Hetzner loopback
`/v1/chat/completions` → existing `cloud` profile. The gateway token is read only
on Hetzner and never sent to the browser or copied to OVH. Chat is authorized with
the verified public key bound to `tmsteph@3dvr` in Portal identity policy.
Other Portal users, including additional owners/admins/developers, are denied.
A matching display name alone grants no access. The static app shell is public;
agent status and chat both require this account’s signed requests.

The gateway endpoint must be enabled at
`gateway.http.endpoints.chatCompletions.enabled=true`; preserve loopback binding
and token authentication. Upstream contract:
https://docs.openclaw.ai/gateway/openai-http-api

## Deployment setup

- Deploy the normal self-hosted Portal release; no separate Sites/Vercel project.
- Verify the Portal service account can SSH to `3dvr-hetzner` with BatchMode.
- Root service execution drops to the existing `debian` SSH mesh identity via
  `runuser`. Non-root execution retains its own identity. Optional
  `THREEDVR_OPENCLAW_SSH_USER` selects another existing unprivileged mesh user.
- Optional `THREEDVR_OPENCLAW_SSH_HOST` selects an existing mesh alias.
- Set `THREEDVR_HELM_STATE_DIR` to a private directory outside immutable releases,
  owned by the Portal service account; default `/var/lib/3dvr-helm` works when the
  service account can create it. Preserve it across upgrades and rollback.
- `THREEDVR_HELM_ALLOWED_ORIGINS` defaults to `https://portal.3dvr.tech`.
- Python 3 is required on Hetzner; the Portal uses its existing Node runtime.

Chat requests use persistent exclusive receipts to avoid replay after timeouts or
server restarts. A pending receipt means uncertain delivery and must not be
silently cleared. Chats are serialized per Portal process and through a Hetzner
file lock. Status checks never launch model inference. Receipts contain private
agent replies and need the same retention and backup care as conversation data.

## Prototype boundaries

The visible transcript is held in the current tab only; OpenClaw stores its own
session under a stable owner/conversation key. New chat selects a new key without
deleting prior sessions. Reload currently starts a new visible chat. Operator's
existing conversation sync is unchanged. Live token streaming, job receipts,
file browsing, cross-device transcript restore and stop/cancel are follow-up work.
No automatic retries or queue draining occur. Opening Helm does not start work.

## Verification

`node --test tests/openclaw-helm.test.js tests/operator-public-modules.test.js tests/self-host-sea-runtime.test.js tests/home-apps-dialog.test.js`

Manual acceptance: signed-out Connect must offer sign-in; owner Connect must
show live gateway and chat configuration, then send a harmless greeting and
require an actual returned agent reply. Test New chat, navigation back to
Operator, mobile layout, duplicate request handling and interrupted delivery.

## Recovery observations: 2026-10-22

Gateway HTTP 200 and Telegram channel probe passed on Hetzner. Service task usage
reached its 160-task ceiling; later observed at 147. Root disk was 90% full.
Loopback chat endpoint enabled with a server-local configuration backup;
unauthenticated POST returned 401. No credentials, sessions, or queued tasks were
deleted. An authenticated chat smoke test was submitted through Open Runner, but
its capacity gate initially deferred it at 1,248 MiB available versus 1,280 MiB
required. It later ran, but the authenticated model turn timed out after 85 seconds.
The OVH → Hetzner return SSH path passed; the current Portal service uses root.
A working HTTP shell/channel probe is not proof of a completed model turn.

Publication was blocked by automatic approval review, so this is local source,
not a deployed or end-to-end verified release. Browser QA was blocked because the
managed preview requires port 4173 while the existing dev script binds port 3000.

## Mobile connection repair — 2026-10-22

The interactive SSH test originally ran as `debian`, while the Portal systemd
service runs as root with no HOME. Root could not resolve `3dvr-hetzner`; running
SSH as the existing `debian` mesh user succeeded. Helm now uses that same identity
without copying keys. Status responses separately confirm verified account
identity even when the agent transport fails. Mobile connection controls move
above the composer, metadata collapses, the hero shrinks, and the sticky header
shows the current Portal username using the homepage identity source.
