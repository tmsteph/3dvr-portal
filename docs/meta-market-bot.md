# Meta Market Bot

Goal: use the Meta Graph API to publish controlled Facebook Page posts and measure the reaction so 3dvr.tech can find markets with real demand.

This is not a scraping bot, spam bot, or auto-reply system. It is a market experiment loop:

1. Pick one market angle from Market Pulse.
2. Draft one Facebook Page post.
3. Require human approval.
4. Publish through the Meta Graph API.
5. Store the returned post id.
6. Re-check reactions, comments, shares, clicks, impressions, and engaged users.
7. Score the result and feed it back into Market Pulse.

## Current Implementation

The first implementation lives in:

- `src/growth/meta-graph.js`: request builders, measurement helpers, and scoring.
- `src/growth/market-pulse.js`: Facebook Page probes now include a `metaGraph` experiment plan.
- `sales/market-pulse.html`: dashboard copy now shows the Meta Graph API path.

The helper code intentionally creates API-shaped request objects instead of immediately calling Meta from the browser. Real publishing should run from the DigitalOcean server so access tokens never live in browser JavaScript and the system can move away from Vercel-only infrastructure.

## Preferred Runtime

Use DigitalOcean as the trusted worker:

1. Portal writes approved jobs to Gun.
2. The DO worker runs on a timer.
3. The worker reads approved jobs from Gun.
4. The worker uses server env vars to call Meta.
5. The worker writes `postId`, `permalinkUrl`, metrics, and score back to Gun.
6. Portal reads Gun and shows results.

The current worker entrypoint is:

```sh
npm run market:meta-worker -- --dry-run
```

Live mode requires:

```sh
META_PAGE_ID=...
META_PAGE_ACCESS_TOKEN=...
npm run market:meta-worker
```

## Required Meta Setup

Start with a Page that 3dvr controls. Do not post to unrelated groups or personal profiles.

Likely app permissions:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `read_insights`

Keep the Graph API version configurable with `META_GRAPH_API_VERSION` because Meta versions and review behavior change.

## Data Model

Each experiment should store:

- `experimentId`
- `market`
- `angle`
- `message`
- `pageId`
- `postId`
- `publishedAt`
- `permalinkUrl`
- `reactionCount`
- `commentCount`
- `shareCount`
- `clickCount`
- `impressionCount`
- `uniqueImpressionCount`
- `engagedUsers`
- `marketSignalScore`

## Score

The current score weights stronger signs of buying interest higher than passive reactions:

- reactions: light signal
- comments: stronger signal
- shares: stronger distribution signal
- clicks: stronger intent signal
- engaged users and engagement rate: context

The purpose is not to optimize vanity metrics. A small post with a few serious comments can beat a larger post with shallow likes.

## Guardrails

- Human approval required before publishing.
- Prefer SEA-signed approval records before enabling live posting from the DO worker.
- Use only pages/accounts 3dvr controls or has explicit permission to manage.
- Store tokens only server-side.
- Respect Meta rate limits, app review requirements, and page policies.
- Do not auto-reply to people until there is a separate approval flow.
- Do not treat Facebook likes as the final market signal; look for comments, clicks, DMs, calls, signups, and CRM handoffs.

## Next Build Step

Install the worker on the DigitalOcean server as a timer that:

1. Reads an approved Market Pulse `metaGraph` plan.
2. Uses `META_PAGE_ACCESS_TOKEN` and `META_PAGE_ID`.
3. Calls the Page feed publish request.
4. Writes `postId` and `permalinkUrl` back to Gun.
5. Runs a scheduled measurement pass for that post.
