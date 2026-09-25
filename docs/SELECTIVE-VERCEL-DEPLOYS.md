# Selective Vercel use

3DVR is self-host-first. Vercel is not the normal Portal release lane.

## Intended steady state

- The Portal UI is served by the self-hosted OVH-first production lane.
- The canonical personal-team Vercel project is retained for the small set of serverless API routes that still need it and as an emergency static fallback.
- Native Vercel Git deployments are disabled for every branch.
- The Vercel production fallback workflow is explicit/manual only.
- Routine pull requests and merges do not create Vercel Portal deployments.
- New server functionality should prefer the self-hosted runtime unless there is a specific reason to remain serverless.

## Current migration state

As of 2026-09-25, `portal.3dvr.tech` is still attached to the personal-team Vercel project, so the public root is temporarily Vercel-served until DNS/routing is moved to the self-hosted edge.

The personal-team project has real serverless API traffic. The similarly named `3dvr`-team Portal project has no observed runtime traffic and is not a production dependency.

This split is temporary. The target is:

```text
portal.3dvr.tech  -> self-hosted 3DVR edge / OVH-first Portal
API calls that still require Vercel -> canonical personal-team Vercel API/fallback project
```

Do not treat a successful Vercel deployment as the normal Portal release path.
