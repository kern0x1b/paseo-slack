import { SlackClient } from './slack-client.js';
import { EventDispatcher } from './dispatcher.js';
import {
  saveState as writeStateFile,
  clearState as clearStateFile,
  DEFAULT_STATE_FILE,
} from './daemon-state.js';

const PING_INTERVAL_MS = 20000;
const IDLE_TIMEOUT_MS = 60000;
const MAX_CONNECT_ATTEMPTS = 5;
const WS_RETRY_WHILE_POLLING_MS = 5 * 60 * 1000;
const CHANNELS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_HISTORY_CALLS_PER_MINUTE = 40;
const HEALTH_CHECK_INTERVAL_MS = 30 * 1000;
const WS_DOWN_ALERT_THRESHOLD_MS = 2 * 60 * 1000;
const API_FAILURE_ALERT_THRESHOLD_MS = 2 * 60 * 1000;

const MODE = { CONNECTING: 'connecting', SOCKET: 'socket', POLLING: 'polling' };

export class SocketListener {
  constructor({
    client = new SlackClient(),
    dispatcher = new EventDispatcher(),
    maxConnectAttempts = MAX_CONNECT_ATTEMPTS,
    wsRetryIntervalMs = WS_RETRY_WHILE_POLLING_MS,
    idleTimeoutMs = IDLE_TIMEOUT_MS,
    pingIntervalMs = PING_INTERVAL_MS,
    stateFile = DEFAULT_STATE_FILE,
  } = {}) {
    this.client = client;
    this.dispatcher = dispatcher;
    this.maxConnectAttempts = maxConnectAttempts;
    this.wsRetryIntervalMs = wsRetryIntervalMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.pingIntervalMs = pingIntervalMs;
    this.stateFile = stateFile;

    this.running = false;
    this.mode = MODE.CONNECTING;
    this.ws = null;
    this.connecting = false;
    this.wsAttempts = 0;
    this.wsReconnectDelay = 1000;
    this.wsReconnectTimer = null;

    this.pollTimer = null;
    this.pollingActive = false;
    this.pingTimer = null;
    this.watchdogTimer = null;
    this.wsRetryTimer = null;

    this.lastCheckedTs = (Date.now() / 1000).toFixed(6);
    this.channelsCache = null;
    this.channelsCacheAt = 0;
    this.pollBackoffMs = 0;

    this.startedAt = null;
    this.lastEventAt = null;
    this.eventsDispatched = 0;

    this.pollingIsFallback = false;
    this.wsDownSince = null;
    this.apiFailureStreakSince = null;
    this.alertActive = false;
    this.healthCheckTimer = null;
  }

  log(msg) {
    console.log(`[${new Date().toISOString()}] [slack-router] ${msg}`);
  }

  warn(msg) {
    console.warn(`[${new Date().toISOString()}] [slack-router] ${msg}`);
  }

  error(msg) {
    console.error(`[${new Date().toISOString()}] [slack-router] ${msg}`);
  }

  saveState() {
    writeStateFile(
      {
        pid: process.pid,
        running: this.running,
        startedAt: this.startedAt,
        mode: this.mode,
        lastEventAt: this.lastEventAt,
        eventsDispatched: this.eventsDispatched,
        updatedAt: new Date().toISOString(),
      },
      this.stateFile,
    );
  }

  recordDispatchedEvent() {
    this.eventsDispatched += 1;
    this.lastEventAt = new Date().toISOString();
    this.saveState();
  }

  async start() {
    this.running = true;
    this.startedAt = new Date().toISOString();

    try {
      const auth = await this.client.authTest();
      this.dispatcher.setMyUserId(auth.user_id);
      this.log(`Authenticated as ${auth.user} (${auth.user_id}) on team ${auth.team}`);
    } catch (err) {
      this.error(`Auth check failed: ${err.message}`);
    }

    this.healthCheckTimer = setInterval(() => this.evaluateHealth(), HEALTH_CHECK_INTERVAL_MS);

    if (this.client.config.appToken) {
      this.log('Starting in Socket Mode (WebSocket)...');
      this.saveState();
      await this.startSocketMode();
    } else if (this.client.config.xoxcToken) {
      this.log('No SLACK_APP_TOKEN found. Starting in User-Session WebSocket mode (rtm.connect)...');
      this.saveState();
      await this.connectUserSessionSocket();
    } else {
      this.mode = MODE.POLLING;
      this.log('No websocket-capable auth found. Starting in Direct Smart Polling mode...');
      this.saveState();
      this.startSmartPolling();
    }
  }

