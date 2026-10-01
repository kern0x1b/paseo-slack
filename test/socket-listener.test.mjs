import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { SocketListener } from '../src/socket-listener.js';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.readyState = FakeWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000 });
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  triggerMessage(obj) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) });
  }
}

const OriginalWebSocket = globalThis.WebSocket;

function installFakeWebSocket(t) {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => {
    globalThis.WebSocket = OriginalWebSocket;
  });
  return FakeWebSocket;
}

function makeFakeDispatcher() {
  return {
    calls: [],
    alertCalls: [],
    setMyUserId() {},
    async dispatch(event) {
      this.calls.push(event);
      return { routed: false };
    },
    async notifyCoordinator(message) {
      this.alertCalls.push(message);
      return { routed: true, targetAgent: 'COORDINATOR' };
    },
  };
}

function makeFakeClient({ openUserSessionSocket, listChannels, getHistory } = {}) {
  return {
    config: { xoxcToken: 'fake-xoxc', appToken: '' },
    async authTest() {
      return { user_id: 'U_SELF', user: 'tester', team: 'test' };
    },
    openUserSessionSocket:
      openUserSessionSocket || (async () => ({ url: 'wss://fake', headers: {}, selfId: 'U_SELF' })),
    listChannels: listChannels || (async () => ({ channels: [{ id: 'D1' }] })),
    getHistory: getHistory || (async () => ({ messages: [] })),
  };
}

function testStateFile() {
  return path.join(os.tmpdir(), `slack-router-test-state-${process.pid}-${Date.now()}-${Math.random()}.json`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('enterSocketMode resets attempts/delay on every hello, not just the first', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  const client = makeFakeClient();
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  await listener.connectUserSessionSocket();
  const ws1 = FakeWebSocket.instances[0];
  ws1.triggerOpen();
  ws1.triggerMessage({ type: 'hello' });

  assert.equal(listener.mode, 'socket');
  assert.equal(listener.wsAttempts, 0);
  assert.equal(listener.wsReconnectDelay, 1000);

  listener.wsReconnectDelay = 10;
  ws1.close();

  assert.ok(listener.wsReconnectTimer, 'a reconnect should be scheduled after a post-hello close');
  assert.equal(listener.wsReconnectDelay, 20, 'delay should have doubled once, from 10 to 20');

  await wait(30);
  assert.equal(FakeWebSocket.instances.length, 2, 'exactly one reconnect socket should have been created');
  const ws2 = FakeWebSocket.instances[1];
  ws2.triggerOpen();
  ws2.triggerMessage({ type: 'hello' });

  assert.equal(listener.wsAttempts, 0);
  assert.equal(listener.wsReconnectDelay, 1000, 'reconnect delay must reset on the second hello too');
});

test('a retry that lands during a pending backoff does not open a second socket', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  let openCalls = 0;
  const client = makeFakeClient({
    openUserSessionSocket: async () => {
      openCalls += 1;
      if (openCalls === 1) {
        throw new Error('simulated pre-hello failure');
      }
      return { url: 'wss://fake', headers: {}, selfId: 'U_SELF' };
    },
  });
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  listener.wsReconnectDelay = 20;
  await listener.connectUserSessionSocket();

  assert.equal(FakeWebSocket.instances.length, 0, 'the failed attempt must not have created a socket');
  assert.ok(listener.wsReconnectTimer, 'a reconnect must be pending during the backoff gap');

  await listener.connectUserSessionSocket();
  assert.equal(FakeWebSocket.instances.length, 0, 'a call landing during backoff must be a no-op');

  await wait(40);
  assert.equal(
    FakeWebSocket.instances.length,
    1,
    'exactly one socket should be created once backoff elapses',
  );

  const ws = FakeWebSocket.instances[0];
  ws.triggerOpen();
  ws.triggerMessage({ type: 'hello' });
  assert.equal(listener.mode, 'socket');
  assert.equal(listener.wsReconnectTimer, null);
});

test('a stale socket that is no longer this.ws cannot dispatch a message', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  const client = makeFakeClient();
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  await listener.connectUserSessionSocket();
  const ws1 = FakeWebSocket.instances[0];
  ws1.triggerOpen();
  ws1.triggerMessage({ type: 'hello' });
  assert.equal(listener.ws, ws1);

  listener.wsReconnectDelay = 10;
  ws1.close();
  await wait(30);
  const ws2 = FakeWebSocket.instances[1];
  ws2.triggerOpen();
  ws2.triggerMessage({ type: 'hello' });
  assert.equal(listener.ws, ws2);

  const callsBefore = dispatcher.calls.length;
  ws1.triggerMessage({ type: 'message', channel: 'D1', user: 'U_OTHER', text: 'hi', ts: '123.456' });

  assert.equal(dispatcher.calls.length, callsBefore, 'the stale socket must not have dispatched anything');

  ws2.triggerMessage({ type: 'message', channel: 'D1', user: 'U_OTHER', text: 'hi', ts: '124.456' });
  assert.equal(dispatcher.calls.length, callsBefore + 1);
});

