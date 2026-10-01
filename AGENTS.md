# AGENTS.md

Guidance for automated agents and contributors working in this repository. It
describes the architecture, layout, invariants that must hold, and the exact commands
to verify changes.

## What this is

A standalone Slack CLI (`slack`), real-time event router daemon (`slack daemon`), and
stdio Model Context Protocol (MCP) server (`slack mcp`) for AI fleets operating under
[Paseo](https://getpaseo.com), Claude Code, or Antigravity. It enables AI agents to
interact with Slack workspaces using real user sessions or OAuth tokens, with zero-cost
deterministic filtering and dual-route event dispatching.

## Layout

| Path                     | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `bin/slack.js`           | Executable CLI entry point.                                                             |
| `src/config.js`          | Configuration loader and writer (`~/.config/slack-router/config.json` and env vars).    |
| `src/daemon-state.js`    | Daemon process lifecycle, PID tracking, and health state persistence.                   |
| `src/dispatcher.js`      | Dispatches events to Paseo agents via `paseo send` CLI invocations.                     |
| `src/index.js`           | Package root export surface.                                                            |
| `src/mcp.js`             | Model Context Protocol (MCP) stdio server exposing Slack tools to AI agents.            |
| `src/slack-client.js`    | Slack Web API client supporting 200+ endpoints via native `fetch`.                      |
| `src/socket-listener.js` | Real-time WebSocket connection (Socket Mode / user session) and smart polling fallback. |
| `src/subscriptions.js`   | Fleet subscription registry matching inbound messages to agents.                        |
| `test/`                  | Automated test suite run via `node --test test/`.                                       |
| `docs/`                  | Comprehensive references for CLI commands, daemon service, and Slack Web API methods.   |
| `skills/slack-cli/`      | Agent skill definition for autonomous agents interacting with Slack.                    |

## Commands

Run from the repository root:

```bash
npm test    # node --test test/; must pass and never touch the live network
```

## Conventions

- **Pure Modern Node.js ESM.** Zero external runtime dependencies. Uses native Node.js APIs (`fetch`, `WebSocket`, `node:fs`, `node:os`, `node:test`).
- **Conventional Commits.** Subject lowercased, ≤ 100 chars (e.g. `feat: ...`, `fix: ...`, `refactor: ...`).
- **Self-documenting code.** The codebase is clean and comment-free; code should be self-explanatory through clear naming and structure.
- **English everywhere** in code, documentation, and commit messages.
- Prefer small, surgical changes; avoid reformatting files not directly involved in the task.

## Invariants — Do Not Break

- **Zero runtime dependencies.** Do not introduce external dependencies into `dependencies`.
- **Tokens and cookies stay local.** Credentials live only in environment variables or `~/.config/slack-router/config.json`. They must never be logged, committed, or exposed.
- **Tests never hit the network.** Live network requests must not be made in test suites; mock at the `fetch` or `WebSocket` boundary.
- **Deterministic Layer 1 filter.** The daemon must drop general channel chatter and forward only explicit DMs, mentions, and subscribed threads to avoid notification storms.
- **No personal data.** Never commit real usernames, personal paths, company workspace URLs, tokens, or private conversation IDs.
