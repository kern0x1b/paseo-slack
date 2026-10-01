# Slack Web API Method Directory for Agents

Full documentation is available in `docs/slack-api-reference.md`.

## Quick Method Lookup

| Method                  | Purpose                  | CLI Example                                                                |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------- |
| `auth.test`             | Verify token & user info | `slack api auth.test`                                                      |
| `chat.postMessage`      | Send message             | `slack api chat.postMessage channel=D0123 text="hi"`                       |
| `chat.update`           | Edit message             | `slack api chat.update channel=D0123 ts=172... text="edited"`              |
| `chat.delete`           | Delete message           | `slack api chat.delete channel=D0123 ts=172...`                            |
| `chat.getPermalink`     | Get permalink            | `slack api chat.getPermalink channel=C0123 message_ts=172...`              |
| `conversations.history` | Channel history          | `slack api conversations.history channel=D0123 limit=10`                   |
| `conversations.replies` | Thread replies           | `slack api conversations.replies channel=D0123 ts=172...`                  |
| `conversations.open`    | Open DM with user        | `slack api conversations.open users=U0987654321`                             |
| `conversations.list`    | List channels            | `slack api conversations.list types=public_channel,im`                     |
| `users.info`            | Get user profile         | `slack api users.info user=U0987654321`                                      |
| `users.lookupByEmail`   | Find user by email       | `slack api users.lookupByEmail email=name@company.com`                     |
| `users.getPresence`     | Check online status      | `slack api users.getPresence user=U0987654321`                               |
| `search.messages`       | Full-text search         | `slack api search.messages query="keyword from:@user"`                     |
| `reactions.add`         | Add emoji reaction       | `slack api reactions.add channel=D0123 timestamp=172... name=eyes`         |
| `reactions.remove`      | Remove reaction          | `slack api reactions.remove channel=D0123 timestamp=172... name=eyes`      |
| `pins.add`              | Pin message              | `slack api pins.add channel=C0123 timestamp=172...`                        |
| `bookmarks.add`         | Add bookmark link        | `slack api bookmarks.add channel_id=C0123 title="MR" type=link link="..."` |
| `reminders.add`         | Set reminder             | `slack api reminders.add text="review MR" time="in 2 hours"`               |
