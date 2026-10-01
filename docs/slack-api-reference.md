# Slack Web API Reference for Agents and CLI

This document is the definitive guide to interacting with the Slack Web API using the `slack` CLI utility (`slack api <method> [key=value...]`) or direct client integration.

---

## 1. Overview & Authentication

The `slack` tool communicates with Slack's official REST API at `https://slack.com/api/<method>`.

### Authentication Types Supported

1. **User OAuth Token (`xoxp-...`)**:
   - Authorized via Slack App OAuth flow.
   - Sent in header: `Authorization: Bearer xoxp-...`.
   - Actions appear directly as your Slack user.
2. **Browser Session Token (`xoxc-...` + `Cookie: d=xoxd-...`)**:
   - Extracted from active Slack web/desktop client session.
   - Sent in header: `Authorization: Bearer xoxc-...` and `Cookie: d=xoxd-...`.
   - **Zero Bot Footprint**: Full stealth, identical capabilities to the official desktop client.
3. **App-Level Token (`xapp-...`)**:
   - Used specifically for WebSocket / Socket Mode real-time connections (`apps.connections.open`).

---

## 2. Calling Any API Method via CLI

Any Slack API method can be invoked directly:

```bash
# General Syntax
slack api <method> [key=value ...] [--flag value]

# Examples
slack api auth.test
slack api users.info user=U0123456789
slack api conversations.history channel=D0AF6CGA2RW limit=5
slack api chat.postMessage channel=D0AF6CGA2RW text="Hello from CLI"
```

All responses are returned as structured JSON.

---

## 3. Core API Method Catalog

### 3.1. Messages (`chat.*`)

| Method                        | Description                                        | Key Parameters                                                                                                                                  |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat.postMessage`            | Send message to channel, DM, or thread             | `channel` (ID or name), `text`, `thread_ts` (optional), `reply_broadcast` (`true`/`false`), `mrkdwn` (`true`/`false`), `unfurl_links`, `blocks` |
| `chat.update`                 | Edit an existing message                           | `channel`, `ts` (timestamp of message to edit), `text`, `blocks`                                                                                |
| `chat.delete`                 | Delete a message                                   | `channel`, `ts`, `as_user` (`true`)                                                                                                             |
| `chat.postEphemeral`          | Send an ephemeral message visible only to one user | `channel`, `user` (target user ID), `text`, `thread_ts`                                                                                         |
| `chat.getPermalink`           | Get a permanent URL link to a message              | `channel`, `message_ts`                                                                                                                         |
| `chat.meMessage`              | Send a `/me` style message                         | `channel`, `text`                                                                                                                               |
| `chat.scheduleMessage`        | Schedule message for future delivery               | `channel`, `post_at` (unix timestamp in seconds), `text`                                                                                        |
| `chat.deleteScheduledMessage` | Cancel a scheduled message                         | `channel`, `scheduled_message_id`                                                                                                               |

#### Examples

```bash
# Send reply into a thread
slack api chat.postMessage channel=C03MYGMC1 text="Review complete" thread_ts=1727201234.567890

# Broadcast thread reply back to the main channel
slack api chat.postMessage channel=C03MYGMC1 text="Important update for everyone" thread_ts=1727201234.567890 reply_broadcast=true

# Edit previously posted message
slack api chat.update channel=C03MYGMC1 ts=1727201234.567890 text="Updated review notes"

# Get permalink for sharing
slack api chat.getPermalink channel=C03MYGMC1 message_ts=1727201234.567890
```

---

### 3.2. Conversations (`conversations.*`)

Covers public channels, private channels, direct messages (IM), and multi-person DMs (MPIM).

| Method                     | Description                               | Key Parameters                                                                                                   |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `conversations.history`    | Fetch message history of channel or DM    | `channel`, `limit` (max 1000, default 100), `oldest` (ts), `latest` (ts), `inclusive` (`true`/`false`), `cursor` |
| `conversations.replies`    | Fetch all replies in a thread             | `channel`, `ts` (parent message ts), `limit`, `cursor`, `oldest`, `latest`                                       |
| `conversations.list`       | List channels/DMs in workspace            | `types` (`public_channel,private_channel,im,mpim`), `limit`, `cursor`, `exclude_archived`                        |
| `conversations.info`       | Get channel details, topic, members count | `channel`, `include_num_members` (`true`)                                                                        |
| `conversations.open`       | Open or find a 1-on-1 DM or MPIM          | `users` (comma-separated list of User IDs, e.g. `U0987654321`)                                                     |
| `conversations.members`    | List user IDs who are members of channel  | `channel`, `limit`, `cursor`                                                                                     |
| `conversations.join`       | Join a public channel                     | `channel`                                                                                                        |
| `conversations.leave`      | Leave a channel                           | `channel`                                                                                                        |
| `conversations.setTopic`   | Set topic of channel                      | `channel`, `topic`                                                                                               |
| `conversations.setPurpose` | Set description of channel                | `channel`, `purpose`                                                                                             |
| `conversations.archive`    | Archive a channel                         | `channel`                                                                                                        |

#### Examples

```bash
# Open or resolve DM channel ID with a user
slack api conversations.open users=U0987654321

