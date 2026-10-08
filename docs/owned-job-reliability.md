# Owned job lifecycle and health

Open Runner's private GitHub queue remains the independent assistant-to-server path. Use `mesh-shell` for work on another node so the deadline and resource budget apply on that node. Raw SSH inside a local shell job cannot provide the same target-side guarantees.

Every cloud job runs in its own systemd scope with a deadline, bounded memory/swap/tasks/CPU, and low CPU/IO weight. Cleanup stops the scope on success, error, and timeout, including detached descendants. Process-group cleanup also covers transport commands; captured output is bounded so logs cannot exhaust the recovery daemon's RAM. Persistent services must be installed as explicit systemd services, rather than backgrounded inside a job.

Normal jobs remain unclaimed in the queue until target headroom covers their memory budget plus reserve. OVH keeps 2 GiB, Hetzner 768 MiB, and DigitalOcean 128 MiB in reserve. Sustained memory stalls defer ordinary work too. A capacity race before execution returns the job to the queue with a deferral receipt.

Authorized `priority: recovery` tasks bypass admission pressure but remain capped at 128 MiB and 50% CPU. This is for bounded inspection/recovery, never builds or experiments. Normal memory budgets default to 512 MiB on OVH/Hetzner and 64 MiB on DO; `memory_mib` can request a larger budget within per-node caps. Deadlines cap at 30 minutes unless explicitly configured otherwise.

Examples (options precede the target):
```sh
python3 apps/agent/tools/open-runner-submit.py --priority recovery --timeout 30 ovh -- uptime
python3 apps/agent/tools/open-runner-submit.py --memory-mib 768 hetzner -- 'npm test'
```

The runner writes an atomic heartbeat beside its existing private configuration, including running-job deadline and poll errors. Its daemon runs in the protected recovery slice; jobs run outside that slice.

Cloud health runs every 15 minutes and checks critical services, restart loops, runner heartbeat, persistent blocked processes, all six SSH directions, and primary/standby/local Portal endpoints. Failed GitHub health runs use the existing GitHub notification route. A separate server-side timer performs the same SSH checks even when GitHub ingress is unavailable. Health checks inspect; they never send outreach or execute arbitrary repairs.
