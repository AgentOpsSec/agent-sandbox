import path from "node:path";
import { brandedTitle, TOOL, VERSION } from "./constants.js";
import { allowCommand, allowEnv, blockPath, initPolicy } from "./policy.js";
import { renderDiff, renderRun } from "./report.js";
import { applyRun, cleanRuns, runSandbox } from "./sandbox.js";
import { loadRun } from "./store.js";
import { amber, green, paint, setColor, shouldColor } from "./tui.js";
import { updateOne } from "./updater.js";
import { parseArgs, stringify } from "./utils.js";

const PACKAGE_NAME = "@agentopssec/agent-sandbox";

async function runUpdate(args, io) {
  const flagSet = new Set(args);
  await updateOne({
    packageName: PACKAGE_NAME,
    currentVersion: VERSION,
    title: brandedTitle("Update"),
    color: { amber, green },
    io,
    yes: flagSet.has("--yes") || flagSet.has("-y")
  });
}

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const command = argv[0] || "help";
  const args = argv.slice(1);
  if (["help", "--help", "-h"].includes(command)) return io.stdout(help());
  if (["version", "--version", "-v"].includes(command)) return io.stdout(`agent-sandbox ${VERSION}\n`);
  if (command === "init") return runInit(args, io);
  if (command === "run") return runRun(args, io);
  if (command === "diff") return runDiff(args, io);
  if (command === "apply") return runApply(args, io);
  if (command === "clean") return runClean(args, io);
  if (command === "allow-command") return runAllowCommand(args, io);
  if (command === "allow-env") return runAllowEnv(args, io);
  if (command === "block-path") return runBlockPath(args, io);
  if (command === "update" || command === "--update") return runUpdate(args, io);
  throw new Error(`Unknown command "${command}".`);
}

async function runInit(args, io) {
  const { flags } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const result = await initPolicy({ cwd, force: Boolean(flags.force) });
  io.stdout(flags.json ? stringify({ tool: TOOL, ...result }) : `${brandedTitle("Init")}\n\n${result.created ? "Created" : "Already exists"}: ${result.policyPath}\n`);
}

async function runRun(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const run = await runSandbox(positional, { cwd, readOnly: Boolean(flags["read-only"]), noNetwork: Boolean(flags["no-network"]) }, io);
  io.stdout(flags.json ? stringify(run) : renderRun(run));
  io.setExitCode(run.exitCode);
}

async function runDiff(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const run = await loadRun(positional[0] || "latest", cwd);
  io.stdout(flags.json ? stringify({ tool: TOOL, run }) : renderDiff(run));
}

async function runApply(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const run = await applyRun(await loadRun(positional[0] || "latest", cwd), cwd);
  io.stdout(flags.json ? stringify(run) : `${brandedTitle("Apply")}\n\nApplied ${run.runId}\n`);
}

async function runClean(args, io) {
  const { flags } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  await cleanRuns(cwd);
  io.stdout(`${brandedTitle("Clean")}\n\nRemoved sandbox runs.\n`);
}

async function runAllowCommand(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const command = positional.join(" ");
  if (!command) throw new Error("allow-command requires a command.");
  const policy = await allowCommand(command, cwd);
  io.stdout(flags.json ? stringify({ tool: TOOL, policy }) : `${brandedTitle("Policy")}\n\nAllowed command: ${command}\n`);
}

async function runAllowEnv(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  if (!positional[0]) throw new Error("allow-env requires an environment variable name.");
  const key = positional[0];
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) throw new Error("allow-env requires a valid environment variable name.");
  const policy = await allowEnv(key, cwd);
  io.stdout(flags.json ? stringify({ tool: TOOL, policy }) : `${brandedTitle("Policy")}\n\nAllowed env: ${key}\n`);
}

async function runBlockPath(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  if (!positional[0]) throw new Error("block-path requires a path.");
  const policy = await blockPath(positional[0], cwd);
  io.stdout(flags.json ? stringify({ tool: TOOL, policy }) : `${brandedTitle("Policy")}\n\nBlocked path: ${positional[0]}\n`);
}

function help() {
  return [
    brandedTitle(),
    "",
    "Usage:",
    "  agent-sandbox init",
    "  agent-sandbox run -- codex \"fix tests\"",
    "  agent-sandbox run --read-only -- gemini \"review this repo\"",
    "  agent-sandbox run --no-network -- codex \"fix tests\"",
    "  agent-sandbox allow-command \"npm test\"",
    "  agent-sandbox allow-env OPENAI_API_KEY",
    "  agent-sandbox block-path .env",
    "  agent-sandbox diff latest",
    "  agent-sandbox apply latest",
    "  agent-sandbox clean",
    "  agent-sandbox update [--yes]"
  ].join("\n") + "\n";
}

function defaultIo() {
  setColor(shouldColor(process.stdout));
  return {
    stdout: (text) => process.stdout.write(paint(text)),
    stderr: (text) => process.stderr.write(paint(text)),
    setExitCode: (code) => { process.exitCode = code; }
  };
}
