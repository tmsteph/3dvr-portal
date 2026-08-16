# Context HQ Practice

The operating loop is now:

1. Managed work runs through the canonical `3dvr-managed` task queue.
2. The Context HQ workflow checks finalized managed tasks each hour.
3. Completed and failed tasks receive idempotent founder handoffs under the Context HQ owner.
4. Raw model, web, and tool output stays in the canonical task record instead of being silently promoted into trusted memory.
5. Around 8 AM America/Los_Angeles, the founder sweep reads the managed queue plus Context HQ messages and handoffs, then persists one brief.
6. Portal administrators can read the latest persisted sweep and handoff at `/context-hq/`.

This intentionally keeps execution state and durable organizational memory separate while making them interoperable.
