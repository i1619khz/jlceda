import { APP_NAME, BRIDGE_DIR } from './constants';
import {
  anyEda,
  blobToDataUrl,
  readFirstBooleanValue,
  readFirstNumberValue,
  readFirstStringValue,
  toFinite,
  waitMs,
} from './util';
import {
  Box,
  firstBox,
  getBBoxOfPrimitive,
  makeRectPolygonSource,
  makeRectPolygonSourceR,
  normalizeNetArray,
} from './geometry';

// ─── PCB state ───

export async function getPCBState(): Promise<any> {
  const api = anyEda();

  const components: any[] = [];
  if (api?.pcb_PrimitiveComponent?.getAll) {
    const rows = await api.pcb_PrimitiveComponent.getAll();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const primitiveId = row?.getState_PrimitiveId?.() || '';
        const designator = row?.getState_Designator?.() || '';
        if (!primitiveId || !designator) continue;

        components.push({
          primitiveId,
          designator,
          name: row?.getState_Name?.() || '',
          x: Number(row?.getState_X?.() ?? 0),
          y: Number(row?.getState_Y?.() ?? 0),
          rotation: Number(row?.getState_Rotation?.() ?? 0),
          width: Number(row?.getState_Width?.() ?? 0),
          height: Number(row?.getState_Height?.() ?? 0),
          layer: String(row?.getState_Layer?.() ?? ''),
          locked: Boolean(row?.getState_PrimitiveLock?.()),
          padNets: normalizeNetArray(row?.getState_Pads?.()),
        });
      }
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const c of components) {
    minX = Math.min(minX, c.x - c.width / 2);
    minY = Math.min(minY, c.y - c.height / 2);
    maxX = Math.max(maxX, c.x + c.width / 2);
    maxY = Math.max(maxY, c.y + c.height / 2);
  }

  const nets: any[] = [];
  if (api?.pcb_Net?.getAllNetsName) {
    const names = await api.pcb_Net.getAllNetsName();
    if (Array.isArray(names)) {
      for (const name of names) {
        if (typeof name === 'string' && name.trim()) {
          const netName = name.trim();
          let length: number | undefined;
          try {
            length = await api.pcb_Net.getNetLength(netName);
          } catch {
            // ignore
          }
          nets.push({ name: netName, length });
        }
      }
    }
  }

  return {
    components,
    nets,
    boardBounds: {
      minX: minX === Number.POSITIVE_INFINITY ? 0 : minX,
      minY: minY === Number.POSITIVE_INFINITY ? 0 : minY,
      maxX: maxX === Number.NEGATIVE_INFINITY ? 100 : maxX,
      maxY: maxY === Number.NEGATIVE_INFINITY ? 100 : maxY,
    },
    layerCount: 2,
  };
}

export async function getPads(params?: { nets?: string[] | string; limit?: number; includeBBox?: boolean }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitivePad?.getAll) {
    throw new Error('current EDA does not support pad query');
  }

  const rows = await api.pcb_PrimitivePad.getAll();
  const limitRaw = Number(params?.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 10000;
  const includeBBox = Boolean(params?.includeBBox);

  const netsInput = Array.isArray(params?.nets)
    ? params?.nets
    : typeof params?.nets === 'string'
    ? params.nets.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
  const netFilter = new Set<string>(netsInput.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean));

  const pads: any[] = [];
  for (const row of rows || []) {
    const primitiveId = readFirstStringValue(row, ['getState_PrimitiveId']);
    if (!primitiveId) continue;

    const net = readFirstStringValue(row, ['getState_Net', 'getState_NetName']);
    if (netFilter.size > 0) {
      if (!net || !netFilter.has(net.toUpperCase())) {
        continue;
      }
    }

    const x = readFirstNumberValue(row, ['getState_X', 'getState_CenterX', 'getState_PosX']);
    const y = readFirstNumberValue(row, ['getState_Y', 'getState_CenterY', 'getState_PosY']);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const layerRaw = readFirstNumberValue(row, ['getState_Layer']);
    const layer = Number.isFinite(layerRaw) ? Number(layerRaw) : undefined;

    const pad: any = {
      primitiveId,
      net: net || '',
      x,
      y,
      layer: layer !== undefined ? layer : String(readFirstStringValue(row, ['getState_Layer']) || ''),
      parentPrimitiveId: readFirstStringValue(row, [
        'getState_ParentPrimitiveId',
        'getState_BelongPrimitiveId',
        'getState_ComponentPrimitiveId',
      ]),
      designator: readFirstStringValue(row, ['getState_Designator']),
      locked: Boolean(readFirstBooleanValue(row, ['getState_PrimitiveLock'])),
      holeDiameter: readFirstNumberValue(row, ['getState_HoleDiameter', 'getState_DrillDiameter']),
      diameter: readFirstNumberValue(row, ['getState_Diameter', 'getState_PadDiameter']),
      shape: readFirstStringValue(row, ['getState_Shape', 'getState_PadShape']),
    };

    if (includeBBox) {
      try {
        const bbox = await api.pcb_Primitive.getPrimitivesBBox([row as any]);
        if (bbox) {
          pad.bbox = {
            minX: bbox.minX,
            minY: bbox.minY,
            maxX: bbox.maxX,
            maxY: bbox.maxY,
          };
        }
      } catch {
        // ignore bbox errors
      }
    }

    pads.push(pad);
    if (pads.length >= limit) break;
  }

  const netStats = new Map<string, number>();
  for (const item of pads) {
    const key = String(item.net || '').trim();
    if (!key) continue;
    netStats.set(key, (netStats.get(key) || 0) + 1);
  }

  const nets = Array.from(netStats.entries())
    .map(([name, padCount]) => ({ name, padCount }))
    .sort((a, b) => b.padCount - a.padCount);

  return {
    totalPads: Array.isArray(rows) ? rows.length : 0,
    returnedPads: pads.length,
    nets,
    pads,
  };
}

