import { APP_NAME, BRIDGE_DIR, ENABLED_STORAGE_KEY, LOG_FILE } from './constants';

// ─── EDA access ───

export function anyEda(): any {
  return (eda as any);
}

export function toFinite(value: any, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function hasLegacyFileApi(): boolean {
  const fileApi = anyEda()?.sys_File;
  return Boolean(fileApi?.readFile && fileApi?.writeFile);
}

export function hasFileSystemApi(): boolean {
  const fsApi = anyEda()?.sys_FileSystem;
  return Boolean(fsApi?.readFileFromFileSystem && fsApi?.saveFileToFileSystem);
}

export function getFileApiMode(): string {
  const modes: string[] = [];
  if (hasLegacyFileApi()) modes.push('sys_File');
  if (hasFileSystemApi()) modes.push('sys_FileSystem');
  return modes.length ? modes.join(' + ') : 'none';
}

// ─── File I/O ───

export async function readTextFile(filePath: string): Promise<string | undefined> {
  try {
    const fileApi = anyEda()?.sys_File;
    if (fileApi?.readFile) {
      const content = fileApi.readFile(filePath);
      if (typeof content === 'string') return content;
      return undefined;
    }
  } catch {
    // continue with fallback
  }

  try {
    const fsApi = anyEda()?.sys_FileSystem;
    if (!fsApi?.readFileFromFileSystem) return undefined;

    const file: File | undefined = await fsApi.readFileFromFileSystem(filePath);
    if (!file) return undefined;
    if (typeof file.text !== 'function') return undefined;
    return await file.text();
  } catch {
    return undefined;
  }
}

export async function writeTextFile(filePath: string, content: string): Promise<boolean> {
  try {
    const fileApi = anyEda()?.sys_File;
    if (fileApi?.writeFile) {
      fileApi.writeFile(filePath, content);
      return true;
    }
  } catch {
    // continue with fallback
  }

  try {
    const fsApi = anyEda()?.sys_FileSystem;
    if (!fsApi?.saveFileToFileSystem) return false;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const ok = await fsApi.saveFileToFileSystem(filePath, blob, undefined, true);
    return Boolean(ok);
  } catch {
    return false;
  }
}

export async function ensureBridgeDir(): Promise<void> {
  try {
    const fileApi = anyEda()?.sys_File;
    if (fileApi?.mkdir) {
      fileApi.mkdir(BRIDGE_DIR);
    }
  } catch {
    // ignore
  }
}

// ─── Dialog / notifications ───

export function showInfo(content: string, title = APP_NAME): void {
  try {
    anyEda()?.sys_Dialog?.showInformationMessage?.(content, title);
    return;
  } catch {
    // fall through
  }

  try {
    (globalThis as any).alert?.(`${title}\n${content}`);
    return;
  } catch {
    // fall through
  }

  console.log(`[${APP_NAME}] ${title}: ${content}`);
}

export function showError(title: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  showInfo(`${title}\n${message}`, APP_NAME);
  console.error(`[${APP_NAME}]`, title, error);
}

// ─── Logging ───

export function appendLog(message: string): void {
  void (async () => {
    await ensureBridgeDir();
    const line = `${new Date().toISOString()} ${message}\n`;
    const prev = (await readTextFile(LOG_FILE)) || '';
    await writeTextFile(LOG_FILE, prev + line);
  })();
}

export function log(message: string): void {
  console.log(`[${APP_NAME}] ${message}`);
  appendLog(message);
}

// ─── Preferences ───

export function readEnabledPref(): boolean {
  try {
    const raw = anyEda()?.sys_Storage?.getExtensionUserConfig?.(ENABLED_STORAGE_KEY);
    return raw === true || raw === 'true' || raw === 1;
  } catch {
    return false;
  }
}

export async function saveEnabledPref(enabled: boolean): Promise<void> {
  try {
    await anyEda()?.sys_Storage?.setExtensionUserConfig?.(ENABLED_STORAGE_KEY, enabled);
  } catch {
    // ignore
  }
}

// ─── Generic state-getter helpers ───

export function readFirstStringValue(target: any, getterNames: string[]): string {
  for (const getterName of getterNames) {
    try {
      const getter = target?.[getterName];
      if (typeof getter !== 'function') continue;
      const raw = getter.call(target);
      if (typeof raw === 'string') {
        const text = raw.trim();
        if (text) return text;
      } else if (raw !== undefined && raw !== null) {
        const text = String(raw).trim();
        if (text) return text;
      }
    } catch {
      // ignore getter errors
    }
  }
  return '';
}

export function readFirstNumberValue(target: any, getterNames: string[]): number | undefined {
  for (const getterName of getterNames) {
    try {
      const getter = target?.[getterName];
      if (typeof getter !== 'function') continue;
      const value = Number(getter.call(target));
      if (Number.isFinite(value)) return value;
    } catch {
      // ignore getter errors
    }
  }
  return undefined;
}

export function readFirstBooleanValue(target: any, getterNames: string[]): boolean | undefined {
  for (const getterName of getterNames) {
    try {
      const getter = target?.[getterName];
      if (typeof getter !== 'function') continue;
      return Boolean(getter.call(target));
    } catch {
      // ignore getter errors
    }
  }
  return undefined;
}

// ─── Misc helpers ───

export function waitMs(delay: number): Promise<void> {
  const ms = Number.isFinite(delay) && delay > 0 ? Math.floor(delay) : 0;
  if (!ms) return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (typeof setTimeout === 'function') {
      setTimeout(() => resolve(), ms);
      return;
    }

    const timerApi = anyEda()?.sys_Timer;
    if (!timerApi?.setTimeoutTimer) {
      resolve();
      return;
    }

    const timerId = `jlc_bridge_wait_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    timerApi.setTimeoutTimer(timerId, ms, () => {
      try {
        resolve();
      } finally {
        try {
          timerApi.clearTimeoutTimer?.(timerId);
        } catch {
          // ignore
        }
      }
    });
  });
}

export function encodeBase64FromArrayBuffer(buffer: ArrayBuffer): string {
  const maybeBuffer = (globalThis as any)?.Buffer;
  if (maybeBuffer?.from) {
    return maybeBuffer.from(buffer).toString('base64');
  }

  if (typeof btoa !== 'function') {
    throw new Error('base64 encoding unavailable');
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const mimeType = blob?.type || 'image/png';
  const buffer = await blob.arrayBuffer();
  const base64 = encodeBase64FromArrayBuffer(buffer);
  return `data:${mimeType};base64,${base64}`;
}
