"""Environment-only configuration for the optional Mobilerun backend."""

from __future__ import annotations

from dataclasses import dataclass
from os import environ
from urllib.parse import urlparse


@dataclass(frozen=True)
class MobilerunConfig:
    base_url: str
    token: str

    @classmethod
    def from_env(cls, env=None) -> "MobilerunConfig":
        values = environ if env is None else env
        base_url = values.get("THREEDVR_MOBILERUN_URL", "").strip().rstrip("/")
        token = values.get("THREEDVR_MOBILERUN_TOKEN", "").strip()
        if not base_url or not token:
            raise RuntimeError("Mobilerun endpoint credentials are not configured")
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise RuntimeError("Mobilerun endpoint URL must be http(s)")
        return cls(base_url=base_url, token=token)

    def redacted(self) -> dict[str, str]:
        return {"base_url": self.base_url, "token": "[redacted]"}