// ─── Component move / bbox ───

export async function moveComponent(params: { designator: string; x: number; y: number; rotation?: number }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveComponent?.getAll || !api?.pcb_PrimitiveComponent?.modify) {
    throw new Error('current EDA does not support component modify');
  }

  const rows = await api.pcb_PrimitiveComponent.getAll();
  let targetId: string | null = null;
  let targetRow: any = null;

  for (const row of rows) {
    const designator = row?.getState_Designator?.() || '';
    if (designator === params.designator) {
      targetId = row?.getState_PrimitiveId?.() || null;
      targetRow = row;
      break;
    }
  }

  if (!targetId) throw new Error(`component not found: ${params.designator}`);
  if (targetRow?.getState_PrimitiveLock?.()) {
    throw new Error(`component locked: ${params.designator}`);
  }

  await api.pcb_PrimitiveComponent.modify(targetId, {
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? targetRow?.getState_Rotation?.() ?? 0,
  });

  return {
    moved: params.designator,
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? targetRow?.getState_Rotation?.() ?? 0,
  };
}

export async function getComponentBBox(params: { designator: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveComponent?.getAll) {
    throw new Error('current EDA does not support component getAll');
  }
  if (!api?.pcb_Primitive?.getPrimitivesBBox) {
    throw new Error('current EDA does not support getPrimitivesBBox');
  }

  const rows = await api.pcb_PrimitiveComponent.getAll();
  let targetId: string | null = null;

  for (const row of rows) {
    const designator = row?.getState_Designator?.() || '';
    if (designator === params.designator) {
      targetId = row?.getState_PrimitiveId?.() || null;
      break;
    }
  }

  if (!targetId) throw new Error(`component not found: ${params.designator}`);

  const bbox = await api.pcb_Primitive.getPrimitivesBBox([targetId]);
  if (!bbox) {
    throw new Error(`BBox not available for: ${params.designator}`);
  }

  const minX = Number((bbox as any).minX);
  const minY = Number((bbox as any).minY);
  const maxX = Number((bbox as any).maxX);
  const maxY = Number((bbox as any).maxY);

  return {
    designator: params.designator,
    primitiveId: targetId,
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export async function getBoardBoundingBox(): Promise<Box | undefined> {
  const api = anyEda();
  const layerCandidates = [api?.EPCB_LayerId?.BOARD_OUTLINE, 11].filter((item) => Number.isFinite(Number(item)));

  let merged: Box | undefined;
  for (const layer of layerCandidates) {
    try {
      const lines = await api?.pcb_PrimitiveLine?.getAll?.(undefined, Number(layer));
      const arcs = await api?.pcb_PrimitiveArc?.getAll?.(undefined, Number(layer));
      const polys = await api?.pcb_PrimitivePolyline?.getAll?.(undefined, Number(layer));
      const rows = [...(Array.isArray(lines) ? lines : []), ...(Array.isArray(arcs) ? arcs : []), ...(Array.isArray(polys) ? polys : [])];
      for (const row of rows) {
        const box = await getBBoxOfPrimitive(row);
        if (!box) continue;
        if (!merged) {
          merged = { ...box };
          continue;
        }
        merged.minX = Math.min(merged.minX, box.minX);
        merged.minY = Math.min(merged.minY, box.minY);
        merged.maxX = Math.max(merged.maxX, box.maxX);
        merged.maxY = Math.max(merged.maxY, box.maxY);
      }
      if (merged) return merged;
    } catch {
      // try next candidate
    }
  }

  try {
    const state = await getPCBState();
    if (state?.boardBounds) {
      return {
        minX: toFinite(state.boardBounds.minX, 0),
        minY: toFinite(state.boardBounds.minY, 0),
        maxX: toFinite(state.boardBounds.maxX, 100),
        maxY: toFinite(state.boardBounds.maxY, 100),
      };
    }
  } catch {
    // ignore
  }

  return undefined;
}

// ─── Primitive id parsing ───

export function parsePrimitiveIds(params: any): string | string[] {
  if (Array.isArray(params?.primitiveIds)) {
    const ids = params.primitiveIds.map((item: any) => String(item || '').trim()).filter(Boolean);
    if (ids.length === 0) {
      throw new Error('primitiveIds must not be empty');
    }
    return ids;
  }
  if (params?.primitiveId !== undefined) {
    const id = String(params.primitiveId || '').trim();
    if (!id) throw new Error('primitiveId must not be empty');
    return id;
  }
  if (params?.id !== undefined) {
    const id = String(params.id || '').trim();
    if (!id) throw new Error('id must not be empty');
    return id;
  }
  throw new Error('primitiveId or primitiveIds is required');
}

export function getRectParams(params: any): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = toFinite(params?.x1, NaN);
  const y1 = toFinite(params?.y1, NaN);
  const x2 = toFinite(params?.x2, NaN);
  const y2 = toFinite(params?.y2, NaN);
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    throw new Error('x1/y1/x2/y2 are required');
  }
  return { x1, y1, x2, y2 };
}

