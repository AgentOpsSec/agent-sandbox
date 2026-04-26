import { brandedTitle } from "./constants.js";
import { amber, dim, green, red, risk as paintRisk } from "./tui.js";

export function renderRun(run) {
  return [
    brandedTitle("Run"),
    "",
    `Agent: ${run.command[0]}`,
    `Sandbox: ${run.sandboxPath}`,
    `Result: ${paintRisk(run.result, run.result)}`,
    "",
    "Changes:",
    `- ${green(`${run.changes.created.length} files created`)}`,
    `- ${amber(`${run.changes.modified.length} files modified`)}`,
    `- ${red(`${run.changes.deleted.length} files deleted`)}`,
    run.readOnlyViolation ? red("- read-only violation detected") : "",
    "",
    "Next:",
    "agent-sandbox diff latest",
    run.readOnly ? dim("read-only run; apply is disabled") : "agent-sandbox apply latest"
  ].join("\n") + "\n";
}

export function renderDiff(run) {
  const lines = [brandedTitle("Diff"), "", `Run: ${run.runId}`];
  const colors = { created: green, modified: amber, deleted: red };
  for (const type of ["created", "modified", "deleted"]) {
    lines.push("", `${colors[type](type)}:`);
    const files = run.changes[type];
    if (files.length === 0) lines.push(dim("- none"));
    else for (const file of files) lines.push(`- ${file}`);
  }
  return `${lines.join("\n")}\n`;
}
