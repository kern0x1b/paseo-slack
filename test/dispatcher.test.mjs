import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventDispatcher } from '../src/dispatcher.js';

test('EventDispatcher buildFleetEnvelope generates valid paseo-fleet/v1 schema', () => {
  const dispatcher = new EventDispatcher({
    config: { teamId: 'T01TESTTEAM' },
    myUserId: 'U_BOT',
  });

  const event = {
    type: 'message',
    user: 'U_DEV',
    channel: 'C01ALERTS',
    ts: '1728000000.123',
    text: '<@U_BOT> please review this branch',
  };

  const envelope = dispatcher.buildFleetEnvelope(event);

  assert.equal(envelope.protocol, 'paseo-fleet/v1');
  assert.equal(envelope.source, 'slack');
  assert.equal(envelope.instance, 'T01TESTTEAM');
  assert.equal(envelope.scope, 'C01ALERTS');
  assert.equal(envelope.urn, 'urn:slack:T01TESTTEAM:C01ALERTS:1728000000.123');
  assert.equal(envelope.event_type, 'mention');
  assert.equal(envelope.actor.id, 'U_DEV');
  assert.equal(envelope.actor.is_bot, false);
  assert.equal(envelope.content, '<@U_BOT> please review this branch');
  assert.equal(envelope.reply_action.type, 'mcp');
  assert.equal(envelope.reply_action.tool, 'slack_send_message');
  assert.equal(envelope.reply_action.params.channel, 'C01ALERTS');
  assert.equal(envelope.reply_action.params.thread_ts, '1728000000.123');
});

test('EventDispatcher dispatches fleet envelope to coordinator', async () => {
  const calls = [];
  const fakeRegistry = {
    findMatchingAgent: () => null,
    getCoordinator: () => 'coordinator-agent-123',
  };

  const dispatcher = new EventDispatcher({
    registry: fakeRegistry,
    config: { teamId: 'T_WORK' },
    myUserId: 'U_BOT',
  });

  dispatcher.sendToPaseo = async (agentId, prompt) => {
    calls.push({ agentId, prompt });
    return { success: true, stdout: 'ok', stderr: '' };
  };

  const event = {
    type: 'message',
    user: 'U_USER',
    channel: 'D123DM',
    ts: '1728000001.456',
    text: 'Hello coordinator',
  };

  const result = await dispatcher.dispatch(event);

  assert.equal(result.routed, true);
  assert.equal(result.type, 'coordinator');
  assert.equal(result.targetAgent, 'coordinator-agent-123');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].agentId, 'coordinator-agent-123');

  const parsed = JSON.parse(calls[0].prompt);
  assert.equal(parsed.protocol, 'paseo-fleet/v1');
  assert.equal(parsed.instance, 'T_WORK');
  assert.equal(parsed.scope, 'D123DM');
  assert.equal(parsed.event_type, 'dm');
  assert.equal(parsed.reply_action.tool, 'slack_send_message');
});
