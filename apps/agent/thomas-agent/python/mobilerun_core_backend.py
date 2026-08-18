"""Optional Mobilerun mechanics backend for 3DVR Companion.

3DVR remains the policy/identity/audit boundary. This adapter is deliberately
small and dependency-optional: importing it does not require mobilerun-core.
"""

from __future__ import annotations

from typing import Any, Callable

from companion_execution_backend import (
    CompanionExecutionRequest,
    CompanionExecutionResult,
)


class MobilerunCoreBackend:
    """Bounded adapter around an injected Mobilerun Device-like object."""

    def __init__(self, device_factory: Callable[[], Any] | None = None) -> None:
        self._device_factory = device_factory or self._default_device_factory
        self._device: Any | None = None

    @staticmethod
    def _default_device_factory() -> Any:
        try:
            from mobilerun import Mobilerun  # type: ignore
        except ImportError as error:
            raise RuntimeError("mobilerun-core is unavailable") from error
        return Mobilerun().device

    def _get_device(self) -> Any:
        if self._device is None:
            self._device = self._device_factory()
        return self._device

    def supports(self, capability: str) -> bool:
        if capability != "device.status":
            return False
        try:
            device = self._get_device()
            supports = getattr(device, "supports", None)
            return bool(supports(capability)) if callable(supports) else True
        except (RuntimeError, OSError):
            return False

    def execute(self, request: CompanionExecutionRequest) -> CompanionExecutionResult:
        if request.capability != "device.status":
            return CompanionExecutionResult(
                request_id=request.request_id,
                capability=request.capability,
                ok=False,
                error_code="unsupported_capability",
            )
        try:
            device = self._get_device()
            supports = getattr(device, "supports", None)
            if callable(supports) and not supports("device.status"):
                return CompanionExecutionResult(
                    request_id=request.request_id,
                    capability=request.capability,
                    ok=False,
                    error_code="unsupported_capability",
                )
            status = getattr(device, "status", None)
            evidence = status() if callable(status) else status
            if evidence is None:
                evidence = {"available": True}
            elif not isinstance(evidence, dict):
                evidence = {"status": evidence}
            return CompanionExecutionResult(
                request_id=request.request_id,
                capability=request.capability,
                ok=True,
                evidence=evidence,
            )
        except (RuntimeError, OSError) as error:
            return CompanionExecutionResult(
                request_id=request.request_id,
                capability=request.capability,
                ok=False,
                evidence={"backend": "mobilerun-core", "detail": str(error)},
                error_code="backend_unavailable",
            )
