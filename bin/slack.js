#!/usr/bin/env node

import { SlackClient } from '../src/slack-client.js';
import { SubscriptionRegistry } from '../src/subscriptions.js';
import { EventDispatcher } from '../src/dispatcher.js';
import { SocketListener } from '../src/socket-listener.js';
import { McpServer } from '../src/mcp.js';
import { loadConfig, saveConfig, getConfigPath } from '../src/config.js';
import { isDaemonRunning, isPidAlive, clearState } from '../src/daemon-state.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const command = args[0] || 'help';

function parseFlags(rawArgs) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (rawArgs[i + 1] && !rawArgs[i + 1].startsWith('--')) {
        flags[key] = rawArgs[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function printHelp() {
  console.log(`
slack-agent-router (slack) - Unified Slack CLI, Real-Time Router & MCP Server for AI Fleets

USAGE:
  slack <command> [arguments...] [options...]

COMMANDS:
  send <channel> <text>            Send a message to a channel, DM, or thread
                                   Options: --thread <ts>

  history <channel>                View recent message history
                                   Options: --limit <n> (default: 20)

  thread <channel> <ts>            View replies in a thread
                                   Options: --limit <n> (default: 50)

  search <query>                   Search messages across workspace
                                   Options: --count <n> (default: 20)

  react <channel> <ts> <emoji>     Add an emoji reaction (without colons, e.g. thumbsup)

  whoami                           Test authentication and print current user / team

  subscribe                        Subscribe a Paseo agent to receive new messages
                                   Options: --agent <id> [--channel <ch>] [--thread <ts>] [--from <user>]

  unsubscribe                      Remove an active subscription
                                   Options: --thread <ts> | --id <id> | --agent <id>

  subscriptions (subs)             List all active subscriptions & current coordinator

  set-coordinator <agent-id>       Set the default Coordinator Paseo Agent (pass 'none' or --clear to unset)

  unset-coordinator                Clear the default Coordinator Paseo Agent

  daemon                           Start the real-time event router daemon (WebSocket/Smart Poll)
  daemon stop                      Stop the running daemon (SIGTERM, waits for exit)
  daemon status                    Print daemon pid, running, startedAt, mode, last event time, events dispatched

  mcp                              Run the stdio MCP server for Paseo / Claude / Antigravity

  api <method> [key=value...]      Call any Slack Web API method directly (e.g. users.info user=U123)

  config [key=value...]            View or update configuration
                                   (Config file: ${getConfigPath()})

EXAMPLES:
  slack send C12345 "Deployment finished successfully"
  slack send C12345 "Fixed the test issue" --thread 1727200000.123
  slack subscribe --agent 2a4279a --thread 1727200000.123
  slack set-coordinator afe3e85b-e376-4b7f-a10b-5970ced5b432
  slack daemon
`);
}

async function main() {
  const { flags, positional } = parseFlags(args.slice(1));
  const client = new SlackClient();
  const registry = new SubscriptionRegistry();

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h': {
        printHelp();
        break;
      }

      case 'whoami': {
        const auth = await client.authTest();
        console.log(`User: ${auth.user} (${auth.user_id})`);
        console.log(`Team: ${auth.team} (${auth.team_id})`);
        console.log(`URL:  ${auth.url}`);
        break;
      }

      case 'send': {
        const channel = positional[0];
        const text = positional[1];
        if (!channel || !text) {
          console.error('Error: channel and text are required. Usage: slack send <channel> "<text>"');
          process.exit(1);
        }

        const res = await client.postMessage({
          channel,
          text,
          thread_ts: flags.thread || flags.thread_ts,
        });

        if (flags.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`Message sent to ${res.channel} (ts: ${res.ts})`);
        }
        break;
      }

      case 'history': {
        const channel = positional[0];
        if (!channel) {
          console.error('Error: channel is required. Usage: slack history <channel>');
          process.exit(1);
        }

        const limit = parseInt(flags.limit, 10) || 20;
        const res = await client.getHistory({ channel, limit });

        if (flags.json) {
          console.log(JSON.stringify(res.messages, null, 2));
        } else {
          const messages = (res.messages || []).reverse();
          for (const msg of messages) {
            console.log(`[${msg.ts}] <${msg.user || 'bot'}> ${msg.text}`);
          }
        }
        break;
      }

      case 'thread': {
        const channel = positional[0];
        const ts = positional[1];
        if (!channel || !ts) {
          console.error('Error: channel and ts are required. Usage: slack thread <channel> <ts>');
          process.exit(1);
        }

        const limit = parseInt(flags.limit, 10) || 50;
        const res = await client.getReplies({ channel, ts, limit });

        if (flags.json) {
          console.log(JSON.stringify(res.messages, null, 2));
        } else {
          for (const msg of res.messages || []) {
            console.log(`[${msg.ts}] <${msg.user || 'bot'}> ${msg.text}`);
          }
        }
        break;
      }

      case 'search': {
        const query = positional.join(' ');
        if (!query) {
          console.error('Error: query is required. Usage: slack search "<query>"');
          process.exit(1);
        }

        const count = parseInt(flags.count, 10) || 20;
        const res = await client.searchMessages({ query, count });

        if (flags.json) {
          console.log(JSON.stringify(res.messages, null, 2));
        } else {
          const matches = res.messages?.matches || [];
          console.log(`Found ${matches.length} matching messages:`);
          for (const m of matches) {
            console.log(`- [${m.channel?.name || m.channel?.id}] <${m.username || m.user}>: ${m.text}`);
          }
        }
        break;
      }

      case 'react': {
        const channel = positional[0];
        const timestamp = positional[1];
        const emoji = positional[2];
        if (!channel || !timestamp || !emoji) {
          console.error('Error: Usage: slack react <channel> <timestamp> <emoji>');
          process.exit(1);
        }

        await client.addReaction({ channel, timestamp, name: emoji.replace(/:/g, '') });
        console.log(`Reaction :${emoji}: added to message ${timestamp}`);
        break;
      }

      case 'subscribe': {
        const agentId = flags.agent || flags.agent_id || positional[0];
        if (!agentId) {
          console.error('Error: --agent <id> is required.');
          process.exit(1);
        }

        const sub = registry.add({
          agentId,
          channel: flags.channel,
          thread_ts: flags.thread || flags.thread_ts,
          sender: flags.from || flags.sender,
        });

        console.log(`Subscribed agent ${sub.agentId} (ID: ${sub.id})`);
        if (sub.thread_ts) console.log(`  Thread: ${sub.thread_ts}`);
        if (sub.channel) console.log(`  Channel: ${sub.channel}`);
        break;
      }

      case 'unsubscribe': {
        const count = registry.remove({
          id: flags.id,
          thread_ts: flags.thread || flags.thread_ts,
          agentId: flags.agent || flags.agent_id,
        });
        console.log(`Removed ${count} subscription(s).`);
        break;
      }

      case 'subscriptions':
      case 'subs': {
        const coordinator = registry.getCoordinator();
        const subs = registry.list();

        console.log(`Coordinator Agent: ${coordinator || '(none configured)'}`);
        console.log(`Active Subscriptions (${subs.length}):`);
        for (const s of subs) {
          console.log(
            `- [${s.id}] Agent: ${s.agentId} | Channel: ${s.channel || '*'} | Thread: ${s.thread_ts || '*'} | Sender: ${s.sender || '*'}`,
          );
        }
        break;
      }

      case 'unset-coordinator':
      case 'clear-coordinator': {
        registry.setCoordinator(null);
        console.log('Coordinator agent cleared.');
        break;
      }

      case 'set-coordinator': {
        const agentId = positional[0] || flags.agent;
        if (!agentId || agentId === 'none' || agentId === 'clear' || flags.clear) {
          registry.setCoordinator(null);
          console.log('Coordinator agent cleared.');
          break;
        }
        registry.setCoordinator(agentId);
        console.log(`Coordinator agent set to: ${agentId}`);
        break;
      }

      case 'daemon': {
        const subCmd = positional[0] || 'start';
        const stateFile = flags['state-file'];

        if (subCmd === 'status') {
          const running = isDaemonRunning(stateFile);
          if (!running) {
            console.log(
              JSON.stringify({ running: false, activeSubscriptions: registry.list().length }, null, 2),
            );
            break;
          }
          console.log(JSON.stringify(running, null, 2));
          break;
        }

        if (subCmd === 'stop') {
          const running = isDaemonRunning(stateFile);
          if (!running) {
            clearState(stateFile);
            console.log('No active daemon was running.');
            break;
          }

          process.kill(running.pid, 'SIGTERM');
          const deadline = Date.now() + 10000;
          while (isPidAlive(running.pid) && Date.now() < deadline) {
            await sleep(200);
          }

          if (isPidAlive(running.pid)) {
            console.error(`Daemon PID ${running.pid} did not exit within 10s.`);
            process.exit(1);
          }
          clearState(stateFile);
          console.log(`Stopped Slack daemon PID ${running.pid}`);
          break;
        }

        const alreadyRunning = isDaemonRunning(stateFile);
        if (alreadyRunning) {
          console.error(
            `A Slack daemon is already running (PID ${alreadyRunning.pid}). Use 'slack daemon stop' first.`,
          );
          process.exit(1);
        }

        const dispatcher = new EventDispatcher({ registry, config: client.config });
        if (flags['dry-run']) {
          dispatcher.sendToPaseo = async (agentId, prompt) => {
            console.log(`[dry-run] Would dispatch to ${agentId}:\n${prompt}`);
            return { success: true, stdout: '', stderr: '' };
          };
        }
        const listener = new SocketListener({ client, dispatcher, ...(stateFile ? { stateFile } : {}) });

        process.on('SIGINT', () => {
          listener.stop();
          process.exit(0);
        });
        process.on('SIGTERM', () => {
          listener.stop();
          process.exit(0);
        });

        console.log('Starting slack-agent-router daemon...');
        await listener.start();
        break;
      }

      case 'mcp': {
        const server = new McpServer({ client, registry });
        server.startStdio();
        break;
      }

      case 'api': {
        const method = positional[0];
        if (!method) {
          console.error('Error: API method required. Usage: slack api <method> [key=value...]');
          process.exit(1);
        }

        const params = {};
        for (let i = 1; i < positional.length; i++) {
          const [k, v] = positional[i].split('=');
          if (k && v !== undefined) {
            params[k] = v;
          }
        }
        for (const [k, v] of Object.entries(flags)) {
          params[k] = v;
        }

        const res = await client.call(method, params);
        console.log(JSON.stringify(res, null, 2));
        break;
      }

      case 'config': {
        if (positional.length === 0 && Object.keys(flags).length === 0) {
          console.log(JSON.stringify(loadConfig(), null, 2));
        } else {
          const updates = {};
          for (const item of positional) {
            const [k, v] = item.split('=');
            if (k && v !== undefined) updates[k] = v;
          }
          for (const [k, v] of Object.entries(flags)) {
            updates[k] = v;
          }
          const saved = saveConfig(updates);
          console.log('Updated configuration:');
          console.log(JSON.stringify(saved, null, 2));
        }
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
