import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SlackSnapshot } from '../src/snapshot.js';

const MY_USER_ID = 'U_ME';

function message({ ts, user, channel, permalink = '', text = 'hello' }) {
  return { ts, user, username: user.toLowerCase(), channel, permalink, text };
}

function createFakeClient({ directMessages = [], mentions = [], history = {}, replies = {} }) {
  return {
    async authTest() {
      return { user_id: MY_USER_ID, team_id: 'T_TEAM' };
    },
    async searchMessages({ query }) {
      const matches = query.startsWith('to:me') ? directMessages : mentions;
      return { messages: { matches, paging: { pages: 1 } } };
    },
    async getHistory({ channel }) {
      return { messages: history[channel] || [] };
    },
    async getReplies({ channel, ts }) {
      return { messages: replies[`${channel}:${ts}`] || [] };
    },
  };
}

const since = new Date('2026-10-01T00:00:00Z');
const directChannel = { id: 'D_DM', is_im: true, name: 'U_PEER' };
const publicChannel = { id: 'C_DEV', is_im: false, name: 'dev' };

test('SlackSnapshot groups unanswered direct messages per conversation', async () => {
  const client = createFakeClient({
    directMessages: [
      message({ ts: '1790900000.000100', user: 'U_PEER', channel: directChannel, text: 'first' }),
      message({ ts: '1790900100.000100', user: 'U_PEER', channel: directChannel, text: 'second' }),
    ],
  });

  const snapshot = await new SlackSnapshot({ client }).collect({ since });

  assert.equal(snapshot.items.length, 1);
  const [item] = snapshot.items;
  assert.equal(item.event_type, 'dm');
  assert.equal(item.urn, 'urn:slack:T_TEAM:D_DM:1790900100.000100');
  assert.equal(item.snapshot.state.messages_waiting, 2);
  assert.deepEqual(item.reply_action.params, { channel: 'D_DM' });
  assert.match(item.content, /first\n<u_peer>: second/);
});

test('SlackSnapshot drops conversations the user already replied to', async () => {
  const client = createFakeClient({
    directMessages: [message({ ts: '1790900000.000100', user: 'U_PEER', channel: directChannel })],
    history: { D_DM: [{ ts: '1790900500.000100', user: MY_USER_ID, text: 'done' }] },
  });

  const snapshot = await new SlackSnapshot({ client }).collect({ since });

  assert.equal(snapshot.items.length, 0);
});

test('SlackSnapshot answers channel mentions in their thread and skips messages before since', async () => {
  const threadPermalink =
    'https://team.slack.com/archives/C_DEV/p1790900200000100?thread_ts=1790900000.000100';
  const client = createFakeClient({
    mentions: [
      message({
        ts: '1790900200.000100',
        user: 'U_PEER',
        channel: publicChannel,
        permalink: threadPermalink,
      }),
      message({ ts: '1700000000.000100', user: 'U_PEER', channel: publicChannel }),
    ],
  });

  const snapshot = await new SlackSnapshot({ client }).collect({ since });

  assert.equal(snapshot.items.length, 1);
  const [item] = snapshot.items;
  assert.equal(item.event_type, 'mention');
  assert.equal(item.target.type, 'thread');
  assert.deepEqual(item.reply_action.params, { channel: 'C_DEV', thread_ts: '1790900000.000100' });
});