export function getPrimitiveId(primitive: any): string {
  try {
    const id = primitive?.getState_PrimitiveId?.();
    if (typeof id === 'string' && id.trim()) return id.trim();
  } catch {
    // ignore
  }
  return '';
}

export function makeRectPolygon(params: { x1: number; y1: number; x2: number; y2: number }): any {
  const api = anyEda();
  const sourceLine = makeRectPolygonSource(params.x1, params.y1, params.x2, params.y2);
  const sourceRect = makeRectPolygonSourceR(params.x1, params.y1, params.x2, params.y2);
  const polygonByLine = api?.pcb_MathPolygon?.createPolygon?.(sourceLine as any);
  if (polygonByLine) return polygonByLine;
  const polygonByRect = api?.pcb_MathPolygon?.createPolygon?.(sourceRect as any);
  if (polygonByRect) return polygonByRect;
  throw new Error('failed to create rectangle polygon');
}

export function buildRectPolygonCandidates(params: { x1: number; y1: number; x2: number; y2: number }): any[] {
  const api = anyEda();
  const sourceLine = makeRectPolygonSource(params.x1, params.y1, params.x2, params.y2);
  const sourceRect = makeRectPolygonSourceR(params.x1, params.y1, params.x2, params.y2);
  const list: any[] = [];

  const add = (item: any) => {
    if (!item) return;
    list.push(item);
  };

  add(api?.pcb_MathPolygon?.createPolygon?.(sourceLine as any));
  add(api?.pcb_MathPolygon?.createPolygon?.(sourceRect as any));
  add(api?.pcb_MathPolygon?.createComplexPolygon?.(sourceLine as any));
  add(api?.pcb_MathPolygon?.createComplexPolygon?.(sourceRect as any));
  add(sourceLine as any);
  add(sourceRect as any);
  return list;
}

// ─── Via / Keepout / Pour ───

