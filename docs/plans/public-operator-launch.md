# Public Operator on 3dvr.tech

Status: implementation in progress. Owner: 3DVR.

## Goal
Make Operator the primary entry point at https://3dvr.tech while preserving the existing business website and https://portal.3dvr.tech.

## User journey
1. Open 3dvr.tech on mobile or desktop.
2. See an immediately usable Operator conversation with a clear guest mode.
3. Ask for help; public guest requests use restricted capabilities and rate limits.
4. Sign in to preserve the conversation and continue in the portal.
5. Navigate back to projects, pages, pricing, and company information without losing the chat.

## Architecture
- Reuse the current Portal Operator API, model router, and conversation UI rather than duplicating an AI stack.
- Public site presents an Operator-first hero; portal remains authenticated workspace.
- Same-origin or explicit CORS, CSRF and origin validation for public API calls.
- Guest sessions are ephemeral, with per-IP/session limits, spend caps, and no server, filesystem, messaging, billing, or privileged tools.
- Authenticated session migration must be explicit and preserve chat history.
- Deploy to existing OVH self-hosted infrastructure; no Vercel dependency.

## Phases
### 1. Audit and wire
Identify public homepage source, existing Operator UI, chat endpoints, auth/session model, deploy pipeline, and feature flags. Document the route mapping.

### 2. Public MVP
Embed/reuse Operator on homepage behind a feature flag. Preserve existing content, pricing, trust signals and links. Add responsive loading/error states and a guest-access gate.

### 3. Session continuity
Enable guest-to-account migration, persistent history, conversation branching, and back navigation.

### 4. Pages and ecosystem
Expose pages, QR sharing, open-source project discovery, and opt-in integrations inside Operator.

## Acceptance tests
- Homepage loads and business links remain functional on mobile and desktop.
- Guest can send a prompt and receive a real streamed response.
- Guest cannot invoke privileged tools or exceed usage limits.
- Sign-in retains conversation without leaking between accounts.
- Existing portal Operator still works.
- E2E smoke checks pass in staging, deployment and rollback are verified.

## Release gates
No production cutover until code review, security checks, API budget limits, browser tests and self-hosted deploy checks pass. Roll back by disabling the public Operator feature flag.

## Next engineering work
Inspect existing homepage/Operator implementation and create the smallest shared component and guarded public route. Avoid iframe hacks or an independent second backend.