test('polling stops on hello and does not reschedule an in-flight tick', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();

  let resolveHistory;
  let historyCalls = 0;
  const client = makeFakeClient({
    getHistory: () => {
      historyCalls += 1;
      return new Promise((resolve) => {
        resolveHistory = resolve;
      });
    },
  });

  const listener = new SocketListener({ client, dispatcher, stateFile: testStateFile() });
  t.after(() => listener.stop());
  listener.running = true;
  listener.startSmartPolling(5);

  await wait(10);
  assert.equal(historyCalls, 1);
  assert.equal(listener.pollingActive, true);

  listener.enterSocketMode();
  assert.equal(listener.pollingActive, false);
  assert.equal(listener.pollTimer, null);

  resolveHistory({ messages: [] });
  await wait(20);

  assert.equal(historyCalls, 1, 'no second poll call should happen after hello');
  assert.equal(listener.pollTimer, null);
  assert.equal(listener.pollingActive, false);
});

test('health alert fires once on polling fallback and once on recovery', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  const client = makeFakeClient();
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  listener.enterPollingMode();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 1);
  assert.match(dispatcher.alertCalls[0], /Polling fallback/);

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 1);

  await listener.connectUserSessionSocket();
  const ws = FakeWebSocket.instances[0];
  ws.triggerOpen();
  ws.triggerMessage({ type: 'hello' });
  await wait(10);

  assert.equal(dispatcher.alertCalls.length, 2);
  assert.match(dispatcher.alertCalls[1], /recovered/);

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 2);
});

test('health alert threshold: a websocket down for over 2 minutes with mode still socket also alerts', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  const client = makeFakeClient();
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  listener.mode = 'socket';
  listener.wsDownSince = Date.now() - 3 * 60 * 1000;

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 1);
  assert.match(dispatcher.alertCalls[0], /WebSocket has been down/);
});

test('a health alert that fails to deliver is retried on the next evaluation, and delivers once a coordinator exists', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();
  let coordinatorConfigured = false;
  dispatcher.notifyCoordinator = async (message) => {
    dispatcher.alertCalls.push(message);
    if (!coordinatorConfigured) {
      return { routed: false, reason: 'No coordinator configured' };
    }
    return { routed: true, targetAgent: 'COORDINATOR' };
  };

  const client = makeFakeClient();
  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;

  listener.enterPollingMode();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 1, 'delivery was attempted');
  assert.equal(listener.alertActive, false, 'a failed delivery must not be marked as sent');

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 2, 'a failed alert must be retried, not dropped');
  assert.equal(listener.alertActive, false);

  coordinatorConfigured = true;
  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 3);
  assert.equal(listener.alertActive, true, 'delivery succeeded, so the alert is now marked as sent');

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 3);
});

test('a poll failure that lands after the socket already recovered does not raise a false API-failure alert', async (t) => {
  installFakeWebSocket(t);
  const dispatcher = makeFakeDispatcher();

  let resolveHistory;
  let rejectHistory;
  const client = makeFakeClient({
    getHistory: () =>
      new Promise((resolve, reject) => {
        resolveHistory = resolve;
        rejectHistory = reject;
      }),
  });

  const listener = new SocketListener({
    client,
    dispatcher,
    maxConnectAttempts: 10,
    stateFile: testStateFile(),
  });
  t.after(() => listener.stop());
  listener.running = true;
  listener.startSmartPolling(5);

  await wait(10);
  assert.equal(listener.pollingActive, true);

  listener.enterSocketMode();
  assert.equal(listener.pollingActive, false);
  assert.equal(listener.apiFailureStreakSince, null);

  rejectHistory(Object.assign(new Error('ratelimited'), { retryAfter: 30 }));
  await wait(10);

  assert.equal(listener.apiFailureStreakSince, null, 'a stale poll failure must not be recorded');

  listener.evaluateHealth();
  await wait(10);
  assert.equal(dispatcher.alertCalls.length, 0, 'a healthy socket must not get a false API-failure alert');

  void resolveHistory;
});
