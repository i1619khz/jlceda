import { anyEda, toFinite } from './util';

export type Box = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

// ─── Number / net normalization ───

export function normalizeNetArray(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const dedup = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const net = item.trim();
      if (net) dedup.add(net);
      continue;
    }

    if (item && typeof item === 'object') {
      const netRaw = (item as any).net;
      if (typeof netRaw === 'string') {
        const net = netRaw.trim();
        if (net) dedup.add(net);
      }
    }
  }
  return Array.from(dedup);
}

export function normalizeAngle(angle: number): number {
  let value = toFinite(angle, 0);
  while (value <= -180) value += 360;
  while (value > 180) value -= 360;
  return value;
}

// ─── Box geometry ───

export function createBoxFromCenter(x: number, y: number, width: number, height: number): Box {
  const halfW = Math.max(0, toFinite(width, 0) / 2);
  const halfH = Math.max(0, toFinite(height, 0) / 2);
  return {
    minX: x - halfW,
    minY: y - halfH,
    maxX: x + halfW,
    maxY: y + halfH,
  };
}

export function isVerticalAngle(angle: number): boolean {
  const a = Math.abs(normalizeAngle(angle));
  return Math.abs(a - 90) <= 20;
}

export function estimateStringBox(x: number, y: number, text: string, fontSize: number, rotation: number): Box {
  const content = String(text || '');
  const size = Math.max(1, toFinite(fontSize, 10));
  const estimatedWidth = Math.max(size * Math.max(content.length, 1) * 0.6, size * 0.8);
  const estimatedHeight = Math.max(size, 1);
  const width = isVerticalAngle(rotation) ? estimatedHeight : estimatedWidth;
  const height = isVerticalAngle(rotation) ? estimatedWidth : estimatedHeight;
  return createBoxFromCenter(x, y, width, height);
}

export function boxIntersects(a: Box, b: Box, tolerance = 0): boolean {
  const t = Math.max(0, toFinite(tolerance, 0));
  if (a.maxX < b.minX - t) return false;
  if (a.minX > b.maxX + t) return false;
  if (a.maxY < b.minY - t) return false;
  if (a.minY > b.maxY + t) return false;
  return true;
}

export function boxInside(inner: Box, outer: Box, margin = 0): boolean {
  const m = Math.max(0, toFinite(margin, 0));
  return (
    inner.minX >= outer.minX - m &&
    inner.minY >= outer.minY - m &&
    inner.maxX <= outer.maxX + m &&
    inner.maxY <= outer.maxY + m
  );
}

// ─── Primitive bbox ───

export async function getBBoxOfPrimitive(primitive: any): Promise<Box | undefined> {
  try {
    const bbox = await anyEda()?.pcb_Primitive?.getPrimitivesBBox?.([primitive]);
    if (!bbox) return undefined;
    return {
      minX: toFinite((bbox as any).minX, NaN),
      minY: toFinite((bbox as any).minY, NaN),
      maxX: toFinite((bbox as any).maxX, NaN),
      maxY: toFinite((bbox as any).maxY, NaN),
    };
  } catch {
    return undefined;
  }
}

export function firstBox(boxes: Array<Box | undefined>): Box | undefined {
  for (const box of boxes) {
    if (!box) continue;
    const ok =
      Number.isFinite(box.minX) &&
      Number.isFinite(box.minY) &&
      Number.isFinite(box.maxX) &&
      Number.isFinite(box.maxY);
    if (ok) return box;
  }
  return undefined;
}

// ─── Rect polygon sources ───

export function makeRectPolygonSource(x1: number, y1: number, x2: number, y2: number): Array<number | string> {
  const minX = Math.min(toFinite(x1), toFinite(x2));
  const maxX = Math.max(toFinite(x1), toFinite(x2));
  const minY = Math.min(toFinite(y1), toFinite(y2));
  const maxY = Math.max(toFinite(y1), toFinite(y2));
  return [minX, minY, 'L', maxX, minY, maxX, maxY, minX, maxY];
}

export function makeRectPolygonSourceR(x1: number, y1: number, x2: number, y2: number): Array<number | string> {
  const minX = Math.min(toFinite(x1), toFinite(x2));
  const maxX = Math.max(toFinite(x1), toFinite(x2));
  const minY = Math.min(toFinite(y1), toFinite(y2));
  const maxY = Math.max(toFinite(y1), toFinite(y2));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return ['R', minX, minY, width, height, 0, 0];
}
