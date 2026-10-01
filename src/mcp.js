import readline from 'node:readline';
import { SlackClient } from './slack-client.js';
import { SubscriptionRegistry } from './subscriptions.js';

export class McpServer {
  constructor({ client = new SlackClient(), registry = new SubscriptionRegistry() } = {}) {
    this.client = client;
    this.registry = registry;
  }

  getTools() {
    return [
      {
        name: 'slack_send_message',
        description: 'Send a message to a Slack channel, user DM, or thread.',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID or User DM ID' },
            text: { type: 'string', description: 'Message text' },
            thread_ts: { type: 'string', description: 'Optional parent thread timestamp' },
          },
          required: ['channel', 'text'],
        },
      },
      {
        name: 'slack_subscribe',
        description: 'Subscribe a Paseo agent to receive new Slack messages for a channel, thread, or user.',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Paseo agent ID to route messages to' },
            channel: { type: 'string', description: 'Optional channel ID filter' },
            thread_ts: { type: 'string', description: 'Optional thread timestamp filter' },
            sender: { type: 'string', description: 'Optional sender user ID filter' },
          },
          required: ['agent_id'],
        },
      },
      {
        name: 'slack_unsubscribe',
        description: 'Remove an existing subscription.',
        inputSchema: {
          type: 'object',
          properties: {
            thread_ts: { type: 'string', description: 'Thread timestamp to unsubscribe from' },
            id: { type: 'string', description: 'Subscription ID' },
            agent_id: { type: 'string', description: 'Agent ID to remove all subscriptions for' },
          },
        },
      },
      {
        name: 'slack_list_subscriptions',
        description: 'List all active Slack subscriptions and the coordinator agent ID.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'slack_set_coordinator',
        description:
          'Set the default Coordinator Paseo Agent that receives all unmatched incoming DMs and mentions.',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'Paseo Agent ID for the coordinator' },
          },
          required: ['agent_id'],
        },
      },
      {
        name: 'slack_search_messages',
        description: 'Search messages across Slack workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            count: { type: 'number', description: 'Max results (default 20)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'slack_get_history',
        description: 'Get recent message history from a channel or DM.',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID' },
            limit: { type: 'number', description: 'Max messages (default 20)' },
          },
          required: ['channel'],
        },
      },
      {
        name: 'slack_get_replies',
        description: 'Get all replies in a specific message thread.',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID' },
            thread_ts: { type: 'string', description: 'Thread parent timestamp' },
          },
          required: ['channel', 'thread_ts'],
        },
      },
      {
        name: 'slack_add_reaction',
        description: 'Add an emoji reaction to a message.',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel ID' },
            timestamp: { type: 'string', description: 'Message timestamp' },
            emoji: { type: 'string', description: 'Emoji name (without colons, e.g. thumbsup)' },
          },
          required: ['channel', 'timestamp', 'emoji'],
        },
      },
      {
        name: 'slack_api_call',
        description: 'Call any Slack Web API method directly.',
        inputSchema: {
          type: 'object',
          properties: {
            method: { type: 'string', description: 'API method name (e.g. users.info)' },
            params: { type: 'object', description: 'JSON parameters' },
          },
          required: ['method'],
        },
      },
    ];
  }

  async handleToolCall(name, args) {
    switch (name) {
      case 'slack_send_message': {
        const res = await this.client.postMessage({
          channel: args.channel,
          text: args.text,
          thread_ts: args.thread_ts,
        });
        return { channel: res.channel, ts: res.ts, message: res.message };
      }
      case 'slack_subscribe': {
        const sub = this.registry.add({
          agentId: args.agent_id,
          channel: args.channel,
          thread_ts: args.thread_ts,
          sender: args.sender,
        });
        return { status: 'subscribed', subscription: sub };
      }
      case 'slack_unsubscribe': {
        const removed = this.registry.remove({
          thread_ts: args.thread_ts,
          id: args.id,
          agentId: args.agent_id,
        });
        return { status: 'unsubscribed', count: removed };
      }
      case 'slack_list_subscriptions': {
        return {
          coordinator: this.registry.getCoordinator(),
          subscriptions: this.registry.list(),
        };
      }
      case 'slack_set_coordinator': {
        this.registry.setCoordinator(args.agent_id);
        return { status: 'coordinator_updated', coordinator: args.agent_id };
      }
      case 'slack_search_messages': {
        const res = await this.client.searchMessages({
          query: args.query,
          count: args.count || 20,
        });
        return res.messages;
      }
      case 'slack_get_history': {
        const res = await this.client.getHistory({
          channel: args.channel,
          limit: args.limit || 20,
        });
        return res.messages;
      }
      case 'slack_get_replies': {
        const res = await this.client.getReplies({
          channel: args.channel,
          ts: args.thread_ts,
        });
        return res.messages;
      }
      case 'slack_add_reaction': {
        await this.client.addReaction({
          channel: args.channel,
          timestamp: args.timestamp,
          name: args.emoji,
        });
        return { status: 'reaction_added' };
      }
      case 'slack_api_call': {
        return this.client.call(args.method, args.params || {});
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  startStdio() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    const sendResponse = (resp) => {
      process.stdout.write(JSON.stringify(resp) + '\n');
    };

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const req = JSON.parse(line);
        if (req.method === 'initialize') {
          sendResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'slack-agent-router', version: '1.0.0' },
              capabilities: { tools: {} },
            },
          });
        } else if (req.method === 'notifications/initialized') {
        } else if (req.method === 'tools/list') {
          sendResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: { tools: this.getTools() },
          });
        } else if (req.method === 'tools/call') {
          const { name, arguments: args } = req.params;
          try {
            const data = await this.handleToolCall(name, args || {});
            sendResponse({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
              },
            });
          } catch (err) {
            sendResponse({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                isError: true,
                content: [{ type: 'text', text: `Tool error: ${err.message}` }],
              },
            });
          }
        } else if (req.id !== undefined) {
          sendResponse({
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32601, message: 'Method not found' },
          });
        }
      } catch (err) {
        sendResponse({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` },
        });
      }
    });
  }
}
