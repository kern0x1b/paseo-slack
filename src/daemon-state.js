import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export const DEFAULT_STATE_FILE = path.join(os.homedir(), '.config', 'slack-router', 'daemon-state.json');

export function readState(stateFile = DEFAULT_STATE_FILE) {
  if (!fs.existsSync(stateFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

export function saveState(state, stateFile = DEFAULT_STATE_FILE) {
  try {
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

export function clearState(stateFile = DEFAULT_STATE_FILE) {
  try {
    if (fs.existsSync(stateFile)) {
      fs.unlinkSync(stateFile);
    }
  } catch {}
}

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getProcessCommand(pid) {
  if (!pid) return null;
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function isDaemonProcess(pid) {
  if (!isPidAlive(pid)) return false;
  const command = getProcessCommand(pid);
  return Boolean(command && command.includes('slack') && command.includes('daemon'));
}

export function isDaemonRunning(stateFile = DEFAULT_STATE_FILE) {
  const state = readState(stateFile);
  return state && isDaemonProcess(state.pid) ? state : null;
}
