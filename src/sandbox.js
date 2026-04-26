import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { LATEST_FILE, RUNS_DIR, TOOL } from "./constants.js";
import { commandAllowed, loadPolicy } from "./policy.js";
import { nextRunId, saveRun } from "./store.js";
import { ensureDir, safeJoin, walkFiles } from "./utils.js";

export async function runSandbox(commandParts, { cwd = process.cwd(), readOnly = false, noNetwork = false } = {}, io = {}) {
  if (commandParts.length === 0) throw new Error("run requires a command after --.");
  if (noNetwork) assertNoNetworkSupported();
  const policy = await loadPolicy(cwd);
  const commandLine = commandParts.join(" ");
  if (!commandAllowed(policy, commandLine)) {
    throw new Error(`Command blocked by sandbox policy: ${commandLine}`);
  }
  const runId = await nextRunId(cwd);
  const sandboxPath = path.join(os.tmpdir(), "agent-sandbox", `${safeName(path.basename(cwd))}-${runId}-${crypto.randomUUID().slice(0, 8)}`);
  await fs.promises.rm(sandboxPath, { recursive: true, force: true });
  await ensureDir(sandboxPath);
  await copyProject(cwd, sandboxPath, policy);
  const childEnv = await sandboxEnv(policy, sandboxPath);
  if (readOnly) await makeTreeReadOnly(sandboxPath);
  const before = await snapshot(sandboxPath);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const { exitCode } = await spawnCommand(commandParts[0], commandParts.slice(1), sandboxPath, io, { noNetwork, env: childEnv });
  const endedAt = new Date().toISOString();
  const after = await snapshot(sandboxPath);
  const changes = diffSnapshots(before, after);
  const readOnlyViolation = readOnly && hasChanges(changes);
  const finalExitCode = readOnlyViolation && exitCode === 0 ? 1 : exitCode;
  const run = {
    schemaVersion: "1.0",
    tool: TOOL,
    runId,
    startedAt,
    endedAt,
    durationMs: Date.now() - started,
    originalProjectPath: cwd,
    sandboxPath,
    command: commandParts,
    readOnly,
    noNetwork,
    envHome: childEnv.HOME,
    readOnlyViolation,
    exitCode: finalExitCode,
    result: readOnlyViolation ? "blocked" : finalExitCode === 0 ? "completed" : "failed",
    changes,
    applied: false
  };
  await saveRun(run, cwd);
  return run;
}

export async function applyRun(run, cwd = process.cwd()) {
  if (run.readOnly) throw new Error("Run was read-only; refusing to apply changes.");
  await assertSafeSandboxRoot(run.sandboxPath);
  for (const file of [...run.changes.modified, ...run.changes.created]) {
    const source = safeJoin(run.sandboxPath, file);
    const target = safeJoin(cwd, file);
    await assertRegularSource(source);
    await ensureDir(path.dirname(target));
    await assertParentInside(cwd, path.dirname(target));
    await assertNotSymlink(target);
    await fs.promises.copyFile(source, target);
  }
  for (const file of run.changes.deleted) {
    const target = safeJoin(cwd, file);
    await assertParentInside(cwd, path.dirname(target));
    await fs.promises.rm(target, { force: true });
  }
  run.applied = true;
  run.appliedAt = new Date().toISOString();
  await saveRun(run, cwd);
  return run;
}

export async function cleanRuns(cwd = process.cwd()) {
  const runsDir = path.join(cwd, RUNS_DIR);
  const files = await fs.promises.readdir(runsDir).catch(() => []);
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    const run = await fs.promises.readFile(path.join(runsDir, file), "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (run?.sandboxPath && isSandboxPathUnderRoot(run.sandboxPath)) {
      await fs.promises.rm(run.sandboxPath, { recursive: true, force: true }).catch(() => {});
    }
  }
  await fs.promises.rm(path.join(cwd, RUNS_DIR), { recursive: true, force: true });
  await fs.promises.rm(path.join(cwd, LATEST_FILE), { force: true }).catch(() => {});
}

async function copyProject(source, target, policy) {
  const blocked = policy.filesystem.blockedPaths || [];
  await fs.promises.cp(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const relative = path.relative(source, sourcePath);
      if (!relative) return true;
      if (/(^|\/)(\.git|node_modules|\.agent-sandbox|\.agent-flight|\.agent-cost|\.agentopssec|\.mcp-firewall)(\/|$)/.test(relative)) return false;
      return !blocked.some((pattern) => relative === pattern || relative.startsWith(`${pattern}/`) || relative.endsWith(pattern));
    }
  });
}

