# chat.3dvr.tech

`chat.3dvr.tech` is a small Vercel edge proxy in the `3dvr` team.

It keeps the clean chat subdomain in the browser while serving the existing, working Portal group chat from `portal.3dvr.tech/chat/`. Other paths are proxied to the Portal root so shared styles, scripts, manifests, profiles, and API routes continue to work normally.

Vercel project: `3dvr/3dvr-chat`

To redeploy from this directory:

```sh
vercel link --project 3dvr-chat --scope 3dvr --yes
vercel deploy --prod --scope 3dvr --yes
```
