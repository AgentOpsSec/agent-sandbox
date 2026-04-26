import path from "node:path";
import { DEFAULT_POLICY, POLICY_FILE } from "./constants.js";
import { fileExists, readJson, writeJson } from "./utils.js";

export async function initPolicy({ cwd = process.cwd(), force = false } = {}) {
  const policyPath = path.join(cwd, POLICY_FILE);
  if (!force && await fileExists(policyPath)) return { policyPath, created: false };
  await writeJson(policyPath, DEFAULT_POLICY);
  return { policyPath, created: true };
}

export async function loadPolicy(cwd = process.cwd()) {
  return readJson(path.join(cwd, POLICY_FILE), DEFAULT_POLICY);
}

export async function savePolicy(policy, cwd = process.cwd()) {
  await writeJson(path.join(cwd, POLICY_FILE), policy);
}

export async function allowCommand(command, cwd = process.cwd()) {
  const policy = await loadPolicy(cwd);
  policy.shell.allowedCommands = [...new Set([...(policy.shell.allowedCommands || []), command])];
  await savePolicy(policy, cwd);
  return policy;
}

export async function blockPath(pattern, cwd = process.cwd()) {
  const policy = await loadPolicy(cwd);
  policy.filesystem.blockedPaths = [...new Set([...(policy.filesystem.blockedPaths || []), pattern])];
  await savePolicy(policy, cwd);
  return policy;
}

export async function allowEnv(key, cwd = process.cwd()) {
  const policy = await loadPolicy(cwd);
  policy.env = policy.env || { home: "sandbox", allowedKeys: [] };
  policy.env.allowedKeys = [...new Set([...(policy.env.allowedKeys || []), key])];
  await savePolicy(policy, cwd);
  return policy;
}

export function commandAllowed(policy, commandLine) {
  if ((policy.shell.blockedCommands || []).some((blocked) => commandLine.includes(blocked))) return false;
  const allowed = policy.shell.allowedCommands || [];
  if (allowed.length === 0) return true;
  return allowed.some((allowedCommand) => {
    if (commandLine === allowedCommand) return true;
    // Require a whitespace boundary after the allowed prefix so "npm test"
    // does not also match "npm test --evil-flag" or "npm test;rm".
    if (!commandLine.startsWith(allowedCommand)) return false;
    const next = commandLine.charAt(allowedCommand.length);
    return next === " " || next === "\t";
  });
}
