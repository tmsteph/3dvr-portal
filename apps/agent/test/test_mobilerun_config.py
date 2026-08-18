import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "thomas-agent", "python"))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from mobilerun_config import MobilerunConfig


class MobilerunConfigTest(unittest.TestCase):
    def test_loads_endpoint_and_token_without_exposing_token(self):
        config = MobilerunConfig.from_env({
            "THREEDVR_MOBILERUN_URL": "http://127.0.0.1:8080/",
            "THREEDVR_MOBILERUN_TOKEN": "secret-token",
        })
        self.assertEqual(config.base_url, "http://127.0.0.1:8080")
        self.assertEqual(config.token, "secret-token")
        self.assertEqual(config.redacted(), {"base_url": "http://127.0.0.1:8080", "token": "[redacted]"})
        self.assertNotIn("secret-token", repr(config.redacted()))

    def test_rejects_missing_credentials(self):
        with self.assertRaisesRegex(RuntimeError, "not configured"):
            MobilerunConfig.from_env({})

    def test_rejects_non_http_endpoint(self):
        with self.assertRaisesRegex(RuntimeError, "http"):
            MobilerunConfig.from_env({
                "THREEDVR_MOBILERUN_URL": "file:///tmp/socket",
                "THREEDVR_MOBILERUN_TOKEN": "secret-token",
            })


if __name__ == "__main__":
    unittest.main()