export async function createVia(params: {
  net: string;
  x: number;
  y: number;
  holeDiameter?: number;
  diameter?: number;
  viaType?: number;
  primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveVia?.create) {
    throw new Error('current EDA does not support via create');
  }

  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');

  const x = toFinite(params?.x, NaN);
  const y = toFinite(params?.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('x/y are required');

  const holeDiameter = Math.max(1, toFinite(params?.holeDiameter, 10));
  const diameter = Math.max(holeDiameter + 1, toFinite(params?.diameter, 22));
  const viaType = Number.isFinite(Number(params?.viaType)) ? Number(params.viaType) : undefined;
  const primitiveLock = params?.primitiveLock !== undefined ? Boolean(params.primitiveLock) : false;

  const via = await api.pcb_PrimitiveVia.create(net, x, y, holeDiameter, diameter, viaType, undefined, undefined, primitiveLock);
  return {
    primitiveId: getPrimitiveId(via),
    net,
    x,
    y,
    holeDiameter,
    diameter,
    viaType: viaType ?? null,
  };
}

export async function deleteVia(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveVia?.delete) {
    throw new Error('current EDA does not support via delete');
  }
  const primitiveIds = parsePrimitiveIds(params);
  const ok = await api.pcb_PrimitiveVia.delete(primitiveIds as any);
  return {
    deleted: Boolean(ok),
    primitiveIds: Array.isArray(primitiveIds) ? primitiveIds : [primitiveIds],
  };
}

export async function createKeepoutRect(params: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer?: number;
  ruleTypes?: number[];
  regionName?: string;
  lineWidth?: number;
  primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveRegion?.create || !api?.pcb_MathPolygon?.createPolygon) {
    throw new Error('current EDA does not support region create');
  }

  const rect = getRectParams(params);
  const requestedLayer = Number.isFinite(Number(params?.layer)) ? Number(params.layer) : 12;
  const ruleTypes = Array.isArray(params?.ruleTypes) && params.ruleTypes.length > 0
    ? params.ruleTypes.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [2, 3, 5, 6, 7];
  const regionName = String(params?.regionName || `KEEP_OUT_${Date.now()}`);
  const lineWidth = Math.max(0, toFinite(params?.lineWidth, 4));
  const primitiveLock = params?.primitiveLock !== undefined ? Boolean(params.primitiveLock) : false;

  const layerCandidates = Array.from(new Set([requestedLayer, 12, 1, 2].filter((item) => Number.isFinite(item))));
  const polygonCandidates = buildRectPolygonCandidates(rect);
  const ruleTypeCandidates: Array<any> = [];
  if (ruleTypes.length > 0) ruleTypeCandidates.push(ruleTypes);
  ruleTypeCandidates.push([5], [2, 3, 5, 6, 7], undefined);
  const nameCandidates = [regionName, undefined];
  const lineWidthCandidates = [lineWidth, undefined];

  let region: any = undefined;
  let usedLayer = requestedLayer;
  let usedRuleTypes: any = ruleTypes;
  let usedName: any = regionName;
  let usedLineWidth: any = lineWidth;
  let lastError: any = null;

  outer: for (const layer of layerCandidates) {
    for (const polygon of polygonCandidates) {
      for (const rt of ruleTypeCandidates) {
        for (const rn of nameCandidates) {
          for (const lw of lineWidthCandidates) {
            try {
              region = await api.pcb_PrimitiveRegion.create(layer, polygon, rt, rn, lw, primitiveLock);
              if (region) {
                usedLayer = layer;
                usedRuleTypes = rt;
                usedName = rn;
                usedLineWidth = lw;
                break outer;
              }
            } catch (error) {
              lastError = error;
            }
          }
        }
      }
    }
  }

  if (!region) {
    if (lastError) throw lastError;
    throw new Error('failed to create keepout region');
  }

  return {
    primitiveId: getPrimitiveId(region),
    layer: usedLayer,
    ruleTypes: Array.isArray(usedRuleTypes) ? usedRuleTypes : [],
    regionName: usedName || '',
    lineWidth: Number.isFinite(Number(usedLineWidth)) ? Number(usedLineWidth) : null,
    rect,
  };
}

export async function deleteRegion(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveRegion?.delete) {
    throw new Error('current EDA does not support region delete');
  }
  const primitiveIds = parsePrimitiveIds(params);
  const ok = await api.pcb_PrimitiveRegion.delete(primitiveIds as any);
  return {
    deleted: Boolean(ok),
    primitiveIds: Array.isArray(primitiveIds) ? primitiveIds : [primitiveIds],
  };
}

