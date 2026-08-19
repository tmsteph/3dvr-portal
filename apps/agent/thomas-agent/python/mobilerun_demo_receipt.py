#!/usr/bin/env python3
"""Print one demo-safe Mobilerun device.status receipt as JSON.

Credentials are loaded only by MobilerunConfig/MobilerunCoreBackend from the
environment and are never included in this output. Exit status is non-zero when
the bounded read-only proof fails, making this useful for the v0.0.59 demo gate.
"""

from __future__ import annotations

import json
import sys
import time
import uuid

from companion_execution_backend import CompanionExecutionRequest
from mobilerun_core_backend import MobilerunCoreBackend


def main() -> int:
    request = CompanionExecutionRequest(
        request_id=f"demo-{uuid.uuid4().hex}",
        capability="device.status",
        arguments={},
        expires_at_ms=int(time.time() * 1000) + 30_000,
    )
    result = MobilerunCoreBackend().execute(request)
    receipt = {
        "request_id": result.request_id,
        "capability": result.capability,
        "ok": result.ok,
        "error_code": result.error_code,
        "evidence": result.evidence,
    }
    print(json.dumps(receipt, indent=2, sort_keys=True, default=str))
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