# Fetch latest 10 messages from channel
slack api conversations.history channel=C03MYGMC1 limit=10

# Read all replies in a thread
slack api conversations.replies channel=C03MYGMC1 ts=1727201234.567890

# List all private channels you belong to
slack api conversations.list types=private_channel limit=50
```

---

### 3.3. Users (`users.*`)

| Method                | Description                                           | Key Parameters                                                    |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `users.list`          | List all users in workspace                           | `limit` (default 100), `cursor`, `include_locale`                 |
| `users.info`          | Get detailed profile of a specific user               | `user` (User ID, e.g. `U0123456789`), `include_locale`            |
| `users.lookupByEmail` | Find user account by work email address               | `email` (e.g. `colleague@company.com`)                            |
| `users.getPresence`   | Check user's online status (`active` vs `away`)       | `user`                                                            |
| `users.setPresence`   | Set own status to active or away                      | `presence` (`auto` or `away`)                                     |
| `users.profile.get`   | Get custom profile fields (status text, emoji, title) | `user` (optional, defaults to self)                               |
| `users.profile.set`   | Update status emoji, text, or title                   | `profile` (JSON object string with `status_text`, `status_emoji`) |

#### Examples

```bash
# Lookup colleague by corporate email
slack api users.lookupByEmail email=alex.dev@example.com

# Check user profile and display name
slack api users.info user=U12345678

# Set Slack status to "Reviewing code" with :eyes: emoji
slack api users.profile.set profile='{"status_text":"Reviewing code","status_emoji":":eyes:","status_expiration":0}'
```

---

### 3.4. Search (`search.*`)

Full-text workspace search across all accessible public channels, private channels, and DMs.

| Method            | Description                                | Key Parameters                                                                                                |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `search.messages` | Search message contents                    | `query`, `count` (default 20, max 100), `sort` (`timestamp` or `score`), `sort_dir` (`asc` or `desc`), `page` |
| `search.files`    | Search uploaded files, snippets, documents | `query`, `count`, `sort`, `sort_dir`, `page`                                                                  |
| `search.all`      | Unified search across messages and files   | `query`, `count`, `sort`                                                                                      |

#### Powerful Slack Search Modifiers

| Modifier                       | Meaning                     | Example                      |
| ------------------------------ | --------------------------- | ---------------------------- |
| `from:@username`               | Sent by specific user       | `from:@alex project-service` |
| `to:@username`                 | Sent directly to user       | `to:me bug`                  |
| `in:#channel`                  | In specific channel         | `in:#dev-alerts error`       |
| `in:@username`                 | In direct message with user | `in:@alex PR`                |
| `has:link`                     | Message contains a link     | `has:link gitlab MR`         |
| `has:reaction` / `has::emoji:` | Message has a reaction      | `has::white_check_mark:`     |
| `before:YYYY-MM-DD`            | Sent before date            | `before:2026-09-01`          |
| `after:YYYY-MM-DD`             | Sent after date             | `after:2026-08-01`           |
| `"exact phrase"`               | Match exact phrase          | `"service outage"`           |

#### Examples

```bash
# Search for discussions about a ticket or service
slack api search.messages query="project-service from:@alex" count=10

# Search for GitLab MR links sent in DMs
slack search "gitlab.example.com merge_requests"
```

---

### 3.5. Reactions (`reactions.*`)

| Method             | Description                               | Key Parameters                                                                                                    |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `reactions.add`    | Add an emoji reaction to a message        | `channel`, `timestamp`, `name` (emoji name without colons, e.g. `thumbsup`, `white_check_mark`, `eyes`, `rocket`) |
| `reactions.remove` | Remove your emoji reaction from a message | `channel`, `timestamp`, `name`                                                                                    |
| `reactions.get`    | Get all reactions on a message            | `channel`, `timestamp`, `full` (`true`)                                                                           |
| `reactions.list`   | List items reacted to by a user           | `user` (optional), `count`, `page`                                                                                |

