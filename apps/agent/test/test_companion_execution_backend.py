import pathlib
import sys
import time
import unittest

PYTHON_ROOT = pathlib.Path(__file__).resolve().parents[1] / "thomas-agent" / "python"
sys.path.insert(0, str(PYTHON_ROOT))

from companion_execution_backend import (  # noqa: E402
    CompanionExecutionRequest,
)


class CompanionExecutionRequestTests(unittest.TestCase):
    def setUp(self):
        self.now = int(time.time() * 1000)

    def request(self, capability="device.status", arguments=None):
        return CompanionExecutionRequest(
            request_id="req-1",
            capability=capability,
            expires_at_ms=self.now + 30_000,
            arguments=arguments or {},
        )

    def test_read_only_status_is_allowed(self):
        self.request().validate(self.now)

    def test_unknown_capability_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unsupported backend capability"):
            self.request("shell.exec").validate(self.now)

    def test_expired_request_is_rejected(self):
        request = CompanionExecutionRequest("req-1", "device.status", self.now - 1)
        with self.assertRaisesRegex(ValueError, "expired"):
            request.validate(self.now)

    def test_known_app_launch_requires_explicit_app_id(self):
        with self.assertRaisesRegex(ValueError, "approved app_id"):
            self.request("app.open_known").validate(self.now)
        self.request("app.open_known", {"app_id": "settings"}).validate(self.now)

    def test_free_form_gestures_are_not_in_contract(self):
        with self.assertRaises(ValueError):
            self.request("ui.tap", {"x": 10, "y": 20}).validate(self.now)


if __name__ == "__main__":
    unittest.main()
