"""Bounded execution-backend contract for 3DVR Companion.

Backends receive already-authorized named capabilities. They are not policy engines and
must not accept arbitrary shell commands, free-form prompts, or unrestricted gestures.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol


ALLOWED_BACKEND_CAPABILITIES = frozenset({
    "device.status",
    "app.open_known",
    "ui.snapshot",
})


@dataclass(frozen=True)
class CompanionExecutionRequest:
    request_id: str
    capability: str
    expires_at_ms: int
    arguments: Mapping[str, Any] = field(default_factory=dict)

    def validate(self, now_ms: int) -> None:
        if not self.request_id.strip():
            raise ValueError("request_id is required")
        if self.capability not in ALLOWED_BACKEND_CAPABILITIES:
            raise ValueError(f"unsupported backend capability: {self.capability}")
        if self.expires_at_ms <= now_ms:
            raise ValueError("request has expired")
        if self.capability == "app.open_known":
            app_id = self.arguments.get("app_id")
            if not isinstance(app_id, str) or not app_id.strip():
                raise ValueError("app.open_known requires an approved app_id")


@dataclass(frozen=True)
class CompanionExecutionResult:
    request_id: str
    capability: str
    ok: bool
    evidence: Mapping[str, Any] = field(default_factory=dict)
    error_code: str | None = None


class CompanionExecutionBackend(Protocol):
    """Mechanics-only backend behind 3DVR policy, approval, expiry, and audit."""

    def supports(self, capability: str) -> bool:
        ...

    def execute(self, request: CompanionExecutionRequest) -> CompanionExecutionResult:
        ...
