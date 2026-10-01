---
name: slack-cli
description: Control Slack directly via the `slack` CLI utility. Use for reading Slack history, searching conversations, reading threads, sending messages/replies, adding reactions, managing real-time Paseo agent subscriptions, and calling any Slack Web API method.
---

# Slack CLI (`slack`) Guide for AI Agents

The `slack` command-line utility provides complete access to the Slack workspace as the authenticated user. It can read messages, search workspace conversations, inspect threads, send replies, react with emojis, and route real-time inbound events to AI agents.

---

## ⚠️ ABSOLUTE SAFETY RULES

1. **NO UNAPPROVED OUTBOUND MESSAGES**: NEVER send a message (`slack send`) or post a thread reply without explicit user approval of the exact text and recipient.
2. **Read Operations are Safe**: Searching (`slack search`), reading history (`slack history`), reading threads (`slack thread`), and inspecting subscriptions are safe to perform autonomously.
3. **Reactions**: Confirm with the user before adding emoji reactions unless explicitly instructed.

---

## Communication Style & Guidelines

When drafting Slack messages for the user:

- **Concise & Direct**: Keep messages brief and actionable.
- **Bare URLs**: Slack mrkdwn handles bare URLs cleanly (e.g. `https://github.com/...`). Never use Markdown link format `[text](url)` as Slack displays it literally.
- **Punctuation**: Use clear, polite, and neutral punctuation.
- **Formatting**: Use Slack mrkdwn (`*bold*`, `_italic_`, `` `code` ``).

---

## Primary Workflows

### 1. Reading Context & History

```bash
# Check DM history with a colleague (auto-resolves @username)
slack history @alex --limit 10

# Read conversation history from a specific channel ID
slack history C12345678 --limit 20

# Read all replies in a thread
slack thread C12345678 1727200000.123
```

### 2. Searching Workspace for Past Decisions & Context

When investigating bugs, architecture decisions, or previous PR discussions:

```bash
# Search by keywords
slack search "FeatureToggle deployment"

# Search messages from a specific person
slack search "from:@alex architecture"

# Search in a specific channel or DM
slack search "in:@alex release"
```

### 3. Sending Messages & Review Requests (After Approval)

```bash
# Send direct message to a colleague
slack send @alex "Could you review PR #42 when you have a moment?"

# Reply directly into a thread
slack send C12345678 "Fixed the issues and tests are passing" --thread 1727200000.123
```

### 4. Subscribing Active Agent to Review Replies

When an agent finishes pushing code or asking for a review, it can subscribe itself so when the reviewer replies, the daemon routes the reply back to this agent:

```bash
# Worker agent subscribes to replies in thread:
slack subscribe --agent <agent-id> --thread <thread-ts>

# Check current subscriptions:
slack subscriptions

# Clean up subscription when completed:
slack unsubscribe --thread <thread-ts>
```

### 5. Universal Raw Slack API Access

If a specific feature is not covered by high-level CLI commands, invoke `slack api <method> [key=value...]`.

See the complete method catalog in `docs/slack-api-reference.md`.

```bash
# Check user presence
slack api users.getPresence user=U12345678

# Look up user ID by work email
slack api users.lookupByEmail email=alex.dev@example.com

# Add bookmark to channel
slack api bookmarks.add channel_id=C12345678 title="PR #42" type=link link="https://github.com/..."

# Pin a message to channel
slack api pins.add channel=C12345678 timestamp=1727200000.123
```

---

## Slack Formatting (mrkdwn) Cheat Sheet

- Bold: `*text*`
- Italic: `_text_`
- Code: `` `code` ``
- User mention: `<@U12345678>`
- Bare link: `https://example.com`
- Titled link: `<https://example.com|Link Title>` (do **not** use `[Title](URL)`)
