# 3DVR OS

Daedalos / TommyOS browser-native desktop.

## Deployment

This directory is intended to be deployed as its own Vercel project while remaining inside the `3dvr-portal` monorepo.

Recommended project settings:

- Git repository: `tmsteph/3dvr-portal`
- Root Directory: `3dvr-os`
- Framework Preset: Other
- Build Command: none
- Output Directory: none (static files)
- Production branch: `main`
- Domain: `os.3dvr.tech`

Because this project root contains no `/api` directory or server functions, the OS deployment is independent from the main Portal deployment's serverless-function count.

The legacy monorepo route `/os/` redirects to `/3dvr-os/`.