async function snapshot(root) {
  const files = await walkFiles(root);
  const map = {};
  for (const file of files) {
    const buffer = await fs.promises.readFile(path.join(root, file));
    map[file] = buffer.toString("base64");
  }
  return map;
}

function diffSnapshots(before, after) {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  return {
    created: [...afterKeys].filter((file) => !beforeKeys.has(file)),
    modified: [...afterKeys].filter((file) => beforeKeys.has(file) && before[file] !== after[file]),
    deleted: [...beforeKeys].filter((file) => !afterKeys.has(file))
  };
}

function spawnCommand(command, args, cwd, io, { noNetwork = false, env = process.env } = {}) {
  return new Promise((resolve) => {
    const parts = noNetwork ? noNetworkCommand(command, args) : [command, ...args];
    const child = spawn(parts[0], parts.slice(1), { cwd, env, stdio: ["inherit", "pipe", "pipe"] });
    child.stdout?.on("data", (chunk) => io.stdout?.(chunk.toString()));
    child.stderr?.on("data", (chunk) => io.stderr?.(chunk.toString()));
    child.on("error", () => resolve({ exitCode: 1 }));
    child.on("close", (code) => resolve({ exitCode: code || 0 }));
  });
}

async function sandboxEnv(policy, sandboxPath) {
  const envPolicy = policy.env || {};
  const allowed = new Set(envPolicy.allowedKeys || []);
  const env = {};
  for (const key of allowed) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.PATH = env.PATH || process.env.PATH || "";
  env.HOME = envPolicy.home === "host" ? process.env.HOME || sandboxPath : path.join(sandboxPath, ".home");
  env.TMPDIR = path.join(sandboxPath, ".tmp");
  await ensureDir(env.HOME);
  await ensureDir(env.TMPDIR);
  return env;
}

function noNetworkCommand(command, args) {
  return [
    "sandbox-exec",
    "-p",
    "(version 1)\n(allow default)\n(deny network*)",
    command,
    ...args
  ];
}

function assertNoNetworkSupported() {
  if (process.platform !== "darwin") {
    throw new Error("--no-network requires macOS sandbox-exec. This platform cannot enforce it.");
  }
  const probe = spawnSync("sandbox-exec", ["-h"], { stdio: "ignore" });
  if (probe.error?.code === "ENOENT") {
    throw new Error("--no-network requires sandbox-exec, but sandbox-exec was not found.");
  }
}

async function makeTreeReadOnly(root) {
  const files = await walkFiles(root, () => false);
  for (const file of files) {
    await fs.promises.chmod(path.join(root, file), 0o444).catch(() => {});
  }
  await chmodDirs(root, 0o555);
}

function safeName(value) {
  return String(value || "project").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "project";
}

function hasChanges(changes) {
  return ["created", "modified", "deleted"].some((key) => (changes[key] || []).length > 0);
}

async function assertSafeSandboxRoot(sandboxPath) {
  const target = path.resolve(String(sandboxPath || ""));
  if (!isSandboxPathUnderRoot(target)) {
    throw new Error("Refusing to apply a run with an unsafe sandbox path.");
  }
  const stat = await fs.promises.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Refusing to apply a run whose sandbox path is not a real directory.");
  }
}

function isSandboxPathUnderRoot(sandboxPath) {
  const root = path.resolve(os.tmpdir(), "agent-sandbox");
  const target = path.resolve(String(sandboxPath || ""));
  const relative = path.relative(root, target);
  return Boolean(sandboxPath) && relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function assertRegularSource(source) {
  const stat = await fs.promises.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Refusing to apply non-regular sandbox file: ${source}`);
  }
}

async function assertParentInside(root, parent) {
  const rootReal = await fs.promises.realpath(root);
  const parentReal = await fs.promises.realpath(parent);
  const relative = path.relative(rootReal, parentReal);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside project: ${parent}`);
  }
}

async function assertNotSymlink(target) {
  const stat = await fs.promises.lstat(target).catch(() => null);
  if (stat?.isSymbolicLink()) {
    throw new Error(`Refusing to overwrite symlink: ${target}`);
  }
}

async function chmodDirs(dir, mode) {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await chmodDirs(path.join(dir, entry.name), mode);
  }
  await fs.promises.chmod(dir, mode).catch(() => {});
}
