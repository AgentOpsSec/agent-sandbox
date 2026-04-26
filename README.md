# Agent Sandbox

**Run AI coding agents in a restricted local sandbox.**

Agent Sandbox wraps AI coding agent commands in a temporary local
workspace. It lets an agent work away from the real repository, captures the
final diff, and gives the developer control over what changes are applied back.

Think of it as:

```txt
Local sandboxing for AI coding agents
```

## Why This Exists

AI coding agents often run directly on a developer's machine, where they may be
able to read home directories, secrets, SSH keys, cloud credentials, unrelated
projects, and local configuration.

Developers need a safer workflow:

- Let the agent work in a temporary copy of the repo.
- Keep the real working tree untouched during the run.
- Block obvious secret and credential paths.
- Limit commands to approved project operations.
- Review the final diff before applying it.
- Clean up sandbox state after the run.

Agent Sandbox makes local agent work easier to contain.

## Install

```bash
npm install -g @agentopssec/agent-sandbox
```

Or run it without installing:

```bash
npx -y @agentopssec/agent-sandbox init
```

## Update

```bash
agent-sandbox update          # check the registry, prompt before installing
agent-sandbox update --yes    # update without prompting
```

## Primary Workflow

Agent Sandbox starts by running an agent inside a temporary workspace:

```bash
agent-sandbox run -- codex "fix the failing tests"
```

Allowed-command policy enforces a token boundary, so an entry like
`npm test` allows `npm test` and `npm test src/` but not
`npm test --evil` or `npm test;rm -rf /`.

The workflow should do three things well:

1. Copy the project into a temporary sandbox.
2. Run the agent inside that sandbox.
3. Show and apply the final diff only when approved.

## CLI

```bash
agent-sandbox run -- codex "fix the failing tests"
agent-sandbox run --read-only -- gemini "review this repo"
agent-sandbox run --no-network -- aider
agent-sandbox allow-command "npm test"
agent-sandbox allow-env OPENAI_API_KEY
agent-sandbox block-path ".env"
agent-sandbox diff latest
agent-sandbox apply latest
agent-sandbox clean
agent-sandbox update [--yes]
```

## Standalone and Stack Use

Agent Sandbox runs on its own by copying the current project to a temporary
workspace and applying only approved changes:

```bash
agent-sandbox run -- codex "fix the failing tests"
agent-sandbox diff latest
agent-sandbox apply latest
```

When used with the full AgentOpsSec stack, its run records can feed Agent Review
and Agent Cost Lens without either tool importing Agent Sandbox code:

```bash
agent-review --from-agent-sandbox latest
agent-cost month
```

## What Agent Sandbox Controls

Agent Sandbox focuses on local isolation and review:

- Temporary repo copies
- Project-copy filesystem workflow
- Isolated `HOME` and temporary directories by default
- Read-only mode enforced with non-writable sandbox files and post-run change checks
- Secret path blocking
- Command allowlists
- Destructive command blocking
- Optional network restrictions
- Final diff capture
- Manual apply workflow
- Sandbox cleanup
- Run metadata

`--no-network` is enforced with macOS `sandbox-exec`. If the platform cannot
enforce it, Agent Sandbox fails instead of silently running without isolation.
`--read-only` disables `apply` and treats any sandbox file change as a failed
run. Files are copied to a temporary workspace; full OS-level filesystem
isolation depends on platform support, so do not use Agent Sandbox as the only
boundary for untrusted code.

## Example Policy

```json
{
  "filesystem": {
    "mode": "project-only",
    "blockedPaths": [
      ".env",
      ".env.local",
      "~/.ssh",
      "~/.aws",
      "~/.config"
    ]
  },
  "network": {
    "enabled": false
  },
  "env": {
    "home": "sandbox",
    "allowedKeys": [
      "PATH",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY"
    ]
  },
  "shell": {
    "allowedCommands": [
      "npm test",
      "npm run build",
      "git diff"
    ],
    "blockedCommands": [
      "rm -rf",
      "curl",
      "scp",
      "ssh"
    ]
  }
}
```

## What Agent Sandbox Records

Agent Sandbox records local run metadata:

- Agent command
- Original project path
- Sandbox path
- Files created
- Files modified
- Files deleted
- Commands executed when available
- Final diff
- Blocked actions
- Applied changes

## Example Run Summary

```txt
Agent Sandbox Run by github.com/AgentOpsSec

Agent:
codex

Sandbox:
/tmp/agent-sandbox/run_001

Result:
Completed

Changes:
- 3 files modified
- 44 insertions
- 18 deletions

Next:
agent-sandbox diff latest
agent-sandbox apply latest
```

JSON run records include:

```json
{
  "tool": {
    "name": "Agent Sandbox",
    "by": "github.com/AgentOpsSec",
    "repository": "github.com/AgentOpsSec/agent-sandbox"
  },
  "runId": "run_001",
  "result": "completed"
}
```

## Design Principles

- Local-first
- Open-source
- No telemetry by default
- Temporary workspaces
- Review before apply
- Project-scoped access
- Clear command policy
- Easy cleanup

## Initial Release Scope

The initial release includes temporary workspace creation, agent execution,
basic path and command controls, diff review, apply workflow, and run cleanup.

### 1.0: Temporary Workspace

- Detect the current project
- Create a temporary sandbox directory
- Copy project files into the sandbox
- Preserve enough repository metadata for diffs
- Run an agent command inside the sandbox
- Record the sandbox path and run metadata

### 1.0: Basic Controls

- Support read-only mode
- Support blocked path patterns
- Block common secret paths such as `.env` and `~/.ssh`
- Support command allowlists
- Warn on destructive command patterns
- Support no-network mode where local enforcement allows

### 1.0: Diff and Apply

- Capture the final sandbox diff
- Show the latest run diff
- Apply approved changes back to the original project
- Record which changes were applied
- Clean old sandbox runs
- Integrate with local run recording


## Output

Reports use plain-language status words rather than raw exit codes:

- `ok` — the step ran successfully (green).
- `failed (exit N)` — the step exited non-zero (red); the original code is preserved.
- `skipped (reason)` — the step was not applicable (dim).

Severity colors follow the AgentOpsSec palette (safe = green, warning = amber, risk = red). The palette honors `NO_COLOR` and `FORCE_COLOR`, and JSON / CSV output stays plain.


- Repo: https://github.com/AgentOpsSec/agent-sandbox
- npm: https://www.npmjs.com/package/@agentopssec/agent-sandbox
- AgentOpsSec stack: https://github.com/AgentOpsSec/stack
- Website: https://AgentOpsSec.com

## Author

Created and developed by **Aunt Gladys Nephew**.

- Website: https://auntgladysnephew.com
- GitHub: https://github.com/auntgladysnephew
- X: https://x.com/AGNonX
