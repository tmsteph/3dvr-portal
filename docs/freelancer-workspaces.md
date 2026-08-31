# Freelancer workspaces

3DVR Work Agent needs more than connectors. Some employers, unions, staffing companies, and vendor portals only work through a logged-in browser. A freelancer workspace gives each worker a persistent cloud browser/desktop without forcing every worker to own a dedicated server.

## Product model

Each worker gets one logical workspace:

- native Gmail, Outlook, Calendar, Contacts, and payment connectors stay API-first
- one isolated browser/desktop container handles portals that have no useful API
- the browser profile lives on a persistent volume, so sessions survive container sleep and restart
- VNC/web-desktop access is a human fallback for login, MFA, CAPTCHA, and unusual portal flows
- the agent can operate the same workspace after the worker completes a login
- every external action still goes through Work Agent policies and the audit log

A logical workspace is **not** one cloud VM per freelancer. Multiple sleeping/on-demand workspace containers can share a properly sized host. Hosts can be added as capacity grows.

## Runtime implemented

`apps/agent/thomas-agent/node/freelancer-workspace-runtime.js` implements the first host runtime:

```text
status <workspace-id>
provision <workspace-id>
start <workspace-id>
stop <workspace-id>
session <workspace-id>
```

The default desktop image is LinuxServer Webtop with Debian/XFCE. The runtime:

- creates a dedicated Docker container per workspace
- persists `/config` under `/var/lib/3dvr/freelancer-workspaces/<workspace-id>/config`
- allocates a local port in the 32000-32999 range
- binds the desktop to `127.0.0.1` by default
- does not run privileged
- does not mount the host Docker socket
- disables Docker-in-Docker inside the desktop
- generates a per-workspace desktop password
- keeps metadata readable only by the host account where possible
- preserves the volume when a workspace is stopped

The CLI wrapper is:

```bash
apps/agent/thomas-agent/scripts/ask-freelancer-workspace \
  provision fw-example-worker --timezone America/Los_Angeles
```

`session` is intended for administrator/debug access while the secure desktop gateway is being built. Desktop credentials must never be copied into portal state, Gun records, prompts, or audit logs.

## Security boundary

The container desktop must not be exposed directly to the public Internet. Production access should terminate at a real HTTPS reverse proxy / identity gateway that maps an authenticated 3DVR session to exactly one workspace.

The gateway must:

1. authenticate the worker with their 3DVR account
2. resolve the workspace from the signed account identity, never from an arbitrary requested container name
3. issue a short-lived browser session
4. proxy only that worker's desktop
5. keep container ports private
6. revoke sessions when the worker signs out or the workspace is suspended
7. write access events to the Work Agent audit trail without logging cookies or passwords

## Credential model

Use three distinct credential classes:

1. **Native OAuth connectors** — refresh tokens encrypted server-side and never returned to normal portal JavaScript.
2. **Portal browser sessions** — cookies and local browser storage remain inside the worker's persistent browser profile.
3. **Human login secrets** — preferably filled from a dedicated vault at the human's request; never stored in prompts or normal product state.

The agent should prefer native connectors. Browser automation is a compatibility layer for portals that do not provide a suitable API.

## Provisioning phases

### Phase 1 — workspace runtime

Implemented now: deterministic workspace specification, host runtime, persistent browser profile, lifecycle controls, safe defaults, tests, and Freelancer Desk surface.

### Phase 2 — secure control plane

Add a signed 3DVR control request path from the Freelancer Desk to a workspace host. Reuse the existing tenant/risk/approval concepts. Provisioning must have quotas and an account/plan check so anonymous keys cannot allocate compute.

### Phase 3 — desktop gateway

Put the desktop behind a hardened HTTPS gateway with short-lived 3DVR sessions. Do not expose raw Webtop ports.

### Phase 4 — portal adapters

Add small adapters with a shared contract:

```text
connect()
health()
refreshSession()
readSchedule(start, end)
performApprovedAction(action)
disconnect()
```

Start with IATSE availability and Encore/UKG time-off because those complete the current scheduling loop.

### Phase 5 — host scheduler

Track activity and suspend idle desktops (target: 20 minutes) while preserving volumes. Place workspaces on hosts based on available RAM/CPU. Add capacity before a host is saturated rather than assigning one VM per user.

## Definition of the first complete customer loop

1. Freelancer signs into 3DVR.
2. Connects Gmail/Outlook and Calendar natively.
3. 3DVR assigns a workspace.
4. Freelancer opens the desktop and signs into one staffing/work portal.
5. Agent reads work/schedule data from that portal.
6. Work Agent merges it with email and calendar availability.
7. Agent drafts or performs an approved scheduling action.
8. Activity is visible in the audit trail.
9. Desktop sleeps; browser session persists.
10. The next run starts the same workspace and continues without another normal login.
