# `paseo-slack` (`slack`)

A mini Slack inside Paseo: Unified Slack CLI, Real-Time Inbound Event Router, and Model Context Protocol (MCP) Server designed for AI Agent Fleets running under **Paseo**, **Claude Code**, or **Antigravity**.

Operates directly as your authentic Slack user identity with zero bot badges, supports all 200+ Slack Web API endpoints, and provides deterministic zero-cost event routing to prevent noise while never missing a message.

---

## Architecture Overview

```
                      Slack Real-Time Events (WebSocket / Smart Polling)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      paseo-slack (slack daemon)        │
                      │                                        │
                      │  Layer 1: Deterministic Filter (0 cost)│
                      │  - Discards general channel chatter    │
                      │  - Passes ALL DMs (even new contacts)  │
                      │  - Passes all direct user mentions     │
                      │  - Passes active subscribed threads    │
                      │                                        │
                      │  Subscription Registry (~/.config/...) │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  │ (Specific subscription)                        │ (Unmatched DM / mention)
                  ▼                                                ▼
     `paseo send <worker_agent_id>`                   `paseo send <coordinator_agent_id>`
       [Target Worker Agent Session]                    [Fleet Coordinator Agent]
       (e.g. working on specific MR)                    (Triages, dispatches, or spawns)
```

---

## Key Features

- **Personal Authentication**: Supports official User OAuth Tokens (`xoxp-...`) or Browser Session Tokens (`xoxc-...` + `Cookie: d=...`) to post exactly as the user with zero bot badges.
- **Smart Recipient & Channel Resolution**: Automatically converts `@username` or user IDs (`U...`) into DM channels (`D...`) on the fly.
- **Smart Inbound Filtering**:
  - Drops 99% of company noise (general channel chatter, spam, bot alerts).
  - Guarantees **100% capture of all DMs** (even from colleagues who have never messaged before) and direct mentions.
- **Dual Routing**:
  - **Specific Route**: Worker agents subscribe to specific threads/channels via `slack subscribe`.
  - **Default Route**: All other incoming DMs and mentions route to the **Fleet Coordinator Agent**.
- **Universal Slack API Access**: `slack api <method> [key=value...]` allows calling any of the 200+ Slack Web API endpoints.
- **Built-in MCP Server**: `slack mcp` runs a standard stdio Model Context Protocol server exposing Slack tools directly to AI agents.
- **Zero External Dependencies**: Pure modern Node.js 20+ ESM using native `fetch` and native `WebSocket`.

---

## Documentation Index

- [**Slack Web API Reference**](docs/slack-api-reference.md): Complete catalog of Slack Web API methods (`chat`, `conversations`, `users`, `search`, `reactions`, `pins`, `reminders`, `files`), formatting rules, and CLI examples.
- [**CLI Command Reference**](docs/cli-reference.md): Detailed parameter specifications and examples for every CLI command.
- [**Background Daemon Service (macOS)**](docs/daemon-service.md): Guide to running `slack daemon` via macOS `launchd` for 24/7 background operation.
- [**AI Agent Skill**](skills/slack-cli/SKILL.md): Standardized skill definition for autonomous agents using the CLI.

---

## Installation & Setup

### 1. Link CLI Globally

```bash
# Using npm link:
npm link

# Or symlink directly:
ln -sfn "$(pwd)/bin/slack.js" ~/.local/bin/slack
ln -sfn "$(pwd)/bin/slack.js" ~/.local/bin/paseo-slack
```

### 2. Configure Credentials

Configure persistently in `~/.config/slack-router/config.json`:

```bash
# Option A: Browser Session Token (Stealth / Personal Automation)
slack config xoxcToken="xoxc-..." cookieD="xoxd-..."

# Option B: User OAuth Token
slack config xoxpToken="xoxp-..."

# Optional: Slack App Token for WebSocket Socket Mode
slack config appToken="xapp-..."
```

Or configure via environment variables in `~/.zshrc`:

```bash
export SLACK_XOXC_TOKEN="xoxc-..."
export SLACK_COOKIE_D="xoxd-..."
export SLACK_APP_TOKEN="xapp-..."
```

Verify authentication:

```bash
slack whoami
```

---

## Quickstart Examples

### Messaging & History

```bash
# Send DM by username
slack send @alex "Could you review PR #42 when you have a moment?"

# Reply to thread
slack send C12345678 "Fixed the test issue and pushed updates" --thread 1727200000.123

# View DM history by username
slack history @alex --limit 5

# View thread replies
slack thread C12345678 1727200000.123

# Search workspace
slack search "release v1.0.0"

# Add reaction
slack react C12345678 1727200000.123 eyes
```

### AI Fleet Coordination & Routing

```bash
# 1. Set default coordinator agent
slack set-coordinator afe3e85b-e376-4b7f-a10b-5970ced5b432

# 2. Worker agent subscribes to replies in a specific review thread
slack subscribe --agent 2a4279a --thread 1727200000.123

# 3. View active fleet subscriptions
slack subscriptions

# 4. Start real-time router daemon
slack daemon
```

### Raw API Access

```bash
# Lookup user info
slack api users.info user=U12345678

# Search files
slack api search.files query="architecture" count=5
```

---

## Running as MCP Server

Add to your MCP configuration (Paseo, Claude Code, or Antigravity):

```json
{
  "mcpServers": {
    "slack": {
      "command": "slack",
      "args": ["mcp"]
    }
  }
}
```

Exposed MCP tools:

- `slack_send_message`
- `slack_get_history`
- `slack_get_thread`
- `slack_search`
- `slack_add_reaction`
- `slack_subscribe`
- `slack_unsubscribe`
- `slack_list_subscriptions`
- `slack_call_api`

---

## License

MIT © kern0x1b
