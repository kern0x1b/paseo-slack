# `slack` CLI Command Reference

Comprehensive reference for the `slack` command-line utility.

---

## Command Summary

| Command                              | Description                                     | Example                                                      |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| `slack whoami`                       | Show current authenticated user & workspace     | `slack whoami`                                               |
| `slack send <channel> <text>`        | Send a message to channel/DM or thread reply    | `slack send @alex "Could you review PR #42?"`                |
| `slack history <channel>`            | Show recent messages from channel or DM         | `slack history @alex --limit 10`                             |
| `slack thread <channel> <ts>`        | View all replies in a thread                    | `slack thread C12345678 1727201234.567890`                   |
| `slack search <query>`               | Search workspace messages                       | `slack search "deploy release"`                              |
| `slack react <channel> <ts> <emoji>` | Add an emoji reaction to a message              | `slack react C12345678 1727201234.567890 eyes`               |
| `slack subscribe`                    | Subscribe an AI agent to incoming messages      | `slack subscribe --agent 2a4279a --thread 1727201234.567890` |
| `slack unsubscribe`                  | Remove active agent subscription                | `slack unsubscribe --thread 1727201234.567890`               |
| `slack subscriptions`                | List all active subscriptions and coordinator   | `slack subscriptions`                                        |
| `slack set-coordinator <id>`         | Set default Paseo Fleet Coordinator Agent       | `slack set-coordinator afe3e85b-e376-4b7f-a10b`              |
| `slack daemon`                       | Run real-time background listener & router      | `slack daemon`                                               |
| `slack mcp`                          | Launch Model Context Protocol server over stdio | `slack mcp`                                                  |
| `slack api <method> [k=v...]`        | Call any raw Slack Web API endpoint             | `slack api users.info user=U12345678`                        |
| `slack config [k=v...]`              | View or update local configuration              | `slack config`                                               |

---

## Detailed Command Specifications

### 1. `slack whoami`

Checks credentials against Slack API (`auth.test`) and displays user identity.

```bash
$ slack whoami
User: alex.dev (U12345678)
Team: acme-team (T12345678)
URL:  https://acme.slack.com/
```

---

### 2. `slack send <channel> <text> [--thread <ts>] [--json]`

Sends a message or thread reply.

- **`<channel>`**: Can be a channel ID (`C...`), DM channel ID (`D...`), user ID (`U...`), or `@username`.
  _Automatic resolution_: If an `@username` or user ID `U...` is given, the CLI automatically calls `conversations.open` to resolve the 1-on-1 DM channel ID!
- **`<text>`**: Message content in Slack mrkdwn format.
- **`--thread <ts>`**: Thread parent timestamp. When specified, posts as a thread reply.
- **`--json`**: Output raw Slack API response in JSON format.

```bash
# Direct message to colleague
slack send @alex "Could you review PR #42 when you have a moment?"

# Reply in existing thread
slack send C12345678 "Fixed the issue, review ready" --thread 1727200000.123
```

---

### 3. `slack history <channel> [--limit <n>] [--json]`

Fetches recent message history from a channel or DM.

- **`<channel>`**: Channel ID, DM ID, User ID, or `@username`.
- **`--limit <n>`**: Number of messages to retrieve (default: 20).
- **`--json`**: Output full JSON objects for each message.

```bash
slack history @alex --limit 5
```

---

### 4. `slack thread <channel> <ts> [--limit <n>] [--json]`

Retrieves conversation thread replies.

- **`<channel>`**: Channel ID, DM ID, or `@username`.
- **`<ts>`**: Timestamp of the parent thread message.
- **`--limit <n>`**: Max messages (default: 50).

```bash
slack thread C12345678 1727200000.123
```

---

### 5. `slack search <query> [--count <n>] [--json]`

Searches messages across all authorized public channels, private channels, and direct messages.

- **`<query>`**: Search query string. Supports Slack filters (`from:@user`, `in:#channel`, `has:link`, `before:date`).
- **`--count <n>`**: Number of results (default: 20).

```bash
slack search "release from:@alex"
```

---

### 6. `slack react <channel> <ts> <emoji>`

Adds an emoji reaction to a message.

- **`<channel>`**: Channel ID, DM ID, or `@username`.
- **`<ts>`**: Message timestamp.
- **`<emoji>`**: Emoji name without colons (e.g. `eyes`, `white_check_mark`, `thumbsup`, `rocket`).

```bash
slack react @alex 1727200000.123 white_check_mark
```

---

### 7. Agent Subscription Management

#### `slack subscribe --agent <agent-id> [--thread <ts>] [--channel <ch>] [--from <user>]`

Registers an AI agent (Paseo session) to receive messages matching criteria.

```bash
# Subscribe agent to replies in review thread
slack subscribe --agent 2a4279a --thread 1727200000.123

# Subscribe agent to all messages in a specific channel
slack subscribe --agent 8b5321f --channel C12345678
```

#### `slack unsubscribe [--thread <ts>] [--agent <id>] [--id <id>]`

Removes subscriptions by thread timestamp, agent ID, or subscription ID.

```bash
slack unsubscribe --thread 1727200000.123
```

#### `slack subscriptions` (alias: `slack subs`)

Lists all active subscriptions and the designated coordinator agent.

```bash
$ slack subscriptions
Coordinator Agent: afe3e85b-e376-4b7f-a10b-5970ced5b432
Active Subscriptions (1):
- [sub_9b3e1a02] Agent: 2a4279a | Channel: * | Thread: 1727200000.123 | Sender: *
```

#### `slack set-coordinator <agent-id>`

Assigns the default Fleet Coordinator Agent that handles unrouted DMs and mentions.

```bash
slack set-coordinator afe3e85b-e376-4b7f-a10b-5970ced5b432
```

---

### 8. `slack daemon`

Starts the background event processor.

- Connects via WebSocket (Socket Mode) if `SLACK_APP_TOKEN` is present.
- Otherwise falls back to smart direct polling for DMs.
- Layer 1 filter drops irrelevant chatter.
- Dispatches matching events to Paseo agents via `paseo send <agent_id> ... --no-wait`.

---

### 9. `slack mcp`

Starts standard Model Context Protocol (MCP) server over stdin/stdout. Provides tool definitions:

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

### 10. `slack api <method> [key=value...]`

Executes any arbitrary Slack Web API method.

```bash
# Get channel metadata
slack api conversations.info channel=C12345678

# Fetch specific user profile
slack api users.profile.get user=U12345678
```
