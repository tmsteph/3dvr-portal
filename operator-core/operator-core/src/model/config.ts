import { ModelRouter } from "./router";
import { ModelProvider } from "./types";
import { FakeProvider, OllamaProvider, OpenAiCompatibleProvider } from "./providers";

// Router configuration comes from server-side environment only. Nothing here
// is safe to run in a browser: OPERATOR_MODEL_API_KEY must exist solely in the
// server process env (in production: delivered via the OpenBao-backed secrets
// broker on OVH, never committed, never logged).
//
//   OPERATOR_MODEL_PROVIDER   "api" (default) | "ollama" | "fake"
//   OPERATOR_MODEL_NAME       model name for the primary provider (required
//                             for api/ollama)
//   OPERATOR_MODEL_BASE_URL   api default https://api.openai.com/v1,
//                             ollama default http://127.0.0.1:11434
//   OPERATOR_MODEL_API_KEY    api provider key (server-side only)
//   OPERATOR_MODEL_FALLBACK   optional second provider kind, configured with
//                             OPERATOR_MODEL_FALLBACK_NAME / _BASE_URL
//   OPERATOR_MODEL_FAKE_RESPONSE  raw output for the "fake" provider

type Env = Record<string, string | undefined>;

function buildProvider(kind: string, env: Env, prefix: string): ModelProvider {
  const name = env[`${prefix}NAME`];
  const baseUrl = env[`${prefix}BASE_URL`];
  switch (kind) {
    case "fake":
      return new FakeProvider("fake", env["OPERATOR_MODEL_FAKE_RESPONSE"] ?? "[]");
    case "ollama":
      if (!name) throw new Error(`${prefix}NAME is required for the ollama provider`);
      return new OllamaProvider({ model: name, baseUrl });
    case "api":
      if (!name) throw new Error(`${prefix}NAME is required for the api provider`);
      return new OpenAiCompatibleProvider({
        model: name,
        baseUrl: baseUrl ?? "https://api.openai.com/v1",
        apiKey: env["OPERATOR_MODEL_API_KEY"],
      });
    default:
      throw new Error(`unknown model provider kind: ${kind}`);
  }
}

export function routerFromEnv(env: Env = process.env): ModelRouter {
  const primaryKind = env["OPERATOR_MODEL_PROVIDER"] ?? "api";
  const providers = [buildProvider(primaryKind, env, "OPERATOR_MODEL_")];
  const fallbackKind = env["OPERATOR_MODEL_FALLBACK"];
  if (fallbackKind) {
    providers.push(buildProvider(fallbackKind, env, "OPERATOR_MODEL_FALLBACK_"));
  }
  return new ModelRouter(providers);
}
