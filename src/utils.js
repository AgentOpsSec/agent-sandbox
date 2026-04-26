import fs from "node:fs";
import path from "node:path";

export async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try { return (await fs.promises.stat(filePath)).isFile(); } catch { return false; }
}

export async function readJson(filePath, fallback = undefined) {
  if (!(await fileExists(filePath))) {
    if (fallback !== undefined) return fallback;
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function stringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function safeRelativePath(relativePath) {
  const value = String(relativePath || "");
  if (!value || path.isAbsolute(value)) {
    throw new Error(`Unsafe sandbox path: ${value || "(empty)"}`);
  }
  const normalized = path.normalize(value);
  if (normalized === "." || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`Unsafe sandbox path: ${value}`);
  }
  return normalized;
}

export function safeJoin(root, relativePath) {
  const normalized = safeRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  const back = path.relative(resolvedRoot, target);
  if (back === "" || back.startsWith("..") || path.isAbsolute(back)) {
    throw new Error(`Path escapes sandbox root: ${relativePath}`);
  }
  return target;
}

export function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    if (["--read-only", "--no-network", "--json", "--force", "--help", "-h"].includes(arg)) {
      const key = arg.replace(/^--?/, "");
      flags[key === "h" ? "help" : key] = true;
      continue;
    }
    const [key, inline] = arg.replace(/^--/, "").split("=", 2);
    const value = inline ?? args[i + 1];
    if (inline === undefined) {
      if (value === undefined || String(value).startsWith("-")) throw new Error(`--${key} requires a value.`);
      i += 1;
    }
    flags[key] = value;
  }
  return { flags, positional };
}

export async function walkFiles(root, ignore = defaultIgnore) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full);
      if (ignore(relative)) continue;
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await walk(root);
  return files.sort();
}

export function defaultIgnore(relative) {
  return /(^|\/)(\.git|node_modules|\.agent-sandbox|\.agent-flight|\.agent-cost|\.agentopssec|\.mcp-firewall|\.home|\.tmp)(\/|$)/.test(relative);
}
