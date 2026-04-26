export const BRAND = "github.com/AgentOpsSec";
export const VERSION = "1.0.0";
export const TOOL = {
  name: "Agent Sandbox",
  by: BRAND,
  repository: "github.com/AgentOpsSec/agent-sandbox"
};
export const STATE_DIR = ".agent-sandbox";
export const POLICY_FILE = ".agent-sandbox/policy.json";
export const RUNS_DIR = ".agent-sandbox/runs";
export const LATEST_FILE = ".agent-sandbox/latest";

export function brandedTitle(label = "") {
  return ["Agent Sandbox", label, `by ${BRAND}`].filter(Boolean).join(" ");
}

export const DEFAULT_POLICY = {
  filesystem: {
    mode: "project-only",
    blockedPaths: [".env", ".env.local", "~/.ssh", "~/.aws", "~/.config"]
  },
  network: { enabled: true },
  env: {
    home: "sandbox",
    allowedKeys: [
      "PATH",
      "SHELL",
      "TERM",
      "LANG",
      "LC_ALL",
      "USER",
      "LOGNAME",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY"
    ]
  },
  shell: {
    allowedCommands: [],
    blockedCommands: ["rm -rf", "curl", "scp", "ssh"]
  }
};