  async startSocketMode() {
    let reconnectDelay = 1000;

    const connect = async () => {
      if (!this.running) return;

      try {
        const wssUrl = await this.client.openSocketConnection();
        this.ws = new WebSocket(wssUrl);

        this.ws.onopen = () => {
          this.log('WebSocket connection established.');
          reconnectDelay = 1000;
        };

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.envelope_id) {
              this.ws.send(JSON.stringify({ envelope_id: data.envelope_id }));
            }

            if (data.type === 'events_api' && data.payload && data.payload.event) {
              const res = await this.dispatcher.dispatch(data.payload.event);
              if (res.routed) {
                this.log(`Event routed to ${res.targetAgent} (${res.type})`);
              }
            }
          } catch (err) {
            this.error(`Error processing WebSocket message: ${err.message}`);
          }
        };

        this.ws.onclose = () => {
          if (!this.running) return;
          this.warn(`WebSocket closed. Reconnecting in ${reconnectDelay}ms...`);
          setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };

        this.ws.onerror = (err) => {
          this.error(`WebSocket error: ${err.message || err}`);
        };
      } catch (err) {
        this.error(`Failed to open WebSocket: ${err.message}. Retrying...`);
        if (this.running) {
          setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        }
      }
    };

    await connect();
  }

  advanceLastCheckedTs(ts) {
    if (ts && parseFloat(ts) > parseFloat(this.lastCheckedTs)) {
      this.lastCheckedTs = ts;
    }
  }

  clearWsTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  detachSocket(ws) {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {}
  }

  scheduleReconnect(delayMs) {
    if (this.wsReconnectTimer) return;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectUserSessionSocket();
    }, delayMs);
  }

  enterSocketMode() {
    const wasPolling = this.mode === MODE.POLLING;

    this.wsAttempts = 0;
    this.wsReconnectDelay = 1000;
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    this.wsDownSince = null;
    this.pollingIsFallback = false;
    this.apiFailureStreakSince = null;

    if (this.mode !== MODE.SOCKET) {
      this.mode = MODE.SOCKET;
      if (this.wsRetryTimer) {
        clearInterval(this.wsRetryTimer);
        this.wsRetryTimer = null;
      }
      this.stopPolling();
      this.log(
        wasPolling
          ? 'WebSocket confirmed (hello). Polling fallback stopped.'
          : 'WebSocket confirmed (hello).',
      );
    }

    this.saveState();
    this.evaluateHealth();
  }

  enterPollingMode() {
    if (this.mode === MODE.POLLING) return;
    this.mode = MODE.POLLING;
    this.pollingIsFallback = true;
    this.error(
      'Giving up on WebSocket after repeated failures before hello. Falling back to Direct Smart Polling mode, ' +
        'will keep retrying the WebSocket in the background.',
    );
    this.lastCheckedTs = (Date.now() / 1000).toFixed(6);
    this.startSmartPolling();

    if (!this.wsRetryTimer) {
      this.wsRetryTimer = setInterval(() => {
        if (!this.running || this.mode !== MODE.POLLING) return;
        if (this.connecting || this.ws || this.wsReconnectTimer) return;
        this.log('Retrying WebSocket connection while Direct Smart Polling fallback is active...');
        this.wsAttempts = 0;
        this.wsReconnectDelay = 1000;
        this.connectUserSessionSocket();
      }, this.wsRetryIntervalMs);
    }

    this.saveState();
    this.evaluateHealth();
  }

  evaluateHealth() {
    if (!this.running) return;

    const now = Date.now();
    const wsDownMs = this.wsDownSince ? now - this.wsDownSince : 0;
    const apiFailingMs = this.apiFailureStreakSince ? now - this.apiFailureStreakSince : 0;
    const wsDownTooLong = wsDownMs > WS_DOWN_ALERT_THRESHOLD_MS;
    const apiFailingTooLong = apiFailingMs > API_FAILURE_ALERT_THRESHOLD_MS;
    const unhealthy = this.pollingIsFallback || wsDownTooLong || apiFailingTooLong;

    if (unhealthy && !this.alertActive) {
      const reasons = [];
      if (this.pollingIsFallback) reasons.push('running in Direct Smart Polling fallback');
      if (wsDownTooLong) reasons.push(`WebSocket has been down for ${Math.round(wsDownMs / 1000)}s`);
      if (apiFailingTooLong)
        reasons.push(`Slack API calls have been failing for ${Math.round(apiFailingMs / 1000)}s`);
      this.sendHealthAlert(`Slack daemon is unhealthy: ${reasons.join('; ')}.`, true);
    } else if (!unhealthy && this.alertActive) {
      this.sendHealthAlert('Slack daemon has recovered and is healthy again.', false);
    }
  }

  async sendHealthAlert(message, nextActiveState) {
    const prompt = `[Slack Daemon Health Alert]\n${message}`;
    try {
      const res = await this.dispatcher.notifyCoordinator(prompt);
      if (res.routed) {
        this.alertActive = nextActiveState;
        this.warn(`Health alert sent to ${res.targetAgent}: ${message}`);
      } else {
        this.warn(`Health alert not delivered (${res.reason || 'send failed'}), will retry: ${message}`);
      }
    } catch (err) {
      this.error(`Failed to send health alert, will retry: ${err.message}`);
    }
  }

  registerWsFailureBeforeHello(reason, retryAfter) {
    this.wsAttempts += 1;
    const backoffMs = retryAfter ? Math.max(this.wsReconnectDelay, retryAfter * 1000) : this.wsReconnectDelay;
    this.error(
      `Failed to establish user-session WebSocket (attempt ${this.wsAttempts}/${this.maxConnectAttempts}): ${reason}`,
    );

    if (this.wsAttempts >= this.maxConnectAttempts) {
      this.enterPollingMode();
      return;
    }

    if (this.running) {
      this.scheduleReconnect(backoffMs);
      this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 30000);
    }
  }

  async connectUserSessionSocket() {
    if (!this.running || this.connecting || this.ws || this.wsReconnectTimer) return;
    this.connecting = true;

    let ws;
    let helloReceived = false;
    let lastMessageAt = Date.now();

    const onSocketGone = (reason) => {
      if (this.ws === ws) this.ws = null;
      if (!this.wsDownSince) this.wsDownSince = Date.now();
      this.clearWsTimers();
      this.connecting = false;
      if (!this.running) return;

      if (!helloReceived) {
        this.registerWsFailureBeforeHello(reason);
        return;
      }

      this.warn(`User-session WebSocket closed. Reconnecting in ${this.wsReconnectDelay}ms...`);
      this.scheduleReconnect(this.wsReconnectDelay);
      this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 30000);
    };

    try {
      const { url, headers, selfId } = await this.client.openUserSessionSocket();
      this.apiFailureStreakSince = null;
      if (!this.running) {
        this.connecting = false;
        return;
      }

      ws = new WebSocket(url, { headers });
      this.ws = ws;

      this.watchdogTimer = setInterval(() => {
        if (this.ws === ws && Date.now() - lastMessageAt > this.idleTimeoutMs) {
          this.warn(
            `No message/handshake from Slack in ${this.idleTimeoutMs / 1000}s. Treating connection as dead.`,
          );
          this.detachSocket(ws);
          onSocketGone('watchdog timeout');
        }
      }, 10000);

      ws.onopen = () => {
        if (this.ws !== ws) return;
        lastMessageAt = Date.now();
        let pingId = 0;
        this.pingTimer = setInterval(() => {
          if (this.ws === ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', id: ++pingId }));
          }
        }, this.pingIntervalMs);
      };

      ws.onmessage = async (event) => {
        if (this.ws !== ws) return;
        lastMessageAt = Date.now();
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'hello') {
            helloReceived = true;
            this.connecting = false;
            this.log('Received hello from Slack RTM gateway.');
            if (selfId) {
              this.dispatcher.setMyUserId(selfId);
            }
            this.enterSocketMode();
            return;
          }

          if (data.type === 'pong') {
            return;
          }

          if (data.type === 'error') {
            this.error(`RTM error: ${JSON.stringify(data.error)}`);
            return;
          }

          if (data.type === 'goodbye') {
            this.warn('Received goodbye from Slack RTM gateway. Reconnecting.');
            ws.close();
            return;
          }

          if (data.type === 'message') {
            if (selfId && data.user === selfId) {
              return;
            }

            this.advanceLastCheckedTs(data.ts);
            this.recordDispatchedEvent();

            const res = await this.dispatcher.dispatch(data);
            if (res.routed) {
              this.log(`Event routed to ${res.targetAgent} (${res.type})`);
            }
          }
        } catch (err) {
          this.error(`Error processing WebSocket message: ${err.message}`);
        }
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        onSocketGone('WebSocket closed before hello');
      };

      ws.onerror = (err) => {
        if (this.ws !== ws) return;
        this.error(`User-session WebSocket error: ${err.message || err}`);
      };
    } catch (err) {
      this.connecting = false;
      if (!this.wsDownSince) this.wsDownSince = Date.now();
      if (!this.apiFailureStreakSince) this.apiFailureStreakSince = Date.now();
      this.registerWsFailureBeforeHello(err.message, err.retryAfter);
    }
  }

  async getCachedImChannels() {
    const isStale = !this.channelsCache || Date.now() - this.channelsCacheAt > CHANNELS_CACHE_TTL_MS;

    if (isStale) {
      const imList = await this.client.listChannels({ types: 'im,mpim', limit: 20 });
      this.channelsCache = imList.channels || [];
      this.channelsCacheAt = Date.now();
    }

    return this.channelsCache;
  }

  stopPolling() {
    this.pollingActive = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  startSmartPolling(baseIntervalMs = 3000) {
    if (this.pollingActive) return;
    this.pollingActive = true;

    const tick = async () => {
      if (!this.running || !this.pollingActive) return;

      let delay = baseIntervalMs;

      try {
        const channels = await this.getCachedImChannels();

        const minIntervalForBudget = Math.ceil(channels.length * (60000 / MAX_HISTORY_CALLS_PER_MINUTE));
        delay = Math.max(baseIntervalMs, minIntervalForBudget, this.pollBackoffMs);

        for (const ch of channels) {
          try {
            const hist = await this.client.getHistory({
              channel: ch.id,
              oldest: this.lastCheckedTs,
              limit: 5,
            });

            const messages = (hist.messages || []).reverse();
            for (const msg of messages) {
              this.advanceLastCheckedTs(msg.ts);
              this.recordDispatchedEvent();

              msg.channel = ch.id;
              const res = await this.dispatcher.dispatch(msg);
              if (res.routed) {
                this.log(`Polled DM routed to ${res.targetAgent} (${res.type})`);
              }
            }
          } catch (err) {
            if (err.retryAfter) throw err;
          }
        }

        this.pollBackoffMs = Math.floor(this.pollBackoffMs / 2);
        this.apiFailureStreakSince = null;
      } catch (err) {
        if (this.pollingActive && !this.apiFailureStreakSince) this.apiFailureStreakSince = Date.now();

        if (err.retryAfter) {
          delay = err.retryAfter * 1000;
          this.pollBackoffMs = delay;
          this.warn(`Rate limited. Backing off for ${delay}ms.`);
        } else {
          delay = Math.min(Math.max(this.pollBackoffMs, baseIntervalMs) * 2, 60000);
          this.pollBackoffMs = delay;
          this.error(`Poll error: ${err.message}`);
        }
      }

      if (this.running && this.pollingActive) {
        this.pollTimer = setTimeout(tick, delay);
      } else {
        this.pollTimer = null;
      }
    };

    tick();
  }

  stop() {
    this.running = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.clearWsTimers();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.wsRetryTimer) {
      clearInterval(this.wsRetryTimer);
      this.wsRetryTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.stopPolling();
    clearStateFile(this.stateFile);
    this.log('Listener stopped.');
  }
}
