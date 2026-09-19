"""Provider boundary for the 3DVR Digital Organism.

The organism owns memory and context. Model providers are replaceable transports.
Only Python's standard library is required.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Protocol, Sequence


Message = dict[str, str]


class Provider(Protocol):
    """Minimal interface every reasoning provider must implement."""

    name: str

    def complete(self, messages: Sequence[Message]) -> str:
        """Return one assistant response for the supplied chat messages."""


@dataclass(slots=True)
class EchoProvider:
    """Offline provider used to test the provider boundary without a model."""

    name: str = "echo"

    def complete(self, messages: Sequence[Message]) -> str:
        for message in reversed(messages):
            if message.get("role") == "user":
                return message.get("content", "")
        return ""


@dataclass(slots=True)
class OpenAICompatibleProvider:
    """Talk to any server exposing /v1/chat/completions.

    This includes local servers such as Ollama as well as hosted services that
    intentionally implement the same wire format. No vendor SDK is required.
    """

    base_url: str
    model: str
    api_key: str | None = None
    timeout: float = 120.0
    name: str = "openai-compatible"

    def complete(self, messages: Sequence[Message]) -> str:
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = json.dumps(
            {
                "model": self.model,
                "messages": list(messages),
                "stream": False,
            }
        ).encode("utf-8")

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        request = urllib.request.Request(
            endpoint,
            data=payload,
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                body = json.load(response)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"{self.name} returned HTTP {exc.code}: {detail}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Could not reach {self.name} at {endpoint}: {exc.reason}"
            ) from exc

        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(
                f"{self.name} returned an unexpected response shape"
            ) from exc

        if not isinstance(content, str):
            raise RuntimeError(f"{self.name} returned non-text content")
        return content


def make_provider(
    name: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> Provider:
    """Construct a provider explicitly.

    No external provider is selected implicitly. That prevents accidental
    transmission of personal context to a third party.
    """

    normalized = name.strip().lower()

    if normalized == "echo":
        return EchoProvider()

    if normalized == "ollama":
        if not model:
            raise ValueError("--model is required for the ollama provider")
        return OpenAICompatibleProvider(
            base_url=base_url or "http://127.0.0.1:11434/v1",
            model=model,
            api_key=api_key or "ollama",
            name="ollama",
        )

    if normalized in {"openai-compatible", "compatible"}:
        if not model:
            raise ValueError("--model is required for an OpenAI-compatible provider")
        if not base_url:
            raise ValueError("--base-url is required for an OpenAI-compatible provider")
        return OpenAICompatibleProvider(
            base_url=base_url,
            model=model,
            api_key=api_key,
        )

    raise ValueError(
        f"Unknown provider {name!r}. Choose echo, ollama, or openai-compatible."
    )