export async function createPourRect(params: {
  net: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer?: number;
  fillMethod?: string;
  preserveSilos?: boolean;
  pourName?: string;
  pourPriority?: number;
  lineWidth?: number;
  primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitivePour?.create || !api?.pcb_MathPolygon?.createPolygon) {
    throw new Error('current EDA does not support pour create');
  }

  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');
  const rect = getRectParams(params);
  const requestedLayer = Number.isFinite(Number(params?.layer)) ? Number(params.layer) : 1;
  const fillMethod = String(params?.fillMethod || 'solid').trim().toLowerCase();
  const preserveSilos = params?.preserveSilos !== undefined ? Boolean(params.preserveSilos) : false;
  const pourName = String(params?.pourName || `POUR_${net}_${Date.now()}`);
  const pourPriority = Math.max(1, Math.floor(toFinite(params?.pourPriority, 1)));
  const lineWidth = Math.max(0, toFinite(params?.lineWidth, 8));
  const primitiveLock = params?.primitiveLock !== undefined ? Boolean(params.primitiveLock) : false;

  const layerCandidates = Array.from(new Set([requestedLayer, 1, 2].filter((item) => Number.isFinite(item))));
  const polygonCandidates = buildRectPolygonCandidates(rect);
  const fillMethodCandidates = Array.from(new Set([fillMethod, 'solid', undefined] as Array<any>));
  const preserveCandidates = Array.from(new Set([preserveSilos, false, true]));
  const nameCandidates = [pourName, undefined];
  const priorityCandidates = [pourPriority, undefined];
  const lineWidthCandidates = [lineWidth, undefined];

  let pour: any = undefined;
  let usedLayer = requestedLayer;
  let usedFillMethod: any = fillMethod;
  let usedPreserveSilos: any = preserveSilos;
  let usedName: any = pourName;
  let usedPriority: any = pourPriority;
  let usedLineWidth: any = lineWidth;
  let lastError: any = null;

  outer: for (const layer of layerCandidates) {
    for (const polygon of polygonCandidates) {
      for (const fm of fillMethodCandidates) {
        for (const ps of preserveCandidates) {
          for (const pn of nameCandidates) {
            for (const pp of priorityCandidates) {
              for (const lw of lineWidthCandidates) {
                try {
                  pour = await api.pcb_PrimitivePour.create(
                    net,
                    layer,
                    polygon,
                    fm,
                    ps,
                    pn,
                    pp,
                    lw,
                    primitiveLock,
                  );
                  if (pour) {
                    usedLayer = layer;
                    usedFillMethod = fm;
                    usedPreserveSilos = ps;
                    usedName = pn;
                    usedPriority = pp;
                    usedLineWidth = lw;
                    break outer;
                  }
                } catch (error) {
                  lastError = error;
                }
              }
            }
          }
        }
      }
    }
  }

  if (!pour) {
    if (lastError) throw lastError;
    throw new Error('failed to create pour');
  }

  return {
    primitiveId: getPrimitiveId(pour),
    net,
    layer: usedLayer,
    fillMethod: usedFillMethod || '',
    preserveSilos: Boolean(usedPreserveSilos),
    pourName: usedName || '',
    pourPriority: Number.isFinite(Number(usedPriority)) ? Number(usedPriority) : null,
    lineWidth: Number.isFinite(Number(usedLineWidth)) ? Number(usedLineWidth) : null,
    rect,
  };
}

export async function deletePour(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitivePour?.delete) {
    throw new Error('current EDA does not support pour delete');
  }
  const primitiveIds = parsePrimitiveIds(params);
  const ok = await api.pcb_PrimitivePour.delete(primitiveIds as any);
  return {
    deleted: Boolean(ok),
    primitiveIds: Array.isArray(primitiveIds) ? primitiveIds : [primitiveIds],
  };
}

// ─── Tracks / net primitives ───

export async function getTracks(params: { net?: string; layer?: number }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveLine?.getAll) {
    throw new Error('current EDA does not support track query');
  }
  const rows = await api.pcb_PrimitiveLine.getAll(params.net, params.layer);
  const tracks = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    primitiveId: r?.getState_PrimitiveId?.() || '',
    net: r?.getState_Net?.() || '',
    layer: r?.getState_Layer?.() ?? '',
    startX: Number(r?.getState_StartX?.() ?? 0),
    startY: Number(r?.getState_StartY?.() ?? 0),
    endX: Number(r?.getState_EndX?.() ?? 0),
    endY: Number(r?.getState_EndY?.() ?? 0),
    width: Number(r?.getState_Width?.() ?? 0),
  })).filter((t: any) => t.primitiveId);
  return { tracks, count: tracks.length };
}

