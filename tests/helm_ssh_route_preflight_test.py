import importlib.util
import unittest
from pathlib import Path

# The deployed manual CLI has a hyphenated filename, so load that exact file.
SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "helm-ssh-route-preflight.py"
spec = importlib.util.spec_from_file_location("helm_ssh_route_preflight", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
classify = module.classify


class RouteSafetyTest(unittest.TestCase):
    def test_ovh_loopback_override_is_blocked(self):
        self.assertEqual(classify("ovh-ssh-alias", "hostname localhost\nport 22\nproxycommand none\nproxyjump none\n", ["127.0.0.1", "::1"]), "BLOCKED_LOOPBACK_DESTINATION")

    def test_shared_loopback_is_not_a_hetzner_identity(self):
        self.assertEqual(classify("alias", "hostname 127.0.0.1\nport 22\n", ["127.0.0.1"]), "BLOCKED_LOOPBACK_DESTINATION")

    def test_canonical_nonloopback_is_only_classified_not_authenticated(self):
        self.assertEqual(classify("", "hostname 203.0.113.10\nport 22\nproxycommand none\nproxyjump none\n", ["203.0.113.10"]), "NON_LOOPBACK_ONLY_IDENTITY_UNVERIFIED")

    def test_mapped_ipv4_loopback_is_blocked(self):
        self.assertEqual(classify("alias", "hostname ipv6-map\nport 22\n", ["::ffff:127.0.0.1"]), "BLOCKED_LOOPBACK_DESTINATION")

    def test_dns_unknown_fails_closed(self):
        self.assertEqual(classify("alias", "hostname cannot-resolve\nport 22\n", []), "BLOCKED_DNS_UNVERIFIED")

    def test_unsafe_alias_fails_before_subprocess(self):
        self.assertEqual(classify("-oProxyCommand=bad"), "BLOCKED_INVALID_ALIAS")

    def test_proxy_route_needs_review(self):
        self.assertEqual(classify("alias", "hostname hetzner\nport 22\nproxycommand ssh jump\n", ["10.0.0.8"]), "BLOCKED_PROXY_REQUIRES_REVIEW")

    def test_custom_port_needs_review(self):
        self.assertEqual(classify("alias", "hostname hetzner\nport 2222\n", ["10.0.0.8"]), "BLOCKED_UNRECOGNIZED_TRANSPORT")


if __name__ == '__main__':
    unittest.main()
