# Changelog

All notable changes to this project are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [1.0.0] - 2026-04-26

- Initial public release of Agent Sandbox.
- Commands: `init`, `run`, `diff`, `apply`, `clean`, `allow-command`, `allow-env`, `block-path`, `update`.
- Copies the project to a temp workspace, runs the agent there, captures the diff, and applies only approved changes.
- Path safety: `safeJoin`, symlink rejection, parent-inside-cwd assertion, and a token-boundary check in the allowed-command policy so `npm test` does not also allow `npm test;rm -rf /` or `npm test --evil`.
- Optional `--read-only` and `--no-network` (macOS `sandbox-exec`).
- Status words use plain language (`ok`, `failed (exit N)`, `skipped (reason)`); raw exit codes are preserved alongside for debugging.