export async function deleteTracks(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveLine?.delete) {
    throw new Error('current EDA does not support track delete');
  }
  const primitiveIds = parsePrimitiveIds(params);
  const ok = await api.pcb_PrimitiveLine.delete(primitiveIds as any);
  return {
    deleted: Boolean(ok),
    primitiveIds: Array.isArray(primitiveIds) ? primitiveIds : [primitiveIds],
  };
}

export async function getNetPrimitives(params: { net: string }): Promise<any> {
  const api = anyEda();
  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');

  const result: { tracks: any[]; vias: any[]; pads: any[] } = { tracks: [], vias: [], pads: [] };

  if (api?.pcb_PrimitiveLine?.getAll) {
    const rows = await api.pcb_PrimitiveLine.getAll(net);
    for (const r of (Array.isArray(rows) ? rows : [])) {
      const id = r?.getState_PrimitiveId?.();
      if (!id) continue;
      result.tracks.push({
        primitiveId: id,
        startX: Number(r?.getState_StartX?.() ?? 0),
        startY: Number(r?.getState_StartY?.() ?? 0),
        endX: Number(r?.getState_EndX?.() ?? 0),
        endY: Number(r?.getState_EndY?.() ?? 0),
        layer: r?.getState_Layer?.() ?? '',
        width: Number(r?.getState_Width?.() ?? 0),
      });
    }
  }

  if (api?.pcb_PrimitiveVia?.getAll) {
    try {
      const rows = await api.pcb_PrimitiveVia.getAll();
      for (const r of (Array.isArray(rows) ? rows : [])) {
        const viaNet = r?.getState_Net?.() || '';
        if (viaNet !== net) continue;
        const id = r?.getState_PrimitiveId?.();
        if (!id) continue;
        result.vias.push({
          primitiveId: id,
          x: Number(r?.getState_X?.() ?? 0),
          y: Number(r?.getState_Y?.() ?? 0),
        });
      }
    } catch { /* ignore */ }
  }

  if (api?.pcb_PrimitivePad?.getAll) {
    try {
      const rows = await api.pcb_PrimitivePad.getAll();
      for (const r of (Array.isArray(rows) ? rows : [])) {
        const padNet = r?.getState_Net?.() || r?.getState_NetName?.() || '';
        if (padNet !== net) continue;
        const id = r?.getState_PrimitiveId?.();
        if (!id) continue;
        result.pads.push({
          primitiveId: id,
          x: Number(r?.getState_X?.() ?? r?.getState_CenterX?.() ?? 0),
          y: Number(r?.getState_Y?.() ?? r?.getState_CenterY?.() ?? 0),
          designator: r?.getState_Designator?.() || '',
        });
      }
    } catch { /* ignore */ }
  }

  return result;
}

// ─── Relocate / route / DRC ───

