import sys
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


def test_rejects_other_allowed_protocol_capabilities_in_first_slice():
    backend = MobilerunCoreBackend(lambda: FakeDevice())
    result = backend.execute(request("ui.snapshot"))
    assert result.ok is False
    assert result.error_code == "unsupported_capability"
