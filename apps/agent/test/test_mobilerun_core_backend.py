import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "thomas-agent" / "python"))

from companion_execution_backend import CompanionExecutionRequest
from mobilerun_core_backend import MobilerunCoreBackend


class FakeDevice:
    def __init__(self, supported=True):
        self.supported = supported

    def supports(self, capability):
        return self.supported and capability == "device.status"

    def status(self):
        return {"connected": True, "transport": "local-android-http"}


def request(capability="device.status"):
    return CompanionExecutionRequest("req-1", capability, 9999999999999)


def test_reports_device_status_without_broadening_authority():
    backend = MobilerunCoreBackend(lambda: FakeDevice())
    result = backend.execute(request())
    assert result.ok is True
    assert result.evidence["connected"] is True
    assert result.evidence["backend"] == "mobilerun-core"
    assert result.evidence["transport"] == "local-android-http"
    assert result.evidence["round_trip_latency_ms"] >= 0
    assert result.evidence["credentials_redacted"] is True
    assert result.evidence["fallback_used"] is False
    assert backend.supports("device.status") is True
    assert backend.supports("shell.exec") is False


def test_returns_structured_unsupported_evidence():
    backend = MobilerunCoreBackend(lambda: FakeDevice(False))
    result = backend.execute(request())
    assert result.ok is False
    assert result.error_code == "unsupported_capability"


def test_returns_structured_unavailable_evidence():
    def unavailable():
        raise RuntimeError("mobilerun-core is unavailable")

    backend = MobilerunCoreBackend(unavailable)
    result = backend.execute(request())
    assert result.ok is False
    assert result.error_code == "backend_unavailable"
    assert result.evidence["backend"] == "mobilerun-core"
    assert result.evidence["credentials_redacted"] is True
    assert result.evidence["round_trip_latency_ms"] >= 0


def test_rejects_other_allowed_protocol_capabilities_in_first_slice():
    backend = MobilerunCoreBackend(lambda: FakeDevice())
    result = backend.execute(request("ui.snapshot"))
    assert result.ok is False
    assert result.error_code == "unsupported_capability"


def test_default_factory_passes_env_endpoint_and_token(monkeypatch):
    captured = {}

    class FakeMobilerun:
        def __init__(self, **kwargs):
            captured.update(kwargs)
            self.device = FakeDevice()

    monkeypatch.setenv("THREEDVR_MOBILERUN_URL", "http://127.0.0.1:8080/")
    monkeypatch.setenv("THREEDVR_MOBILERUN_TOKEN", "secret-token")
    monkeypatch.setitem(sys.modules, "mobilerun", types.SimpleNamespace(Mobilerun=FakeMobilerun))

    backend = MobilerunCoreBackend()
    result = backend.execute(request())

    assert result.ok is True
    assert captured == {"base_url": "http://127.0.0.1:8080", "token": "secret-token"}
    assert "secret-token" not in repr(result.evidence)
    assert result.evidence["credentials_redacted"] is True


def test_default_factory_reports_missing_external_credentials(monkeypatch):
    monkeypatch.delenv("THREEDVR_MOBILERUN_URL", raising=False)
    monkeypatch.delenv("THREEDVR_MOBILERUN_TOKEN", raising=False)
    backend = MobilerunCoreBackend()
    result = backend.execute(request())
    assert result.ok is False
    assert result.error_code == "backend_unavailable"
    assert "not configured" in result.evidence["detail"]
    assert result.evidence["credentials_redacted"] is True
