import fs from "node:fs";
import path from "node:path";
import { LATEST_FILE, RUNS_DIR } from "./constants.js";
import { ensureDir, fileExists, readJson, writeJson } from "./utils.js";

export function paths(cwd = process.cwd()) {
  return {
    runsDir: path.join(cwd, RUNS_DIR),
    latestFile: path.join(cwd, LATEST_FILE)
  };
}

export async function nextRunId(cwd = process.cwd()) {
  const { runsDir } = paths(cwd);
  await ensureDir(runsDir);
  const files = await fs.promises.readdir(runsDir).catch(() => []);
  const max = files.map((file) => /^run_(\d+)\.json$/.exec(file)?.[1]).filter(Boolean).map(Number).reduce((a, b) => Math.max(a, b), 0);
  return `run_${String(max + 1).padStart(3, "0")}`;
}

export async function saveRun(run, cwd = process.cwd()) {
  const { runsDir, latestFile } = paths(cwd);
  await ensureDir(runsDir);
  await writeJson(path.join(runsDir, `${run.runId}.json`), run);
  await fs.promises.writeFile(latestFile, run.runId, "utf8");
}

export async function loadRun(id = "latest", cwd = process.cwd()) {
  const { runsDir, latestFile } = paths(cwd);
  let runId = id;
  if (id === "latest") {
    if (!(await fileExists(latestFile))) throw new Error("No latest sandbox run found.");
    runId = (await fs.promises.readFile(latestFile, "utf8")).trim();
  }
  return readJson(path.join(runsDir, `${runId}.json`));
}
