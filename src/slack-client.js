import { loadConfig } from './config.js';

export class SlackClient {
  constructor(config = loadConfig()) {
    this.config = config;
    this._authCache = null;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
    };

    if (this.config.xoxpToken) {
      headers['Authorization'] = `Bearer ${this.config.xoxpToken}`;
    } else if (this.config.xoxcToken) {
      headers['Authorization'] = `Bearer ${this.config.xoxcToken}`;
      if (this.config.cookieD) {
        headers['Cookie'] = `d=${this.config.cookieD}`;
      }
    } else {
      throw new Error(
        'No Slack token configured. Set SLACK_XOXP_TOKEN or SLACK_XOXC_TOKEN + SLACK_COOKIE_D.',
      );
    }

    return headers;
  }

  async call(method, params = {}) {
    const url = `https://slack.com/api/${method}`;
    const headers = this.getHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!data.ok) {
      const err = new Error(`Slack API error (${method}): ${data.error || 'unknown_error'}`);
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        err.retryAfter = retryAfterHeader ? Number(retryAfterHeader) : 30;
      }
      throw err;
    }

    return data;
  }

  async authTest() {
    if (!this._authCache) {
      this._authCache = await this.call('auth.test');
    }
    return this._authCache;
  }

  async resolveChannel(target) {
    if (!target) return target;

    if (target.startsWith('C') || target.startsWith('D')) {
      return target;
    }

    let userId = target;
    if (target.startsWith('@')) {
      const username = target.slice(1).toLowerCase();
      const userList = await this.call('users.list');
      const found = (userList.members || []).find(
        (m) => (m.name || '').toLowerCase() === username || (m.real_name || '').toLowerCase() === username,
      );
      if (!found) {
        throw new Error(`Could not resolve Slack user: ${target}`);
      }
      userId = found.id;
    }

    if (userId.startsWith('U')) {
      const dm = await this.call('conversations.open', { users: userId });
      return dm.channel.id;
    }

    return target;
  }

  async postMessage({ channel, text, thread_ts }) {
    const resolvedChannel = await this.resolveChannel(channel);
    const params = {
      channel: resolvedChannel,
      text,
      as_user: true,
    };
    if (thread_ts) {
      params.thread_ts = thread_ts;
    }
    return this.call('chat.postMessage', params);
  }

  async getHistory({ channel, limit = 20, oldest, latest }) {
    const resolvedChannel = await this.resolveChannel(channel);
    const params = { channel: resolvedChannel, limit };
    if (oldest) params.oldest = oldest;
    if (latest) params.latest = latest;
    return this.call('conversations.history', params);
  }

  async getReplies({ channel, ts, limit = 50 }) {
    const resolvedChannel = await this.resolveChannel(channel);
    return this.call('conversations.replies', { channel: resolvedChannel, ts, limit });
  }

  async searchMessages({ query, count = 20, sort = 'timestamp' }) {
    const params = new URLSearchParams({ query, count: String(count), sort });
    const url = `https://slack.com/api/search.messages?${params}`;
    const headers = this.getHeaders();
    delete headers['Content-Type'];

    const response = await fetch(url, { method: 'GET', headers });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack API error (search.messages): ${data.error || 'unknown_error'}`);
    }
    return data;
  }

  async addReaction({ channel, timestamp, name }) {
    const resolvedChannel = await this.resolveChannel(channel);
    return this.call('reactions.add', { channel: resolvedChannel, timestamp, name });
  }

  async removeReaction({ channel, timestamp, name }) {
    const resolvedChannel = await this.resolveChannel(channel);
    return this.call('reactions.remove', { channel: resolvedChannel, timestamp, name });
  }

  async listChannels({ types = 'public_channel,private_channel,im,mpim', limit = 100 } = {}) {
    return this.call('conversations.list', { types, limit });
  }

  async getUserInfo(userId) {
    return this.call('users.info', { user: userId });
  }

  async lookupByEmail(email) {
    return this.call('users.lookupByEmail', { email });
  }

  async openSocketConnection() {
    if (!this.config.appToken) {
      throw new Error('Socket Mode requires SLACK_APP_TOKEN (xapp-...)');
    }

    const response = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.config.appToken}`,
      },
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`apps.connections.open failed: ${data.error}`);
    }

    return data.url;
  }

  async openUserSessionSocket() {
    if (!this.config.xoxcToken) {
      throw new Error('User-session Socket requires SLACK_XOXC_TOKEN (+ SLACK_COOKIE_D)');
    }

    const data = await this.call('rtm.connect', {});
    const headers = this.getHeaders();
    delete headers['Content-Type'];

    return { url: data.url, headers, selfId: data.self && data.self.id };
  }
}
