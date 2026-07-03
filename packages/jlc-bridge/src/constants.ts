import * as extensionConfig from '../extension.json';

export const APP_NAME = String((extensionConfig as any).displayName || 'JLC Bridge');
export const APP_VERSION = String((extensionConfig as any).version || '0.0.0');
export const BRIDGE_DIR = 'C:\\Users\\0\\.openclaw\\workspace\\jlc-bridge';
export const COMMAND_FILE = `${BRIDGE_DIR}\\command.json`;
export const RESULT_FILE = `${BRIDGE_DIR}\\result.json`;
export const LOG_FILE = `${BRIDGE_DIR}\\bridge.log`;
export const POLL_INTERVAL_MS = 500;
export const ENABLED_STORAGE_KEY = 'jlcBridgeEnabled';
export const TIMER_ID = 'jlc_bridge_poll_loop';

// ─── WebSocket constants ───
export const WS_URL = 'ws://127.0.0.1:18800/ws/bridge';
export const WS_RECONNECT_MS = 3000;
export const EDA_WS_ID = 'jlc_bridge_ws';

export type BridgeCommand = {
  id: string;
  action: string;
  params: Record<string, any>;
  timestamp: number;
};

export type BridgeResult = {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  durationMs?: number;
};
