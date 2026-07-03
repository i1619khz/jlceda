import * as extensionConfig from '../extension.json';
import {
  APP_NAME,
  APP_VERSION,
  BridgeCommand,
  BridgeResult,
  COMMAND_FILE,
  EDA_WS_ID,
  ENABLED_STORAGE_KEY,
  LOG_FILE,
  POLL_INTERVAL_MS,
  RESULT_FILE,
  TIMER_ID,
  WS_RECONNECT_MS,
  WS_URL,
} from './constants';
import {
  anyEda,
  ensureBridgeDir,
  getFileApiMode,
  log,
  readEnabledPref,
  readTextFile,
  saveEnabledPref,
  showError,
  showInfo,
  writeTextFile,
} from './util';
import { executeCommand } from './commands';
import { getPCBState } from './pcb';

// ─── Runtime state ───

let bridgeEnabled = false;
let nativeIntervalHandle: ReturnType<typeof setInterval> | null = null;
let usingNativeTimer = false;
let usingSysTimer = false;
let lastCommandTime = 0;
let pollInProgress = false;

// ─── WebSocket state ───
let wsConnection: WebSocket | null = null;
let wsConnected = false;
let wsReconnectHandle: ReturnType<typeof setTimeout> | null = null;
let usingSysWs = false;

function getTimerMode(): string {
  if (usingSysTimer) return 'sys_Timer';
  if (usingNativeTimer) return 'setInterval';
  return 'none';
}

// re-export for status helper used in util-style queries (kept here because it depends on runtime state)
export { getFileApiMode };

// ─── File-polling transport ───

async function readCommand(): Promise<BridgeCommand | null> {
  const content = await readTextFile(COMMAND_FILE);
  if (!content || !content.trim()) return null;

  try {
    const cmd = JSON.parse(content) as BridgeCommand;
    if (!cmd || typeof cmd.timestamp !== 'number') return null;
    if (cmd.timestamp <= lastCommandTime) return null;
    return cmd;
  } catch {
    return null;
  }
}

async function clearCommand(): Promise<void> {
  await writeTextFile(COMMAND_FILE, '');
}

async function writeResult(result: BridgeResult): Promise<void> {
  await writeTextFile(RESULT_FILE, JSON.stringify(result, null, 2));
}