export async function relocateComponent(params: {
  designator: string; x: number; y: number; rotation?: number;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveComponent?.getAll || !api?.pcb_PrimitiveComponent?.modify) {
    throw new Error('current EDA does not support component modify');
  }

  const rows = await api.pcb_PrimitiveComponent.getAll();
  let targetId: string | null = null;
  let targetRow: any = null;
  for (const row of rows) {
    if ((row?.getState_Designator?.() || '') === params.designator) {
      targetId = row?.getState_PrimitiveId?.() || null;
      targetRow = row;
      break;
    }
  }
  if (!targetId) throw new Error(`component not found: ${params.designator}`);
  if (targetRow?.getState_PrimitiveLock?.()) {
    throw new Error(`component locked: ${params.designator}`);
  }

  const padNets = normalizeNetArray(targetRow?.getState_Pads?.());
  const uniqueNets = [...new Set(padNets.map((p: any) => p.net).filter(Boolean))];

  const padPositions: { x: number; y: number }[] = [];
  if (api?.pcb_PrimitivePad?.getAll) {
    try {
      const allPads = await api.pcb_PrimitivePad.getAll();
      for (const p of (Array.isArray(allPads) ? allPads : [])) {
        const des = p?.getState_Designator?.() || '';
        const parentId = p?.getState_ParentPrimitiveId?.()
          || p?.getState_BelongPrimitiveId?.()
          || p?.getState_ComponentPrimitiveId?.() || '';
        if (des === params.designator || parentId === targetId) {
          padPositions.push({
            x: Number(p?.getState_X?.() ?? p?.getState_CenterX?.() ?? 0),
            y: Number(p?.getState_Y?.() ?? p?.getState_CenterY?.() ?? 0),
          });
        }
      }
    } catch { /* ignore */ }
  }

  const deletedTracks: string[] = [];
  const COORD_TOLERANCE = 2;
  if (api?.pcb_PrimitiveLine?.getAll && api?.pcb_PrimitiveLine?.delete && padPositions.length > 0) {
    for (const net of uniqueNets) {
      try {
        const trackRows = await api.pcb_PrimitiveLine.getAll(net);
        const toDelete: string[] = [];
        for (const t of (Array.isArray(trackRows) ? trackRows : [])) {
          const sx = Number(t?.getState_StartX?.() ?? 0);
          const sy = Number(t?.getState_StartY?.() ?? 0);
          const ex = Number(t?.getState_EndX?.() ?? 0);
          const ey = Number(t?.getState_EndY?.() ?? 0);
          const touchesPad = padPositions.some(pad =>
            (Math.abs(sx - pad.x) <= COORD_TOLERANCE && Math.abs(sy - pad.y) <= COORD_TOLERANCE) ||
            (Math.abs(ex - pad.x) <= COORD_TOLERANCE && Math.abs(ey - pad.y) <= COORD_TOLERANCE)
          );
          if (touchesPad) {
            const id = t?.getState_PrimitiveId?.();
            if (id) toDelete.push(id);
          }
        }
        if (toDelete.length > 0) {
          await api.pcb_PrimitiveLine.delete(toDelete as any);
          deletedTracks.push(...toDelete);
        }
      } catch { /* ignore per-net errors */ }
    }
  }

  await api.pcb_PrimitiveComponent.modify(targetId, {
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? targetRow?.getState_Rotation?.() ?? 0,
  });

  return {
    moved: params.designator,
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? targetRow?.getState_Rotation?.() ?? 0,
    deletedTracks,
    deletedTrackCount: deletedTracks.length,
    netsToReroute: uniqueNets,
  };
}

export async function routeTrack(params: { net: string; points: any[]; layer: number; width?: number }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveLine?.create) {
    throw new Error('current EDA does not support track create');
  }

  const width = params.width ?? 10;
  let created = 0;

  for (let i = 0; i < params.points.length - 1; i += 1) {
    const p1 = params.points[i];
    const p2 = params.points[i + 1];
    try {
      await api.pcb_PrimitiveLine.create(params.net, params.layer, p1.x, p1.y, p2.x, p2.y, width, false);
      created += 1;
    } catch (error) {
      console.error(`[${APP_NAME}] route segment failed`, i, error);
    }
  }

  return { createdSegments: created };
}

export async function runDRC(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.check && !api?.pcb_Drc?.runDrc) {
    throw new Error('current EDA does not support DRC');
  }

  let passed: boolean | undefined;
  let issues: any[] = [];

  if (api?.pcb_Drc?.check) {
    try {
      const verbose = await api.pcb_Drc.check(true, false, true);
      if (Array.isArray(verbose)) {
        issues = verbose;
        passed = verbose.length === 0;
      } else if (typeof verbose === 'boolean') {
        passed = verbose;
      }
    } catch {
      try {
        const quick = await api.pcb_Drc.check(true, false, false);
        if (typeof quick === 'boolean') {
          passed = quick;
        }
      } catch {
        // ignore
      }
    }
  }

  if (issues.length === 0 && api?.pcb_Drc?.runDrc) {
    try {
      const raw = await api.pcb_Drc.runDrc();
      if (Array.isArray(raw)) {
        issues = raw;
        if (passed === undefined) passed = raw.length === 0;
      }
    } catch {
      // ignore runDrc fallback
    }
  }

  const normalized = issues.map((item: any, index: number) => {
    const rule = String(item?.rule || item?.type || item?.name || '').trim();
    const message = String(item?.message || item?.description || '').trim();
    const refs = Array.isArray(item?.primitiveIds)
      ? item.primitiveIds.map((id: any) => String(id || '')).filter(Boolean)
      : [];
    const text = `${rule} ${message}`.toLowerCase();
    let severity = 'unknown';
    if (/error|错误|违规/.test(text)) severity = 'error';
    else if (/warning|警告/.test(text)) severity = 'warning';
    else if (/info|提示/.test(text)) severity = 'info';

    return {
      index: index + 1,
      severity,
      rule,
      message,
      primitiveIds: refs,
      raw: item,
    };
  });

  if (passed === undefined) {
    passed = normalized.length === 0;
  }

  const summary = {
    errors: normalized.filter((item) => item.severity === 'error').length,
    warnings: normalized.filter((item) => item.severity === 'warning').length,
    infos: normalized.filter((item) => item.severity === 'info').length,
    unknown: normalized.filter((item) => item.severity === 'unknown').length,
  };

  return {
    passed: Boolean(passed),
    totalCount: normalized.length,
    summary,
    issues: normalized,
  };
}

