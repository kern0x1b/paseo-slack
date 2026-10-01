import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'slack-router');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
      fileConfig = {};
    }
  }

  return {
    xoxpToken: process.env.SLACK_XOXP_TOKEN || process.env.SLACK_USER_TOKEN || fileConfig.xoxpToken || '',
    xoxcToken: process.env.SLACK_XOXC_TOKEN || fileConfig.xoxcToken || '',
    cookieD: process.env.SLACK_COOKIE_D || process.env.SLACK_XOXD_TOKEN || fileConfig.cookieD || '',
    appToken: process.env.SLACK_APP_TOKEN || fileConfig.appToken || '',
    coordinatorAgentId: process.env.SLACK_COORDINATOR_AGENT_ID || fileConfig.coordinatorAgentId || '',
    paseoBin:
      process.env.PASEO_CLI ||
      fileConfig.paseoBin ||
      (process.env.HOME ? path.join(process.env.HOME, '.local', 'bin', 'paseo') : 'paseo'),
  };
}

export function saveConfig(updates) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const current = loadConfig();
  const merged = { ...current, ...updates };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}
