# Calendar deployment

`calendar/` is deployed as the standalone Vercel project `3dvr-portal-calendar`.

Production URL: `https://calendar.3dvr.tech/`

The root `calendar/vercel.json` proxies `/api/*` requests to `https://portal.3dvr.tech/api/*`, so the standalone app can reuse the Portal calendar/OAuth backend.

Production deploys are handled by `.github/workflows/calendar-production.yml`. The workflow runs only when `calendar/**` changes (or manually), reattaches the custom domain if needed, and verifies that the live root renders the Calendar app rather than the Portal homepage.
