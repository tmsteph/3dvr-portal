# Freelancer workspaces

3DVR Work Agent needs more than connectors. Some employers, unions, staffing companies, and vendor portals only work through a logged-in browser. A freelancer workspace gives each worker a persistent cloud browser without forcing every worker to own a dedicated server.

## Product model

Each worker gets one logical workspace:

- native Gmail, Outlook, Calendar, Contacts, and payment connectors stay API-first
- one isolated browser container handles portals that have no useful API
- the browser profile lives on a persistent volume, so sessions survive container sleep and restart
- streamed browser access is the human fallback for login, MFA, CAPTCHA, and unusual portal flows
- Pelorus exposes the same browser to the agent through structured accessibility-tree state with computer-use/vision fallback
- every external action still goes through Work Agent policies and the audit log

A logical workspace is **not** one cloud VM per freelancer. Multiple sleeping/on-demand workspace containers can share a properly sized host. Hosts can be added as capacity grows.

## Runtime implemented

`apps/agent/thomas-agent/node/freelancer-workspace-runtime.js` implements the host runtime:

```text
status <workspace-id>
provision <workspace-id>
start <workspace-id>
stop <workspace-id>
session <workspace-id>
```

The default profile is now browser-first: LinuxServer Firefox/Selkies with Pelorus enabled. The runtime:

- creates a dedicated Docker container per workspace
- persists `/config` under `/var/lib/3dvr/freelancer-workspaces/<workspace-id>/config`
- allocates a local port in the 32000-32999 range
- binds the streamed browser to `127.0.0.1` by default
- enables `PELORUS=true` and Wayland for structured agent control
- caps the virtual display at 1920x1080 to reduce unnecessary resource use
- defaults to 1 CPU / 1024 MB memory with a 768 MB host-memory reserve
- refuses provision/start when the host would violate the memory reserve
- does not run privileged
- does not mount the host Docker socket into the worker container
- disables Docker-in-Docker inside the worker container
- generates a per-workspace browser password
- keeps metadata readable only by the host account where possible
- preserves the volume when a workspace is stopped

The CLI wrapper is:

```bash
apps/agent/thomas-agent/scripts/ask-freelancer-workspace \
  provision fw-example-worker --timezone America/Los_Angeles
```

`session` is intended for administrator/debug access while the secure browser gateway is being built. Session credentials must never be copied into portal state, Gun records, prompts, or audit logs.

## Agent-control layer

Pelorus is enabled inside the worker container but its raw API is not published separately. The Work Agent should use the secured workspace session path and call the lowest useful layer:

1. accessibility tree / structured desktop state first
2. direct mouse/keyboard computer-use primitives when needed
3. screenshot/vision only when the application does not expose useful accessibility information

Do **not** put the Work Agent's model/provider API key inside the worker browser profile. Keep model credentials in the trusted agent/control plane and treat the workspace as an execution target.

## Secure gateway direction

LinuxServer's SealSkin is a useful reference implementation for the layer we need: authenticated multi-user session orchestration, per-session proxying, persistent user homes, and private container ports. We can either integrate/fork the useful pieces or implement a small 3DVR-native gateway with the same security properties.

The worker container itself must not be exposed directly to the public Internet. Production access should terminate at a real HTTPS identity gateway that maps an authenticated 3DVR session to exactly one workspace.

The gateway must:

1. authenticate the worker with their 3DVR account
2. resolve the workspace from the signed account identity, never from an arbitrary requested container name
3. issue a short-lived browser session
4. proxy only that worker's browser
5. keep container and Pelorus ports private
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

Implemented: deterministic workspace specification, browser-agent host runtime, persistent profile, lifecycle controls, resource guardrails, signed control protocol, tests, and Freelancer Desk surface.

### Phase 2 — secure control plane

Finish the signed 3DVR request path from Freelancer Desk to a workspace host. Reuse existing tenant/risk/approval concepts. Provisioning must have quotas and an account/plan check so arbitrary signed keys cannot allocate compute.

### Phase 3 — browser gateway

Put the browser behind a hardened HTTPS gateway with short-lived 3DVR sessions. Use SealSkin's architecture as a reference rather than exposing raw Selkies ports.

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

The browser/Pelorus layer supplies generic computer use; adapters supply portal-specific semantics and safety checks.

### Phase 5 — host scheduler

Track activity and suspend idle browsers (target: 20 minutes) while preserving volumes. Place workspaces on hosts based on available RAM/CPU. Add capacity before a host is saturated rather than assigning one VM per user.

## Host requirements

The current runtime intentionally fails closed if there is not enough free memory. A production host should have enough headroom for the host OS/control plane plus the maximum number of simultaneously active browser sessions. Sleeping workspaces keep storage but consume essentially no session RAM.

The supported runtime target is Docker because the upstream Selkies stack officially supports Docker; alternative OCI runtimes can be evaluated later. A workspace host should be treated as a dedicated execution tier, not an arbitrary shared application server.

## Definition of the first complete customer loop

1. Freelancer signs into 3DVR.
2. Connects Gmail/Outlook and Calendar natively.
3. 3DVR assigns a workspace.
4. Freelancer opens the streamed browser and signs into one staffing/work portal.
5. Agent reads the portal through Pelorus/accessibility state and a portal adapter.
6. Work Agent merges it with email and calendar availability.
7. Agent drafts or performs an approved scheduling action.
8. Activity is visible in the audit trail.
9. Browser sleeps; its profile and portal session persist.
10. The next run starts the same workspace and continues without another normal login.

## Upstream references

- LinuxServer Selkies/Webtop: https://docs.linuxserver.io/selkies/
- Pelorus: https://docs.linuxserver.io/selkies/components/pelorus/
- SealSkin: https://docs.linuxserver.io/selkies/components/sealskin/
