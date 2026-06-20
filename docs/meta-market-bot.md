# Meta Market Bot

Goal: use the Meta Graph API and Threads API to publish controlled posts and measure the reaction so 3dvr.tech can find markets with real demand.

This is not a scraping bot, spam bot, or auto-reply system. It is a market experiment loop:

1. Pick one market angle from Market Pulse.
2. Draft one Facebook Page or Threads post.
3. Require human approval.
4. Publish through the server-side Meta worker.
5. Store the returned post id.
6. Re-check reactions, comments/replies, shares/reposts, clicks, views, impressions, and engaged users.
7. Score the result and feed it back into Market Pulse.

## Current Implementation

The first implementation lives in:

- `src/growth/meta-graph.js`: request builders, measurement helpers, and scoring for Facebook Pages and Threads.
- `src/growth/market-pulse.js`: Facebook Page probes include a `metaGraph` plan; Threads probes include a `threadsApi` plan.
- `sales/market-pulse.html`: dashboard copy shows the approval-gated Meta publishing paths.

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

The Market Pulse dashboard writes approved API-backed probes to:

```text
3dvr-portal/growth/meta-market/jobs/{probe-id}
```

Each queued record uses `status: approved`, carries the channel/integration, and keeps the original post copy for the worker. The worker changes the same record to `published`, `measured`, or `error`.

Facebook Page live mode requires:

```sh
META_PAGE_ID=...
META_PAGE_ACCESS_TOKEN=...
npm run market:meta-worker
```

If you only have a Graph API Explorer User token, keep it server-side as `META_USER_ACCESS_TOKEN` and include `META_PAGE_ID`; the worker will call `/me/accounts` and use the matching Page token returned by Meta.

Threads live mode requires:

```sh
THREADS_USER_ID=me
THREADS_ACCESS_TOKEN=...
npm run market:meta-worker
```

## Required Meta Setup

Start with a Page and Threads account that 3dvr controls. Do not post to unrelated groups, unrelated pages, or personal profiles.

Facebook Page permissions:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `read_insights`

Threads permissions:

- `threads_basic`
- `threads_content_publish`
- `threads_manage_insights`
- `threads_read_replies`

Keep API versions configurable with `META_GRAPH_API_VERSION` and `THREADS_API_VERSION` because Meta versions and review behavior change.

## Data Model

Each experiment should store:

- `experimentId`
- `market`
- `angle`
- `message`
- `pageId`
- `threadsUserId`
- `creationId`
- `postId`
- `mediaId`
- `publishedAt`
- `permalinkUrl`
- `reactionCount`
- `commentCount`
- `shareCount`
- `clickCount`
- `impressionCount`
- `uniqueImpressionCount`
- `engagedUsers`
- `viewCount`
- `likeCount`
- `replyCount`
- `repostCount`
- `quoteCount`
- `marketSignalScore`

## Score

The current scores weight stronger signs of buying interest higher than passive reactions:

- Facebook reactions and Threads likes: light signal
- Facebook comments and Threads replies: stronger signal
- Facebook shares and Threads reposts/quotes: stronger distribution signal
- clicks, views, engaged users, and engagement rate: context

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
2. Reads an approved Market Pulse `threadsApi` plan.
3. Uses `META_PAGE_ACCESS_TOKEN`/`META_PAGE_ID` for Facebook Page jobs, or `META_USER_ACCESS_TOKEN` to resolve the Page token from `/me/accounts`.
4. Uses `THREADS_ACCESS_TOKEN`/`THREADS_USER_ID` for Threads jobs.
5. Writes `postId`, `mediaId`, and `permalinkUrl` back to Gun when the platform returns them.
6. Runs a scheduled measurement pass for that post.
