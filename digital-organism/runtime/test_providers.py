import io
import json
import unittest
from unittest.mock import patch

from providers import EchoProvider, OpenAICompatibleProvider, make_provider


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


class ProviderTests(unittest.TestCase):
    def test_echo_provider_returns_latest_user_message(self):
        provider = EchoProvider()
        self.assertEqual(
            provider.complete(
                [
                    {"role": "user", "content": "first"},
                    {"role": "assistant", "content": "reply"},
                    {"role": "user", "content": "second"},
                ]
            ),
            "second",
        )

    def test_ollama_is_local_and_explicit(self):
        provider = make_provider("ollama", model="test-model")
        self.assertEqual(provider.base_url, "http://127.0.0.1:11434/v1")
        self.assertEqual(provider.model, "test-model")
        self.assertEqual(provider.name, "ollama")

    def test_compatible_provider_requires_endpoint(self):
        with self.assertRaises(ValueError):
            make_provider("openai-compatible", model="some-model")

    def test_http_provider_parses_chat_completion(self):
        response = FakeResponse(
            json.dumps(
                {"choices": [{"message": {"content": "hello from model"}}]}
            ).encode("utf-8")
        )
        provider = OpenAICompatibleProvider(
            base_url="http://localhost:9999/v1",
            model="model",
        )
        with patch("urllib.request.urlopen", return_value=response) as urlopen:
            result = provider.complete([{"role": "user", "content": "hello"}])

        self.assertEqual(result, "hello from model")
        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "http://localhost:9999/v1/chat/completions",
        )


if __name__ == "__main__":
    unittest.main()
