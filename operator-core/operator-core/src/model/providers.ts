import { ModelProvider, PlanContext } from "./types";

// Providers return RAW model text only. None of them parse, validate, log
// prompts, or see any credential other than the one API key they are handed
// at construction (server-side env, see config.ts). Keys are never logged.

/** Minimal fetch shape, so tests can inject a stub and Node types stay simple. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<FetchResponse>;

const defaultFetch: FetchLike = (url, init) =>
  (globalThis as { fetch: FetchLike }).fetch(url, init);

/** Deterministic provider for tests and offline wiring checks. No network. */
export class FakeProvider implements ModelProvider {
  constructor(
    readonly id: string,
    private raw: string | ((context: PlanContext) => string)
  ) {}
  async complete(context: PlanContext): Promise<string> {
    return typeof this.raw === "function" ? this.raw(context) : this.raw;
  }
}

/**
 * Any OpenAI-compatible chat-completions API (OpenAI itself, or a compatible
 * endpoint). API-first per Thomas's 2026-10-20 decision.
 */
export class OpenAiCompatibleProvider implements ModelProvider {
  readonly id: string;
  private fetchFn: FetchLike;
  constructor(
    private opts: {
      baseUrl: string;
      model: string;
      apiKey?: string;
      id?: string;
      fetchFn?: FetchLike;
    }
  ) {
    this.id = opts.id ?? `api:${opts.model}`;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
  }
  async complete(_context: PlanContext, prompt: string): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) headers["authorization"] = `Bearer ${this.opts.apiKey}`;
    const res = await this.fetchFn(`${this.opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.opts.model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`model API request failed with status ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("model API response had no text content");
    }
    return content;
  }
}

/**
 * OpenAI Responses API (POST /responses). Some OpenAI keys are scoped to
 * this endpoint only and reject /chat/completions outright (verified
 * 2026-11-05: the production key returns 401 "Missing scopes:
 * model.request" on chat completions but 200 on responses), so the planner
 * needs this shape as a first-class provider. Request and text extraction
 * mirror the proven portal code in src/operator/api.js: { model,
 * store: false, instructions, input } in, output_text out. Non-streaming:
 * providers return the full raw text and the router parses it.
 */
export class OpenAiResponsesProvider implements ModelProvider {
  readonly id: string;
  private fetchFn: FetchLike;
  constructor(
    private opts: {
      baseUrl: string;
      model: string;
      apiKey?: string;
      id?: string;
      fetchFn?: FetchLike;
    }
  ) {
    this.id = opts.id ?? `responses:${opts.model}`;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
  }
  async complete(_context: PlanContext, prompt: string): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) headers["authorization"] = `Bearer ${this.opts.apiKey}`;
    const res = await this.fetchFn(`${this.opts.baseUrl}/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.opts.model,
        store: false,
        instructions:
          "You are the planner for a personal AI operator. You can only " +
          "propose actions; you cannot execute anything yourself.",
        input: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`model API request failed with status ${res.status}`);
    }
    const data = (await res.json()) as {
      output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
    };
    const text = (data.output ?? [])
      .flatMap((item) => item?.content ?? [])
      .find((item) => item?.type === "output_text")?.text;
    if (typeof text !== "string" || text === "") {
      throw new Error("model API response had no text content");
    }
    return text;
  }
}

/** Local model served by Ollama. No API key; intended for the owner's LAN/host. */
export class OllamaProvider implements ModelProvider {
  readonly id: string;
  private fetchFn: FetchLike;
  constructor(
    private opts: { baseUrl?: string; model: string; id?: string; fetchFn?: FetchLike }
  ) {
    this.id = opts.id ?? `ollama:${opts.model}`;
    this.fetchFn = opts.fetchFn ?? defaultFetch;
  }
  async complete(_context: PlanContext, prompt: string): Promise<string> {
    const base = this.opts.baseUrl ?? "http://127.0.0.1:11434";
    const res = await this.fetchFn(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.opts.model,
        stream: false,
        format: "json",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      throw new Error(`ollama request failed with status ${res.status}`);
    }
    const data = (await res.json()) as { message?: { content?: unknown } };
    const content = data.message?.content;
    if (typeof content !== "string") {
      throw new Error("ollama response had no text content");
    }
    return content;
  }
}
