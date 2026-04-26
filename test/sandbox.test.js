import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { applyRun } from "../src/sandbox.js";
import { commandAllowed } from "../src/policy.js";

test("commandAllowed enforces a token boundary after an allowed prefix", () => {
  const policy = { shell: { allowedCommands: ["npm test"], blockedCommands: [] } };
  assert.equal(commandAllowed(policy, "npm test"), true);
  assert.equal(commandAllowed(policy, "npm test src/"), true);
  assert.equal(commandAllowed(policy, "npm test\tsrc/"), true);
  // Prefix bypasses must be rejected.
  assert.equal(commandAllowed(policy, "npm test;rm -rf /"), false);
  assert.equal(commandAllowed(policy, "npm test--evil"), false);
  assert.equal(commandAllowed(policy, "npm tested"), false);
  // Blocked patterns still win.
  const blockingPolicy = { shell: { allowedCommands: ["npm"], blockedCommands: ["rm -rf"] } };
  assert.equal(commandAllowed(blockingPolicy, "npm test rm -rf"), false);
});

function io() {
  let output = "";
  let exitCode = 0;
  return {
    api: {
      stdout: (text) => { output += text; },
      stderr: (text) => { output += text; },
      setExitCode: (code) => { exitCode = code; }
    },
    get output() { return output; },
    get exitCode() { return exitCode; }
  };
}

test("runs in sandbox, shows diff, and applies changes", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-"));
  await fs.promises.writeFile(path.join(cwd, "file.txt"), "before\n", "utf8");
  let session = io();
  await main(["run", "--cwd", cwd, "--", process.execPath, "-e", "require('fs').writeFileSync('file.txt','after\\n')"], session.api);
  assert.match(session.output, /Agent Sandbox Run by github\.com\/AgentOpsSec/);
  assert.equal(await fs.promises.readFile(path.join(cwd, "file.txt"), "utf8"), "before\n");

  session = io();
  await main(["diff", "latest", "--cwd", cwd], session.api);
  assert.match(session.output, /modified/);

  session = io();
  await main(["apply", "latest", "--cwd", cwd], session.api);
  assert.match(session.output, /Agent Sandbox Apply by github\.com\/AgentOpsSec/);
  assert.equal(await fs.promises.readFile(path.join(cwd, "file.txt"), "utf8"), "after\n");
});

test("init and allow-env configure the sandbox policy", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-init-"));
  let session = io();
  await main(["init", "--cwd", cwd], session.api);
  assert.match(session.output, /Agent Sandbox Init by github\.com\/AgentOpsSec/);

  session = io();
  await main(["allow-env", "EXAMPLE_TOKEN", "--cwd", cwd], session.api);
  assert.match(session.output, /Allowed env: EXAMPLE_TOKEN/);
  const policy = JSON.parse(await fs.promises.readFile(path.join(cwd, ".agent-sandbox", "policy.json"), "utf8"));
  assert.ok(policy.env.allowedKeys.includes("EXAMPLE_TOKEN"));
});

test("run uses an isolated HOME by default", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-home-"));
  const session = io();
  await main(["run", "--cwd", cwd, "--", process.execPath, "-e", "console.log(process.env.HOME)"], session.api);
  assert.match(session.output, /\.home/);
});

test("read-only mode prevents sandbox writes and apply", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-readonly-"));
  await fs.promises.writeFile(path.join(cwd, "file.txt"), "before\n", "utf8");
  let session = io();
  await main(["run", "--read-only", "--cwd", cwd, "--", process.execPath, "-e", "require('fs').writeFileSync('file.txt','after\\n')"], session.api);
  assert.match(session.output, /read-only run; apply is disabled/);
  assert.notEqual(session.exitCode, 0);

  session = io();
  await assert.rejects(() => main(["apply", "latest", "--cwd", cwd], session.api), /read-only/);
  assert.equal(await fs.promises.readFile(path.join(cwd, "file.txt"), "utf8"), "before\n");
});

test("apply rejects unsafe changed file paths", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-safe-"));
  await fs.promises.mkdir(path.join(os.tmpdir(), "agent-sandbox"), { recursive: true });
  const sandboxPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox", "safe-run-"));
  await fs.promises.writeFile(path.join(sandboxPath, "file.txt"), "safe\n", "utf8");
  await assert.rejects(() => applyRun({
    runId: "run_001",
    sandboxPath,
    readOnly: false,
    changes: {
      created: ["../outside.txt"],
      modified: [],
      deleted: []
    }
  }, cwd), /Unsafe sandbox path|Path escapes/);
});

test("clean removes recorded temporary sandbox directories", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "agent-sandbox-clean-"));
  let session = io();
  await main(["run", "--cwd", cwd, "--", process.execPath, "-e", "console.log('ok')"], session.api);
  const latest = await fs.promises.readFile(path.join(cwd, ".agent-sandbox", "latest"), "utf8");
  const run = JSON.parse(await fs.promises.readFile(path.join(cwd, ".agent-sandbox", "runs", `${latest}.json`), "utf8"));
  assert.equal(await fs.promises.stat(run.sandboxPath).then((stat) => stat.isDirectory()), true);

  session = io();
  await main(["clean", "--cwd", cwd], session.api);
  assert.match(session.output, /Removed sandbox runs/);
  await assert.rejects(() => fs.promises.stat(run.sandboxPath));
});
