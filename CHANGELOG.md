# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-02

### Added

- Support for the **Paseo Fleet Protocol v1** (`paseo-fleet/v1`) event envelope.
- Multi-workspace disambiguation with `instance` (`teamId`), `scope` (`channelId`), and fully qualified `urn:slack:<team>:<channel>:<ts>`.
- Deterministic `reply_action` mapping directly to `slack_send_message` with channel and thread timestamps.

## [1.0.0] - 2026-10-01

### Added

- Unified Slack CLI (`slack`) with subcommands: `send`, `history`, `thread`, `search`, `react`, `whoami`, `subscribe`, `unsubscribe`, `subscriptions`, `daemon`, `mcp`, `api`, `config`.
- Real-time inbound event router daemon (`slack daemon`) with WebSocket (Socket Mode) support and smart direct polling fallback.
- Fleet Coordinator and agent subscriptions with zero-cost Layer 1 deterministic message filtering.
- Standard stdio Model Context Protocol (MCP) server (`slack mcp`) for AI agents in Paseo, Claude Code, and Antigravity.
- Zero runtime external dependencies: pure Node.js 20+ ESM using native `fetch` and `WebSocket`.
- Comprehensive documentation and AI agent skill (`skills/slack-cli/`).
