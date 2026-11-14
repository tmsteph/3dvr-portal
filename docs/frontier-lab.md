# Frontier Lab — first executable slice

Related: #3386 and #3387. GPLv3, upstream-first.

This is an **offline baseline analyzer**, not a self-modifying agent or nightly job. It processes deliberately sanitized event categories, counts failures, and writes a deterministic report. It does not access production systems, secrets, conversations, or third-party services.

## Try it

```sh
node scripts/frontier-lab.mjs /path/to/sanitized-events.json /tmp/frontier-report.json
node --test tests/frontier-lab.test.js
```

Input example:

```json
[{"kind":"queue_timeout","outcome":"failure"},{"kind":"queue_timeout","outcome":"success"}]
```

Only `kind` and `outcome` are read. **Do not feed raw logs or personal data into this script.** Output reports counts and failure rates, not individual records. The caller is responsible for preparing sanitized input.

## Next steps

- Add a permission-scoped event export and provenance without exposing sensitive logs.
- Identify the most frequent failure and reproduce it with a test.
- Survey upstream issue trackers and available fixes before changing code.
- Run a bounded, isolated experiment and compare results with the baseline.
- Produce a human-reviewed PR and persist a verified lesson in GROWTH.md.
- Integrate a scheduled reflection and opt-in morning report with audit and rollback.

No production deployment or automated external communication is authorized by this prototype.
