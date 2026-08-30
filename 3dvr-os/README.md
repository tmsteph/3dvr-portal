# 3DVR OS

**Core product:** 3DVR OS is the maintained open personal-computing path for the 3DVR ecosystem.

It grows out of the Daedalos / TommyOS browser-native desktop experiments, but the naming boundary is now explicit:

- **3DVR OS** — Core product and supported public path.
- **TommyOS / Daedalos experiments** — Labs lineage for research, prototypes, and ideas that may graduate into 3DVR OS.

New user-facing operating-system work should land in 3DVR OS unless it is intentionally experimental. Proven Labs work can be absorbed here without requiring users to understand the internal experiment history.

## Deployment

This directory is deployed as its own Vercel project while remaining inside the `3dvr-portal` monorepo.

Production settings:

- Vercel Team: `3dvr`
- Vercel Project: `3dvr-os`
- Git repository: `tmsteph/3dvr-portal`
- Root Directory: `3dvr-os`
- Framework Preset: Other
- Build Command: none
- Output Directory: none (static files)
- Production branch: `main`
- Public domain: `https://os.3dvr.tech/`

Because this project root contains no `/api` directory or server functions, the OS deployment is independent from the main Portal deployment's serverless-function count.

Generated Vercel deployment URLs may be protected by Vercel Authentication. Deployment health checks should use authenticated `vercel curl` for the generated deployment URL and verify the public custom domain separately.

The legacy monorepo route `/os/` redirects to `/3dvr-os/`.