async function pollOnce(): Promise<void> {
  if (!bridgeEnabled || pollInProgress) return;

  pollInProgress = true;
  try {
    const cmd = await readCommand();
    if (!cmd) return;

    lastCommandTime = cmd.timestamp;
    await clearCommand();
    const result = await executeCommand(cmd);
    await writeResult(result);
    log(`command done: ${cmd.action} -> ${result.success ? 'ok' : 'fail'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`poll error: ${message}`);
  } finally {
    pollInProgress = false;
  }
}

function startNativeInterval(): boolean {
  if (nativeIntervalHandle) return true;
  if (typeof setInterval !== 'function') return false;

  nativeIntervalHandle = setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);

  usingNativeTimer = true;
  usingSysTimer = false;
  return true;
}

function startSysInterval(): boolean {
  const timerApi = anyEda()?.sys_Timer;
  if (!timerApi?.setIntervalTimer) return false;

  const ok = timerApi.setIntervalTimer(TIMER_ID, POLL_INTERVAL_MS, () => {
    void pollOnce();
  });

  if (!ok) return false;

  usingNativeTimer = false;
  usingSysTimer = true;
  return true;
}

function stopIntervals(): void {
  if (nativeIntervalHandle) {
    try {
      clearInterval(nativeIntervalHandle);
    } catch {
      // ignore
    }
    nativeIntervalHandle = null;
  }

  if (usingSysTimer) {
    try {
      anyEda()?.sys_Timer?.clearIntervalTimer?.(TIMER_ID);
    } catch {
      // ignore
    }
  }

  usingNativeTimer = false;
  usingSysTimer = false;
}

async function ensureBridgeFiles(): Promise<void> {
  await ensureBridgeDir();
  const existing = await readTextFile(COMMAND_FILE);
  if (existing === undefined) {
    await writeTextFile(COMMAND_FILE, '');
  }
}

// ─── WebSocket transport ───

function wsCleanup(): void {
  if (wsReconnectHandle) {
    clearTimeout(wsReconnectHandle);
    wsReconnectHandle = null;
  }
  if (usingSysWs) {
    try { anyEda()?.sys_WebSocket?.close?.(EDA_WS_ID); } catch { /* ignore */ }
  }
  if (wsConnection) {
    try { wsConnection.close(); } catch { /* ignore */ }
    wsConnection = null;
  }
  wsConnected = false;
  usingSysWs = false;
}

function wsSend(data: Record<string, unknown>): void {
  const json = JSON.stringify(data);
  if (usingSysWs && wsConnected) {
    try { anyEda()?.sys_WebSocket?.send?.(EDA_WS_ID, json); return; } catch { /* fallthrough */ }
  }
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) return;
  try { wsConnection.send(json); } catch { /* ignore */ }
}

function wsPushEvent(event: string, payload?: Record<string, unknown>): void {
  wsSend({ type: 'event', event, data: payload ?? {} });
}

async function handleWsMessage(raw: string): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg?.type === 'ping') {
    wsSend({ type: 'pong', id: msg.id, timestamp: Date.now(), payload: null });
    return;
  }

  if (msg?.type === 'command') {
    const action = msg.action ?? msg.payload?.action;
    const params = msg.params ?? msg.payload?.params ?? {};
    const cmdId = msg.id;
    if (!action || !cmdId) return;

    const cmd: BridgeCommand = {
      id: cmdId,
      action,
      params,
      timestamp: msg.timestamp ?? Date.now(),
    };
    lastCommandTime = cmd.timestamp;
    const result = await executeCommand(cmd);

    wsSend({
      type: 'result',
      id: cmdId,
      timestamp: Date.now(),
      payload: {
        commandId: cmdId,
        success: result.success,
        data: result.data,
        error: result.error,
        durationMs: result.durationMs,
      },
    });
    log(`ws command done: ${cmd.action} -> ${result.success ? 'ok' : 'fail'}`);
  }
}

function scheduleWsReconnect(): void {
  if (wsReconnectHandle || !bridgeEnabled) return;
  wsReconnectHandle = setTimeout(() => {
    wsReconnectHandle = null;
    if (bridgeEnabled) {
      void connectWebSocket();
    }
  }, WS_RECONNECT_MS);
}

async function connectWebSocket(): Promise<boolean> {
  const sysWs = anyEda()?.sys_WebSocket;
  if (sysWs?.register) {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => { resolve(false); }, 5000);
      try {
        sysWs.register(
          EDA_WS_ID,
          WS_URL,
          (ev: MessageEvent) => {
            const data = typeof ev.data === 'string' ? ev.data : '';
            if (data) void handleWsMessage(data);
          },
          () => {
            clearTimeout(timeout);
            usingSysWs = true;
            wsConnection = null;
            wsConnected = true;
            stopIntervals();
            log('ws connected via sys_WebSocket, file polling stopped');
            wsSend({ type: 'hello', name: APP_NAME, version: APP_VERSION });
            resolve(true);
          },
        );
      } catch (e) {
        clearTimeout(timeout);
        log(`sys_WebSocket failed: ${e instanceof Error ? e.message : String(e)}`);
        resolve(false);
      }
    });
  }

  if (typeof WebSocket === 'undefined') return false;

  return new Promise<boolean>((resolve) => {
    try {
      const ws = new WebSocket(WS_URL);

      const timeout = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        resolve(false);
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        wsConnection = ws;
        wsConnected = true;
        usingSysWs = false;

        stopIntervals();
        log('ws connected via native WebSocket, file polling stopped');

        wsSend({ type: 'hello', name: APP_NAME, version: APP_VERSION });
        resolve(true);
      };

      ws.onmessage = (ev) => {
        const data = typeof ev.data === 'string' ? ev.data : '';
        if (data) void handleWsMessage(data);
      };

      ws.onclose = () => {
        clearTimeout(timeout);
        const wasConnected = wsConnected;
        wsConnection = null;
        wsConnected = false;

        if (wasConnected && bridgeEnabled) {
          log('ws disconnected, falling back to file polling');
          const timerStarted = startSysInterval() || startNativeInterval();
          if (!timerStarted) {
            log('warning: could not restart file polling after ws disconnect');
          }
        }

        scheduleWsReconnect();

        if (!wasConnected) resolve(false);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
      };
    } catch {
      resolve(false);
    }
  });
}

// ─── Polling lifecycle ───

async function startPolling(silent = false): Promise<void> {
  if (bridgeEnabled) return;

  await ensureBridgeFiles();
  bridgeEnabled = true;

  const wsOk = await connectWebSocket();
  if (wsOk) {
    await saveEnabledPref(true);
    log(`bridge enabled (WebSocket)`);
    if (!silent) {
      showInfo([
        'Bridge enabled (WebSocket)',
        `WS endpoint: ${WS_URL}`,
        `Fallback: file polling`,
      ].join('\n'));
    }
    return;
  }

  const timerStarted = startSysInterval() || startNativeInterval();
  if (!timerStarted) {
    bridgeEnabled = false;
    throw new Error('no available timer API (sys_Timer/setInterval)');
  }

  scheduleWsReconnect();

  await saveEnabledPref(true);
  log(`bridge enabled (${getTimerMode()}, ws reconnecting in background)`);

  if (!silent) {
    showInfo([
      'Bridge enabled (file polling)',
      `Command file: ${COMMAND_FILE}`,
      `Result file: ${RESULT_FILE}`,
      `Poll interval: ${POLL_INTERVAL_MS}ms`,
      `Timer: ${getTimerMode()}`,
      `File API: ${getFileApiMode()}`,
      `WS: reconnecting in background...`,
    ].join('\n'));
  }
}

async function stopPolling(silent = false): Promise<void> {
  wsCleanup();
  stopIntervals();
  bridgeEnabled = false;
  await saveEnabledPref(false);
  log('bridge disabled');

  if (!silent) {
    showInfo('Bridge disabled');
  }
}

// ─── Menu actions ───

export function toggleBridge(): void {
  log('toggleBridge clicked');
  void (async () => {
    const enabled = bridgeEnabled || readEnabledPref();
    if (enabled) {
      await stopPolling();
      return;
    }

    try {
      await startPolling();
    } catch (error) {
      showError('Failed to enable bridge', error);
    }
  })();
}

export function showStatus(): void {
  log('showStatus clicked');
  void (async () => {
    const persisted = readEnabledPref();

    if (persisted && !bridgeEnabled) {
      try {
        await startPolling(true);
      } catch {
        // keep reporting stopped below
      }
    }

    const runtime = bridgeEnabled ? 'running' : 'stopped';
    const transport = wsConnected ? 'WebSocket' : (bridgeEnabled ? `file polling (${getTimerMode()})` : 'none');
    const lines = [
      `Version: ${APP_VERSION}`,
      `Runtime: ${runtime}`,
      `Transport: ${transport}`,
      `Persisted enabled: ${persisted ? 'yes' : 'no'}`,
      `WS: ${wsConnected ? 'connected' : 'disconnected'}`,
      `WS endpoint: ${WS_URL}`,
      `Last command time: ${lastCommandTime || '(none)'}`,
    ];
    showInfo(lines.join('\n'), `${APP_NAME} Status`);
  })();
}

export async function testCommand(): Promise<void> {
  log('testCommand clicked');
  try {
    showInfo('Reading PCB state...', `${APP_NAME} Test`);
    const state = await getPCBState();
    const preview = state.components
      .slice(0, 5)
      .map((c: any) => `${c.designator}: (${c.x.toFixed(1)}, ${c.y.toFixed(1)})`);

    showInfo(
      [
        'Test success',
        `Components: ${state.components.length}`,
        `Nets: ${state.nets.length}`,
        `Bounds: (${state.boardBounds.minX.toFixed(1)}, ${state.boardBounds.minY.toFixed(1)}) - (${state.boardBounds.maxX.toFixed(1)}, ${state.boardBounds.maxY.toFixed(1)})`,
        '',
        'Top 5 components:',
        ...preview,
      ].join('\n'),
      `${APP_NAME} Test`,
    );
  } catch (error) {
    showError('Test failed', error);
  }
}

// ─── EDA event push via WebSocket ───

export function notifyPcbChanged(detail?: Record<string, unknown>): void {
  if (!wsConnected) return;
  wsPushEvent('pcb_changed', detail);
}

export function notifySelectionChanged(detail?: Record<string, unknown>): void {
  if (!wsConnected) return;
  wsPushEvent('selection_changed', detail);
}

export function activate(_status?: 'onStartupFinished', _arg?: string): void {
  void (async () => {
    try {
      await anyEda()?.sys_HeaderMenu?.replaceHeaderMenus?.((extensionConfig as any).headerMenus);
    } catch (error) {
      console.error(`[${APP_NAME}] replaceHeaderMenus failed`, error);
    }

    log(`plugin loaded (v${APP_VERSION})`);

    if (readEnabledPref()) {
      try {
        await startPolling(true);
        log('bridge auto-restored to running state');
      } catch (error) {
        showError('Auto-restore bridge failed', error);
      }
    } else {
      stopIntervals();
      bridgeEnabled = false;
    }
  })();
}
