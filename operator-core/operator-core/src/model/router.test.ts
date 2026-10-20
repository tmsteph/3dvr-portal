import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";

import { OperatorCore } from "../core";
import { Device, OwnerPolicy } from "../types";
import { nowIso } from "../crypto";
import { ModelRouter } from "./router";
import { FakeProvider, OllamaProvider, OpenAiCompatibleProvider, FetchLike } from "./providers";
import { routerFromEnv } from "./config";
import { PlanContext } from "./types";

const POLICY: OwnerPolicy = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../policy/fixtures/default-policy.json"), "utf8")
);

function makeDevice(id: string, kind: Device["kind"]): Device {
  const caps =
    kind === "host_agent"
      ? [
          { name: "host.file.write", version: "1.0.0", risk: "R1" as const, args_schema: {}, preconditions: [], description: "Write file within workspace roots" },
          { name: "host.file.read", version: "1.0.0", risk: "R0" as const, args_schema: {}, preconditions: [], description: "Read file within workspace roots" },
        ]
      : [
          { name: "message.send", version: "1.0.0", risk: "R2" as const, args_schema: {}, preconditions: ["screen_unlocked"], description: "Send a message (external)" },
        ];
  return {
    device_id: id, kind, display_name: id, public_key: "dev-key",
    enrolled_at: nowIso(), capabilities: caps, trust: { status: "healthy", last_seen_at: nowIso() },
  };
}

const DEVICES = [makeDevice("dev_laptop01", "host_agent"), makeDevice("dev_pixel01", "android_companion")];
const CONTEXT: PlanContext = {
  description: "Save notes to the laptop and text the contact",
  devices: DEVICES,
};

const VALID_PLAN = JSON.stringify([
  { device_id: "dev_laptop01", capability: "host.file.write", args: { path: "~/notes.md", text: "hi" } },
  { device_id: "dev_pixel01", capability: "message.send", args: { to: "Esai", text: "saved" } },
]);

test("valid model plan validates and still crosses core policy", async () => {
  const router = new ModelRouter([new FakeProvider("fake:test", VALID_PLAN)]);
  const { proposals, provider_id } = await router.propose(CONTEXT);
  assert.equal(provider_id, "fake:test");
  assert.equal(proposals.length, 2);

  // The model proposes; policy decides. R1 auto-allows, R2 waits for approval.
  const core = new OperatorCore(POLICY);
  for (const d of DEVICES) core.devices.enroll(d);
  const job = core.createJob(CONTEXT.description, DEVICES.map((d) => d.device_id));
  core.proposeActions(job.job_id, proposals);
  const { approved, needsApproval, denied } = core.authorize(job.job_id);
  assert.equal(denied.length, 0);
  assert.equal(approved.length, 1);
  assert.equal(needsApproval.length, 1);
  assert.equal(needsApproval[0].capability, "message.send");
});

test("hallucinated capability fails closed", async () => {
  const bad = JSON.stringify([
    { device_id: "dev_laptop01", capability: "host.system.shutdown", args: {} },
  ]);
  const router = new ModelRouter([new FakeProvider("fake:bad", bad)]);
  await assert.rejects(() => router.propose(CONTEXT), /not granted/);
});

test("unknown device fails closed", async () => {
  const bad = JSON.stringify([
    { device_id: "dev_stranger", capability: "host.file.read", args: { path: "/etc/passwd" } },
  ]);
  const router = new ModelRouter([new FakeProvider("fake:bad", bad)]);
  await assert.rejects(() => router.propose(CONTEXT), /unknown device_id/);
});

test("non-JSON and empty plans fail closed", async () => {
  const garbage = new ModelRouter([new FakeProvider("fake:garbage", "Sure! Doing it now.")]);
  await assert.rejects(() => garbage.propose(CONTEXT), /not valid JSON/);
  const empty = new ModelRouter([new FakeProvider("fake:empty", "[]")]);
  await assert.rejects(() => empty.propose(CONTEXT), /no actions/);
});

test("non-object args fail closed", async () => {
  const bad = JSON.stringify([
    { device_id: "dev_laptop01", capability: "host.file.read", args: ["/etc/passwd"] },
  ]);
  const router = new ModelRouter([new FakeProvider("fake:bad", bad)]);
  await assert.rejects(() => router.propose(CONTEXT), /args must be an object/);
});

test("fallback provider rescues a failed primary", async () => {
  const router = new ModelRouter([
    new FakeProvider("fake:primary", "not json at all"),
    new FakeProvider("fake:fallback", VALID_PLAN),
  ]);
  const result = await router.propose(CONTEXT);
  assert.equal(result.provider_id, "fake:fallback");
  assert.equal(result.proposals.length, 2);
});

test("openai-compatible provider parses fenced JSON and sends the key as a header", async () => {
  let seenUrl = "";
  let seenAuth: string | undefined;
  let seenModel = "";
  const fetchFn: FetchLike = async (url, init) => {
    seenUrl = url;
    seenAuth = init.headers["authorization"];
    seenModel = JSON.parse(init.body).model;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "```json\n" + VALID_PLAN + "\n```" } }],
      }),
    };
  };
  const provider = new OpenAiCompatibleProvider({
    baseUrl: "https://models.example/v1",
    model: "test-model",
    apiKey: "sk-test-not-real",
    fetchFn,
  });
  const router = new ModelRouter([provider]);
  const result = await router.propose(CONTEXT);
  assert.equal(result.proposals.length, 2);
  assert.equal(seenUrl, "https://models.example/v1/chat/completions");
  assert.equal(seenAuth, "Bearer sk-test-not-real");
  assert.equal(seenModel, "test-model");
});

test("ollama provider parses message content", async () => {
  const fetchFn: FetchLike = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ message: { content: VALID_PLAN } }),
  });
  const provider = new OllamaProvider({ model: "llama-test", fetchFn });
  const router = new ModelRouter([provider]);
  const result = await router.propose(CONTEXT);
  assert.equal(result.provider_id, "ollama:llama-test");
  assert.equal(result.proposals.length, 2);
});

test("provider HTTP failure is a clean error, not a plan", async () => {
  const fetchFn: FetchLike = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const provider = new OpenAiCompatibleProvider({ baseUrl: "https://x/v1", model: "m", fetchFn });
  const router = new ModelRouter([provider]);
  await assert.rejects(() => router.propose(CONTEXT), /status 500/);
});

test("env config builds an api-first router and requires a model name", () => {
  const router = routerFromEnv({
    OPERATOR_MODEL_PROVIDER: "api",
    OPERATOR_MODEL_NAME: "some-model",
    OPERATOR_MODEL_FALLBACK: "ollama",
    OPERATOR_MODEL_FALLBACK_NAME: "local-model",
  });
  assert.deepEqual(router.providerIds(), ["api:some-model", "ollama:local-model"]);
  assert.throws(() => routerFromEnv({ OPERATOR_MODEL_PROVIDER: "api" }), /NAME is required/);
});