#### Examples

```bash
# Acknowledge a message with :eyes:
slack react D0AF6CGA2RW 1727201234.567890 eyes

# Confirm completion with :white_check_mark:
slack react D0AF6CGA2RW 1727201234.567890 white_check_mark
```

---

### 3.6. Bookmarks & Pins (`bookmarks.*`, `pins.*`)

| Method             | Description                          | Key Parameters                                 |
| ------------------ | ------------------------------------ | ---------------------------------------------- |
| `pins.add`         | Pin message to channel header        | `channel`, `timestamp`                         |
| `pins.remove`      | Unpin message                        | `channel`, `timestamp`                         |
| `pins.list`        | List all pinned messages in channel  | `channel`                                      |
| `bookmarks.list`   | List channel top-bar bookmarks       | `channel_id`                                   |
| `bookmarks.add`    | Add bookmark link to channel top bar | `channel_id`, `title`, `type` (`link`), `link` |
| `bookmarks.remove` | Remove bookmark                      | `channel_id`, `bookmark_id`                    |

---

### 3.7. Reminders (`reminders.*`)

| Method               | Description           | Key Parameters                                                                                  |
| -------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `reminders.add`      | Create reminder       | `text`, `time` (Unix timestamp or natural language like `"in 30 minutes"`, `"tomorrow at 9am"`) |
| `reminders.list`     | List active reminders | none                                                                                            |
| `reminders.complete` | Mark reminder done    | `reminder` (ID, e.g. `Rm123456`)                                                                |
| `reminders.delete`   | Delete reminder       | `reminder`                                                                                      |

#### Examples

```bash
# Remind yourself to check review in 1 hour
slack api reminders.add text="Check PR review" time="in 1 hour"
```

---

### 3.8. Files (`files.*`)

| Method                         | Description                                | Key Parameters                                                      |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| `files.list`                   | List files shared in workspace or channel  | `channel`, `user`, `types`, `count`                                 |
| `files.info`                   | Get file metadata and download link        | `file` (File ID, e.g. `F123456`)                                    |
| `files.delete`                 | Delete file                                | `file`                                                              |
| `files.getUploadURLExternal`   | Generate direct upload URL for attachments | `filename`, `length`                                                |
| `files.completeUploadExternal` | Finalize upload and share in channel       | `files` (JSON array: `[{"id":"F...","title":"..."}]`), `channel_id` |

---

### 3.9. Real-Time Socket Mode (`apps.connections.*`)

| Method                  | Description                                          | Key Parameters                          |
| ----------------------- | ---------------------------------------------------- | --------------------------------------- |
| `apps.connections.open` | Acquire ephemeral WebSocket URL for real-time events | Requires `SLACK_APP_TOKEN` (`xapp-...`) |

---

## 4. Slack Markdown (`mrkdwn`) Syntax Reference

Slack uses a specialized flavor of Markdown called `mrkdwn`:

| Element        | Syntax                   | Example                         | Rendered                 |
| -------------- | ------------------------ | ------------------------------- | ------------------------ |
| Bold           | `*text*`                 | `*urgent fix*`                  | **urgent fix**           |
| Italic         | `_text_`                 | `_in progress_`                 | _in progress_            |
| Strikethrough  | `~text~`                 | `~deprecated~`                  | ~~deprecated~~           |
| Inline code    | `` `code` ``             | `` `feature-flag` ``            | `feature-flag`           |
| Code block     | ` ```code``` `           | ` ```js\nconst a = 1;\n``` `    | Multiline code block     |
| Blockquote     | `> text`                 | `> Notes from sync`             | Blockquote bar           |
| User mention   | `<@U12345678>`           | `<@U12345678>`                  | `@alex`                  |
| Channel link   | `<#C12345678>`           | `<#C12345678>`                  | `#general`               |
| Broadcast      | `<!here>` / `<!channel>` | `<!here> heads up`              | `@here heads up`         |
| URL with title | `<URL\|Title>`           | `<https://github.com\|PR !123>` | Clickable link [PR !123] |
| Plain URL      | URL text directly        | `https://github.com`            | Auto-unfurled link       |
| Emoji          | `:name:`                 | `:white_check_mark:`            | ✅                       |

> [!IMPORTANT]
> **Slack Links vs Standard Markdown**: Standard markdown `[Title](https://...)` does **NOT** work in Slack messages! It renders as raw text `[Title](https://...)`. Always use `<https://...|Title>` or provide the bare URL.
