const SEARCH_PAGE_SIZE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

function slackDateBefore(date) {
  return new Date(date.getTime() - DAY_MS).toISOString().slice(0, 10);
}

function threadTsFromPermalink(permalink) {
  if (!permalink) return null;
  try {
    return new URL(permalink).searchParams.get('thread_ts');
  } catch {
    return null;
  }
}

function isDirectConversation(channel) {
  return Boolean(channel?.is_im || channel?.is_mpim);
}

export class SlackSnapshot {
  constructor({ client }) {
    this.client = client;
    this.errors = [];
  }

  async collect({ since }) {
    const generatedAt = new Date().toISOString();
    const auth = await this.client.authTest();
    const myUserId = auth.user_id;
    const teamId = auth.team_id;
    const sinceSeconds = since.getTime() / 1000;
    const afterDate = slackDateBefore(since);

    const [directMessages, mentions] = await Promise.all([
      this.search('direct_messages', `to:me after:${afterDate}`),
      this.search('mentions', `<@${myUserId}> after:${afterDate}`),
    ]);

    const conversations = new Map();
    for (const message of [...directMessages, ...mentions]) {
      if (message.user === myUserId) continue;
      if (Number(message.ts) < sinceSeconds) continue;
      const channelId = message.channel?.id;
      if (!channelId) continue;

      const threadTs = threadTsFromPermalink(message.permalink);
      const direct = isDirectConversation(message.channel);
      const rootTs = threadTs || (direct ? null : message.ts);
      const key = `${channelId}:${rootTs || ''}`;

      if (!conversations.has(key)) {
        conversations.set(key, { channel: message.channel, rootTs, direct, messages: new Map() });
      }
      conversations.get(key).messages.set(message.ts, message);
    }

    const items = [];
    for (const conversation of conversations.values()) {
      const messages = Array.from(conversation.messages.values()).sort((a, b) => Number(a.ts) - Number(b.ts));
      const latest = messages[messages.length - 1];
      const replyCheck = await this.checkRepliedAfter(conversation, latest.ts, myUserId);
      if (replyCheck.replied) continue;
      items.push(this.buildItem({ conversation, messages, latest, teamId, replyCheck }));
    }

    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return {
      protocol: 'paseo-fleet/v1',
      source: 'slack',
      instance: teamId,
      actor: myUserId,
      since: since.toISOString(),
      generated_at: generatedAt,
      items,
      errors: this.errors,
    };
  }

  async search(source, query) {
    try {
      const result = await this.client.searchMessages({ query, count: SEARCH_PAGE_SIZE });
      const matches = result.messages?.matches || [];
      const pages = result.messages?.paging?.pages || 1;
      if (pages > 1) {
        this.errors.push({
          source,
          error: `results truncated to the newest ${SEARCH_PAGE_SIZE} of ${pages} pages`,
        });
      }
      return matches;
    } catch (err) {
      this.errors.push({ source, error: err.message });
      return [];
    }
  }

  async checkRepliedAfter(conversation, latestTs, myUserId) {
    const channelId = conversation.channel.id;
    try {
      const result = conversation.rootTs
        ? await this.client.getReplies({ channel: channelId, ts: conversation.rootTs, limit: 200 })
        : await this.client.getHistory({ channel: channelId, oldest: latestTs, limit: 100 });
      const replied = (result.messages || []).some(
        (message) => message.user === myUserId && Number(message.ts) > Number(latestTs),
      );
      return { replied, verified: true };
    } catch (err) {
      this.errors.push({ source: `replies:${channelId}`, error: err.message });
      return { replied: false, verified: false };
    }
  }

  buildItem({ conversation, messages, latest, teamId, replyCheck }) {
    const channelId = conversation.channel.id;
    const anchorTs = conversation.rootTs || latest.ts;
    const eventType = conversation.direct ? 'dm' : 'mention';
    const replyParams = conversation.rootTs
      ? { channel: channelId, thread_ts: conversation.rootTs }
      : { channel: channelId };
    const content = messages
      .slice(-3)
      .map((message) => `<${message.username || message.user}>: ${message.text}`)
      .join('\n');

    return {
      protocol: 'paseo-fleet/v1',
      id: `snap_slack_${teamId}_${channelId}_${anchorTs.replace('.', '_')}`,
      timestamp: new Date(Number(latest.ts) * 1000).toISOString(),
      source: 'slack',
      instance: teamId,
      scope: channelId,
      urn: `urn:slack:${teamId}:${channelId}:${anchorTs}`,
      event_type: eventType,
      actor: {
        id: latest.user || 'unknown',
        name: latest.username || latest.user || 'unknown',
        is_bot: Boolean(latest.bot_id),
      },
      target: {
        type: conversation.rootTs ? 'thread' : 'channel',
        id: conversation.rootTs || channelId,
        channel: channelId,
        team: teamId,
        url: latest.permalink || '',
      },
      content,
      reply_action: { type: 'mcp', tool: 'slack_send_message', params: replyParams },
      snapshot: {
        reasons: [conversation.direct ? 'unanswered_dm' : 'unanswered_mention'],
        state: {
          channel_name: conversation.channel.name || null,
          messages_waiting: messages.length,
          first_ts: messages[0].ts,
          latest_ts: latest.ts,
          reply_check_verified: replyCheck.verified,
        },
      },
    };
  }
}
