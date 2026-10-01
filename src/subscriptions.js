import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SUBS_DIR = path.join(os.homedir(), '.config', 'slack-router');
const SUBS_FILE = path.join(SUBS_DIR, 'subscriptions.json');

function ensureDir() {
  if (!fs.existsSync(SUBS_DIR)) {
    fs.mkdirSync(SUBS_DIR, { recursive: true });
  }
}

export class SubscriptionRegistry {
  constructor(filePath = SUBS_FILE) {
    this.filePath = filePath;
  }

  load() {
    ensureDir();
    if (!fs.existsSync(this.filePath)) {
      return { coordinatorAgentId: null, subscriptions: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      return { coordinatorAgentId: null, subscriptions: [] };
    }
  }

  save(data) {
    ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  getCoordinator() {
    return this.load().coordinatorAgentId;
  }

  setCoordinator(agentId) {
    const data = this.load();
    data.coordinatorAgentId = agentId;
    this.save(data);
    return data;
  }

  list() {
    return this.load().subscriptions || [];
  }

  add({ agentId, channel, thread_ts, sender }) {
    if (!agentId) {
      throw new Error('agentId is required for subscription');
    }

    const data = this.load();
    const id = `sub_${crypto.randomBytes(4).toString('hex')}`;
    const sub = {
      id,
      agentId,
      channel: channel || null,
      thread_ts: thread_ts || null,
      sender: sender || null,
      createdAt: new Date().toISOString(),
    };

    data.subscriptions = (data.subscriptions || []).filter(
      (s) =>
        !(
          s.agentId === agentId &&
          s.channel === sub.channel &&
          s.thread_ts === sub.thread_ts &&
          s.sender === sub.sender
        ),
    );

    data.subscriptions.push(sub);
    this.save(data);
    return sub;
  }

  remove({ id, agentId, thread_ts }) {
    const data = this.load();
    const beforeCount = (data.subscriptions || []).length;

    data.subscriptions = (data.subscriptions || []).filter((s) => {
      if (id && s.id === id) return false;
      if (thread_ts && s.thread_ts === thread_ts) return false;
      if (agentId && !thread_ts && !id && s.agentId === agentId) return false;
      return true;
    });

    this.save(data);
    return beforeCount - data.subscriptions.length;
  }

  findMatchingAgent(event) {
    const data = this.load();
    const subs = data.subscriptions || [];

    for (const sub of subs) {
      if (sub.thread_ts && event.thread_ts !== sub.thread_ts) continue;
      if (sub.channel && event.channel !== sub.channel) continue;
      if (sub.sender && event.user !== sub.sender) continue;
      return sub.agentId;
    }

    return null;
  }
}