// ─── Screenshot ───

function readTabIdFromDocumentInfo(info: any): string | undefined {
  if (!info) return undefined;

  if (typeof info?.tabId === 'string' && info.tabId.trim()) {
    return info.tabId.trim();
  }

  if (typeof info?.getState_TabId === 'function') {
    try {
      const tabId = info.getState_TabId();
      if (typeof tabId === 'string' && tabId.trim()) {
        return tabId.trim();
      }
    } catch {
      // ignore
    }
  }

  return undefined;
}

async function resolveCaptureTabId(): Promise<string | undefined> {
  const api = anyEda();

  try {
    const currentDoc = await api?.dmt_SelectControl?.getCurrentDocumentInfo?.();
    const tabId = readTabIdFromDocumentInfo(currentDoc);
    if (tabId) return tabId;
  } catch {
    // ignore
  }

  try {
    const boardInfo = await api?.dmt_Board?.getCurrentBoardInfo?.();
    const pcbUuid = String(boardInfo?.pcb?.uuid || '').trim();
    if (!pcbUuid) return undefined;

    try {
      const openedTabId = await api?.dmt_EditorControl?.openDocument?.(pcbUuid);
      if (typeof openedTabId === 'string' && openedTabId.trim()) {
        return openedTabId.trim();
      }
    } catch {
      // ignore open error
    }

    return pcbUuid;
  } catch {
    return undefined;
  }
}

async function tryCaptureRenderedAreaImageDataUrl(): Promise<string | undefined> {
  const api = anyEda();
  if (!api?.dmt_EditorControl?.getCurrentRenderedAreaImage) {
    return undefined;
  }

  const tabId = await resolveCaptureTabId();

  if (tabId && api?.dmt_EditorControl?.activateDocument) {
    try {
      await api.dmt_EditorControl.activateDocument(tabId);
    } catch {
      // ignore
    }
  }

  if (api?.dmt_EditorControl?.zoomToAllPrimitives) {
    try {
      await api.dmt_EditorControl.zoomToAllPrimitives(tabId);
    } catch {
      // ignore
    }
  }

  await waitMs(120);

  try {
    const blob: Blob | undefined = await api.dmt_EditorControl.getCurrentRenderedAreaImage(tabId);
    if (blob?.arrayBuffer) {
      return await blobToDataUrl(blob);
    }
  } catch {
    // ignore
  }

  try {
    const fallbackBlob: Blob | undefined = await api.dmt_EditorControl.getCurrentRenderedAreaImage();
    if (fallbackBlob?.arrayBuffer) {
      return await blobToDataUrl(fallbackBlob);
    }
  } catch {
    // ignore
  }

  return undefined;
}

export async function takeScreenshot(): Promise<any> {
  const api = anyEda();

  const renderedAreaDataUrl = await tryCaptureRenderedAreaImageDataUrl();
  if (typeof renderedAreaDataUrl === 'string' && renderedAreaDataUrl.startsWith('data:')) {
    return { imageDataUrl: renderedAreaDataUrl };
  }

  if (api?.pcb_Document?.exportImage) {
    try {
      const dataUrl = await api.pcb_Document.exportImage('png');
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        return { imageDataUrl: dataUrl };
      }
    } catch {
      // ignore
    }
  }

  if (api?.sys_Canvas?.toDataURL) {
    try {
      const dataUrl = await api.sys_Canvas.toDataURL('image/png');
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        return { imageDataUrl: dataUrl };
      }
    } catch {
      // ignore
    }
  }

  throw new Error(`screenshot unavailable, save manually to ${BRIDGE_DIR}\\screenshot.png`);
}
