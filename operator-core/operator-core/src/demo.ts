import { OperatorCore } from "./core";
import { Device, OwnerPolicy } from "./types";
import { nowIso } from "./crypto";
import * as fs from "fs";
import * as path from "path";

const POLICY: OwnerPolicy = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../policy/fixtures/default-policy.json"), "utf8")
);

function makeDevice(id: string, kind: Device["kind"], name: string): Device {
  const caps = kind === "host_agent"
    ? [
        { name: "host.file.write", version: "1.0.0", risk: "R1" as const, args_schema: {}, preconditions: [], description: "Write file within workspace roots" },
        { name: "host.file.read", version: "1.0.0", risk: "R0" as const, args_schema: {}, preconditions: [], description: "Read file within workspace roots" },
      ]
    : [
        { name: "android.ui.click", version: "1.0.0", risk: "R1" as const, args_schema: {}, preconditions: ["screen_unlocked"], description: "Tap a UI element" },
        { name: "message.send", version: "1.0.0", risk: "R2" as const, args_schema: {}, preconditions: ["screen_unlocked"], description: "Send a message (external)" },
      ];
  return {
    device_id: id, kind, display_name: name, public_key: "dev-key",
    enrolled_at: nowIso(), capabilities: caps, trust: { status: "healthy", last_seen_at: nowIso() },
  };
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("== Operator core prototype: Gate 0 acceptance ==\n");

  // ---- Golden path -------------------------------------------------------
  console.log("Golden path: job -> plan -> approve -> execute -> receipts");
  const core = new OperatorCore(POLICY);
  core.devices.enroll(makeDevice("dev_laptop01", "host_agent", "Thomas's laptop"));
  core.devices.enroll(makeDevice("dev_pixel01", "android_companion", "Pixel 9"));

  const job = core.createJob("Save status notes to laptop and text Esai", ["dev_laptop01", "dev_pixel01"]);
  core.proposeActions(job.job_id, [
    { device_id: "dev_laptop01", capability: "host.file.write", args: { path: "~/workspace/notes/status.md", text: "Operator sprint day 1" } },
    { device_id: "dev_pixel01", capability: "message.send", args: { to: "Esai", text: "Status notes saved" } },
  ]);
  const { approved, needsApproval, denied } = core.authorize(job.job_id);
  check("R1 file write auto-allowed", approved.length === 1 && approved[0].capability === "host.file.write");
  check("R2 message.send needs approval", needsApproval.length === 1 && denied.length === 0);

  const apr = core.approve(needsApproval[0].action_id, "thomas");
  check("approval bound to action hash", apr.action_hash.length === 64);

  const receipts = core.execute(job.job_id);
  check("job completed", core.getJob(job.job_id).status === "completed");
  check("two success receipts", receipts.filter((r) => r.outcome === "success").length === 2);
  check("audit chain intact", core.audit.verifyChain(job.job_id));
  const secret = receipts[0].args_redacted;
  check("args present on receipt", typeof secret === "object");

  // ---- Negative: tampered envelope --------------------------------------
  console.log("\nFail-closed: tampered envelope is denied by executor");
  const core2 = new OperatorCore(POLICY);
  core2.devices.enroll(makeDevice("dev_laptop01", "host_agent", "laptop"));
  const j2 = core2.createJob("tamper test", ["dev_laptop01"]);
  const [env] = core2.proposeActions(j2.job_id, [
    { device_id: "dev_laptop01", capability: "host.file.write", args: { path: "/tmp/x", text: "x" } },
  ]);
  core2.authorize(j2.job_id);
  // Attacker flips args after signing-equivalent step: execute() signs the
  // real envelope, so instead we call the executor directly with a forged one.
  const forged = { ...env, args: { path: "/etc/passwd", text: "pwned" }, signature: "forged" };
  const r2 = core2.executor.execute(core2.devices.get("dev_laptop01")!, forged as never);
  check("forged signature denied", r2.outcome === "denied" && r2.reason_code === "unsigned_or_tampered_envelope");

  // ---- Negative: duplicate delivery --------------------------------------
  console.log("\nIdempotency: duplicate delivery produces one effect");
  const core3 = new OperatorCore(POLICY);
  core3.devices.enroll(makeDevice("dev_laptop01", "host_agent", "laptop"));
  const j3 = core3.createJob("idempotency test", ["dev_laptop01"]);
  core3.proposeActions(j3.job_id, [
    { device_id: "dev_laptop01", capability: "host.file.write", args: { path: "/tmp/once", text: "once" } },
  ]);
  core3.authorize(j3.job_id);
  core3.execute(j3.job_id);
  const before = core3.audit.forJob(j3.job_id).filter((r) => r.outcome === "success").length;
  core3.execute(j3.job_id); // redeliver the whole job
  const after = core3.audit.forJob(j3.job_id).filter((r) => r.outcome === "success").length;
  const dups = core3.audit.forJob(j3.job_id).filter((r) => r.outcome === "duplicate_suppressed").length;
  check("no second effect on redelivery", before === 1 && after === 1);
  check("duplicate receipts linked", dups === 1);

  // ---- Negative: revoked device ------------------------------------------
  console.log("\nRevocation: revoked device cannot act");
  const core4 = new OperatorCore(POLICY);
  core4.devices.enroll(makeDevice("dev_pixel01", "android_companion", "Pixel"));
  core4.devices.setTrust("dev_pixel01", "revoked");
  const j4 = core4.createJob("revocation test", ["dev_pixel01"]);
  core4.proposeActions(j4.job_id, [
    { device_id: "dev_pixel01", capability: "android.ui.click", args: { selector: { text: "Send" } } },
  ]);
  const az4 = core4.authorize(j4.job_id);
  check("revoked device blocked at authorize", az4.denied.length === 1);

  // ---- Negative: approval substitution -----------------------------------
  console.log("\nApproval binding: approval for action A cannot authorize action B");
  const core5 = new OperatorCore(POLICY);
  core5.devices.enroll(makeDevice("dev_pixel01", "android_companion", "Pixel"));
  const j5 = core5.createJob("substitution test", ["dev_pixel01"]);
  const envs = core5.proposeActions(j5.job_id, [
    { device_id: "dev_pixel01", capability: "message.send", args: { to: "Esai", text: "hello" } },
    { device_id: "dev_pixel01", capability: "message.send", args: { to: "Stranger", text: "hello" } },
  ]);
  core5.authorize(j5.job_id);
  core5.approve(envs[0].action_id, "thomas"); // approve ONLY the first
  const rcpts = core5.execute(j5.job_id);
  check(
    "second action denied without its own approval",
    rcpts.some((r) => r.outcome === "denied" && r.reason_code.startsWith("approval:"))
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
