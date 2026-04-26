// Self-update helpers shared across AgentOpsSec tools.
//
// fetchLatestVersion(packageName) -> string|null
//   Queries the public npm registry without dependencies. Returns null on
//   any failure (network, 404, parse) so callers can degrade gracefully.
//
// compareVersions(a, b) -> -1 | 0 | 1
//   Lightweight semver-ish comparison. Numeric segments are compared
//   numerically; pre-release tags are treated as lower than the base.
//
// runInstall(packageName, packageManager) -> { exitCode }
//   Spawns the configured package manager's global install command.
//
// askConfirm() lives in utils.js per tool. Updater stays UI-free.

import https from "node:https";
import { spawn } from "node:child_process";

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 10_000;

export async function fetchLatestVersion(packageName) {
  return new Promise((resolve) => {
    const url = `${REGISTRY}/${encodeURIComponent(packageName).replace("%40", "@")}/latest`;
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    const request = https.get(url, { headers: { accept: "application/json" } }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        return finish(null);
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) { response.destroy(); finish(null); } });
      response.on("end", () => {
        try {
          const json = JSON.parse(body);
          finish(typeof json.version === "string" ? json.version : null);
        } catch {
          finish(null);
        }
      });
    });
    request.on("error", () => finish(null));
    request.setTimeout(TIMEOUT_MS, () => { request.destroy(); finish(null); });
  });
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.numbers.length, right.numbers.length); i += 1) {
    const ln = left.numbers[i] || 0;
    const rn = right.numbers[i] || 0;
    if (ln > rn) return 1;
    if (ln < rn) return -1;
  }
  if (left.pre && !right.pre) return -1;
  if (!left.pre && right.pre) return 1;
  if (left.pre && right.pre) return left.pre.localeCompare(right.pre);
  return 0;
}

function parseVersion(value) {
  const text = String(value || "").trim().replace(/^v/, "");
  const [base, pre = ""] = text.split("-", 2);
  const numbers = base.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return { numbers, pre };
}

export function isOutdated(current, latest) {
  if (!latest || !current) return false;
  return compareVersions(latest, current) > 0;
}

export function installPartsFor(packageManager, packageName) {
  if (packageManager === "pnpm") return ["pnpm", "add", "-g", packageName];
  if (packageManager === "bun") return ["bun", "add", "-g", packageName];
  if (packageManager === "yarn") return ["yarn", "global", "add", packageName];
  return [packageManager || "npm", "install", "-g", packageName];
}

export function runInstall(packageName, { packageManager = "npm", io = {}, env = process.env, cwd = process.cwd() } = {}) {
  return new Promise((resolve) => {
    const [command, ...args] = installPartsFor(packageManager, packageName);
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", () => resolve({ exitCode: 1 }));
    child.on("close", (code) => resolve({ exitCode: code || 0 }));
  });
}

export function detectPackageManagerFromUserAgent(env = process.env) {
  const ua = env.npm_config_user_agent || "";
  if (ua.startsWith("pnpm/")) return "pnpm";
  if (ua.startsWith("bun/")) return "bun";
  if (ua.startsWith("yarn/")) return "yarn";
  return "npm";
}

// Reusable update-one-package routine for individual tools.
// Resolves true on success or skip; returns false on failure.
export async function updateOne({ packageName, currentVersion, title, brand, paint, color, io = {}, yes = false } = {}) {
  const writer = (text) => io.stdout?.(text);
  const setExit = (code) => io.setExitCode?.(code);
  const env = io.env || process.env;
  writer(`${title}\n\nChecking ${packageName}...\n`);
  const latest = await fetchLatestVersion(packageName);
  if (!latest) {
    writer(`${color.amber("Could not reach the npm registry.")} Try again with a network connection.\n`);
    setExit(1);
    return false;
  }
  if (!isOutdated(currentVersion, latest)) {
    writer(`${color.green(`Already on the latest version (${currentVersion}).`)}\n`);
    return true;
  }
  writer(`Newer version available: ${currentVersion} -> ${color.green(latest)}\n`);
  if (!yes) {
    const ok = await promptConfirm(`Install ${packageName}@${latest} now? [Y/n] `);
    if (!ok) { writer("Update skipped.\n"); return true; }
  }
  const packageManager = detectPackageManagerFromUserAgent(env);
  const result = await runInstall(packageName, { packageManager, io, env });
  if (result.exitCode === 0) {
    writer(`${color.green(`Updated ${packageName} to ${latest}.`)}\n`);
    return true;
  }
  writer(`Update failed (exit ${result.exitCode}).\n`);
  setExit(result.exitCode);
  return false;
}

export async function promptConfirm(prompt, { defaultValue = true } = {}) {
  if (!process.stdin.isTTY) return defaultValue;
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(prompt);
    if (!answer.trim()) return defaultValue;
    return /^(y|yes)$/i.test(answer.trim());
  } finally { rl.close(); }
}
