#!/bin/sh
set -eu

scope="${VERCEL_SCOPE:-tmstephs-projects}"
portal_source="${PORTAL_STAGING_SOURCE:-3dvr-portal-git-staging-tmstephs-projects.vercel.app}"
portal_domain="${PORTAL_STAGING_DOMAIN:-portal-staging.3dvr.tech}"
web_source="${WEB_STAGING_SOURCE:-3dvr-web-git-staging-tmstephs-projects.vercel.app}"
web_domain="${WEB_STAGING_DOMAIN:-staging.3dvr.tech}"

echo "Aliasing ${portal_domain} -> ${portal_source}"
vercel alias set "$portal_source" "$portal_domain" --scope "$scope"

echo "Aliasing ${web_domain} -> ${web_source}"
vercel alias set "$web_source" "$web_domain" --scope "$scope"

echo "Staging domains are synced. Expect authenticated 401 responses while Vercel auth is enabled."
