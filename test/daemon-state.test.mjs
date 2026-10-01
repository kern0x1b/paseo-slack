import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  readState,
  saveState,
  clearState,
  isPidAlive,
  isDaemonProcess,
  isDaemonRunning,
} from '../src/daemon-state.js';

function tempStateFile() {
  return path.join(os.tmpdir(), `slack-router-test-state-${process.pid}-${Date.now()}-${Math.random()}.json`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnFakeDaemonProcess(t) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);', 'slack', 'daemon'], {
    stdio: 'ignore',
  });
  t.after(() => {
    try {
      child.kill('SIGKILL');
    } catch {}
  });
  return child;
}

function spawnUnrelatedProcess(t) {
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  t.after(() => {
    try {
      child.kill('SIGKILL');
    } catch {}
  });
  return child;
}

test('isDaemonRunning refuses to report a daemon for a missing state file', () => {
  const stateFile = tempStateFile();
  assert.equal(readState(stateFile), null);
  assert.equal(isDaemonRunning(stateFile), null);
});

test('isDaemonRunning reports the daemon running when the recorded pid is alive and looks like this daemon', async (t) => {
  const stateFile = tempStateFile();
  t.after(() => clearState(stateFile));

  const child = spawnFakeDaemonProcess(t);
  await wait(50);

  saveState({ pid: child.pid, running: true, mode: 'socket' }, stateFile);

  const running = isDaemonRunning(stateFile);
  assert.ok(running, 'a live pid whose command line matches must be reported as running');
  assert.equal(running.pid, child.pid);
  assert.equal(running.mode, 'socket');
});

test('isDaemonRunning treats a dead pid as not running', (t) => {
  const stateFile = tempStateFile();
  t.after(() => clearState(stateFile));

  const deadFakePid = 999999;
  assert.equal(isPidAlive(deadFakePid), false);

  saveState({ pid: deadFakePid, running: true, mode: 'socket' }, stateFile);
  assert.equal(isDaemonRunning(stateFile), null, 'a dead pid must not be reported as running');

  assert.ok(readState(stateFile));
});

test('a stale pid reused by an unrelated process is not reported as, or treated as, the daemon', async (t) => {
  const stateFile = tempStateFile();
  t.after(() => clearState(stateFile));

  const strangerProcess = spawnUnrelatedProcess(t);
  await wait(50);

  assert.equal(isPidAlive(strangerProcess.pid), true, 'the stranger process is genuinely alive');
  assert.equal(
    isDaemonProcess(strangerProcess.pid),
    false,
    'a plain `sleep` must not be identified as the daemon',
  );

  saveState({ pid: strangerProcess.pid, running: true, mode: 'socket' }, stateFile);

  const running = isDaemonRunning(stateFile);
  assert.equal(
    running,
    null,
    'a live but unrelated pid must be treated as a stale state file, not a running daemon',
  );

  assert.equal(isPidAlive(strangerProcess.pid), true, 'the unrelated process must still be alive, untouched');
});

test('clearState removes the state file', () => {
  const stateFile = tempStateFile();
  saveState({ pid: process.pid, running: true }, stateFile);
  assert.ok(fs.existsSync(stateFile));

  clearState(stateFile);
  assert.equal(fs.existsSync(stateFile), false);
  assert.equal(readState(stateFile), null);
});
