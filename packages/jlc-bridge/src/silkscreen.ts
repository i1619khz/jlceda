import {
  anyEda,
  readFirstBooleanValue,
  readFirstNumberValue,
  readFirstStringValue,
  toFinite,
} from './util';
import {
  Box,
  boxInside,
  boxIntersects,
  createBoxFromCenter,
  estimateStringBox,
  firstBox,
  getBBoxOfPrimitive,
  isVerticalAngle,
} from './geometry';
import { getBoardBoundingBox } from './pcb';

// ─── Selection ───

async function getSelectedPrimitiveIdSet(): Promise<Set<string>> {
  const result = new Set<string>();
  try {
    const ids = await anyEda()?.pcb_SelectControl?.getAllSelectedPrimitives_PrimitiveId?.();
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === 'string' && id.trim()) {
          result.add(id.trim());
        }
      }
    }
  } catch {
    // ignore
  }
  return result;
}

// ─── Silkscreen collection ───

async function collectSilkscreenRows(): Promise<any[]> {
  const api = anyEda();
  const dedup = new Map<string, any>();
  const stringApi = api?.pcb_PrimitiveString;
  const tryPushRow = (row: any) => {
    const primitiveId = readFirstStringValue(row, ['getState_PrimitiveId']);
    if (!primitiveId) return;
    dedup.set(primitiveId, row);
  };

  if (stringApi?.getAll) {
    for (const layer of [3, 4]) {
      try {
        const rows = await stringApi.getAll(layer);
        if (Array.isArray(rows)) {
          for (const row of rows) {
            tryPushRow(row);
          }
        }
      } catch {
        // ignore layer read error
      }
    }

    if (dedup.size === 0) {
      try {
        const rows = await stringApi.getAll();
        if (Array.isArray(rows)) {
          for (const row of rows) {
            tryPushRow(row);
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (dedup.size > 0) {
    return Array.from(dedup.values());
  }

  try {
    const rows = await api?.pcb_Document?.getPrimitivesInRegion?.(-1_000_000, 1_000_000, 1_000_000, -1_000_000, false);
    if (!Array.isArray(rows)) return [];
    for (const row of rows) {
      const textGetter = row?.getState_Text;
      if (typeof textGetter !== 'function') continue;
      tryPushRow(row);
    }
  } catch {
    // ignore
  }

  return Array.from(dedup.values());
}

async function buildSilkscreenItem(row: any, selectedSet: Set<string>): Promise<any | null> {
  const primitiveId = readFirstStringValue(row, ['getState_PrimitiveId']);
  if (!primitiveId) return null;

  const text = readFirstStringValue(row, ['getState_Text', 'getState_Content']);
  const x = readFirstNumberValue(row, ['getState_X', 'getState_CenterX']);
  const y = readFirstNumberValue(row, ['getState_Y', 'getState_CenterY']);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const rotation = toFinite(readFirstNumberValue(row, ['getState_Rotation']), 0);
  const fontSize = toFinite(readFirstNumberValue(row, ['getState_FontSize']), 10);
  const parentPrimitiveId = readFirstStringValue(row, ['getState_ParentPrimitiveId', 'getState_BelongPrimitiveId']);
  const layer = readFirstNumberValue(row, ['getState_Layer']);
  const locked = Boolean(readFirstBooleanValue(row, ['getState_PrimitiveLock']));

  const measuredBox = await getBBoxOfPrimitive(row);
  const estimatedBox = estimateStringBox(x, y, text, fontSize, rotation);
  const bbox = firstBox([measuredBox, estimatedBox]) || estimatedBox;

  return {
    primitiveId,
    text,
    x,
    y,
    rotation,
    fontSize,
    parentPrimitiveId: parentPrimitiveId || '',
    layer: Number.isFinite(layer) ? Number(layer) : undefined,
    locked,
    selected: selectedSet.has(primitiveId),
    bbox,
    width: bbox.maxX - bbox.minX,
    height: bbox.maxY - bbox.minY,
  };
}

function buildObstacleBoxFromPrimitiveRow(row: any, diameterGetterNames: string[]): Box | undefined {
  const x = readFirstNumberValue(row, ['getState_X', 'getState_CenterX']);
  const y = readFirstNumberValue(row, ['getState_Y', 'getState_CenterY']);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  const diameter = readFirstNumberValue(row, diameterGetterNames);
  const size = Math.max(1, toFinite(diameter, 10));
  return createBoxFromCenter(x, y, size, size);
}

async function collectPadObstacleBoxes(limit = 10000): Promise<Array<{ primitiveId: string; net: string; box: Box }>> {
  const rows = await anyEda()?.pcb_PrimitivePad?.getAll?.();
  const result: Array<{ primitiveId: string; net: string; box: Box }> = [];
  if (!Array.isArray(rows)) return result;

  for (const row of rows) {
    const primitiveId = readFirstStringValue(row, ['getState_PrimitiveId']);
    if (!primitiveId) continue;
    const net = readFirstStringValue(row, ['getState_Net', 'getState_NetName']);
    const measuredBox = await getBBoxOfPrimitive(row);
    const estimatedBox = buildObstacleBoxFromPrimitiveRow(row, ['getState_Diameter', 'getState_PadDiameter']);
    const box = firstBox([measuredBox, estimatedBox]);
    if (!box) continue;
    result.push({ primitiveId, net, box });
    if (result.length >= limit) break;
  }
  return result;
}

async function collectViaObstacleBoxes(limit = 10000): Promise<Array<{ primitiveId: string; net: string; box: Box }>> {
  const rows = await anyEda()?.pcb_PrimitiveVia?.getAll?.();
  const result: Array<{ primitiveId: string; net: string; box: Box }> = [];
  if (!Array.isArray(rows)) return result;

  for (const row of rows) {
    const primitiveId = readFirstStringValue(row, ['getState_PrimitiveId']);
    if (!primitiveId) continue;
    const net = readFirstStringValue(row, ['getState_Net', 'getState_NetName']);
    const measuredBox = await getBBoxOfPrimitive(row);
    const estimatedBox = buildObstacleBoxFromPrimitiveRow(row, ['getState_Diameter']);
    const box = firstBox([measuredBox, estimatedBox]);
    if (!box) continue;
    result.push({ primitiveId, net, box });
    if (result.length >= limit) break;
  }
  return result;
}

async function detectSilkscreenConflicts(
  silkscreens: any[],
): Promise<{
  perSilk: Map<string, any[]>;
  stats: { totalConflicts: number; byType: Record<string, number> };
  boardBox?: Box;
}> {
  const padObstacles = await collectPadObstacleBoxes();
  const viaObstacles = await collectViaObstacleBoxes();
  const boardBox = await getBoardBoundingBox();
  const perSilk = new Map<string, any[]>();
  const byType: Record<string, number> = {};
  let totalConflicts = 0;

  const pushConflict = (silkId: string, conflict: any) => {
    if (!perSilk.has(silkId)) perSilk.set(silkId, []);
    perSilk.get(silkId)!.push(conflict);
    const key = String(conflict.type || 'unknown');
    byType[key] = (byType[key] || 0) + 1;
    totalConflicts += 1;
  };

  for (const silk of silkscreens) {
    const silkBox: Box | undefined = silk?.bbox;
    const silkId = String(silk?.primitiveId || '');
    if (!silkBox || !silkId) continue;

    if (boardBox && !boxInside(silkBox, boardBox, 0)) {
      pushConflict(silkId, {
        type: 'out_of_board',
        targetId: 'BOARD',
        description: 'silkscreen out of board',
      });
    }

    for (const pad of padObstacles) {
      if (boxIntersects(silkBox, pad.box, 0.5)) {
        pushConflict(silkId, {
          type: 'overlap_pad',
          targetId: pad.primitiveId,
          net: pad.net || '',
          description: 'silkscreen overlaps pad',
        });
      }
    }

    for (const via of viaObstacles) {
      if (boxIntersects(silkBox, via.box, 0.5)) {
        pushConflict(silkId, {
          type: 'overlap_via',
          targetId: via.primitiveId,
          net: via.net || '',
          description: 'silkscreen overlaps via',
        });
      }
    }
  }

  for (let i = 0; i < silkscreens.length; i += 1) {
    const a = silkscreens[i];
    const boxA: Box | undefined = a?.bbox;
    const idA = String(a?.primitiveId || '');
    if (!boxA || !idA) continue;

    for (let j = i + 1; j < silkscreens.length; j += 1) {
      const b = silkscreens[j];
      const boxB: Box | undefined = b?.bbox;
      const idB = String(b?.primitiveId || '');
      if (!boxB || !idB) continue;
      if (!boxIntersects(boxA, boxB, 0.5)) continue;

      pushConflict(idA, {
        type: 'overlap_silkscreen',
        targetId: idB,
        description: 'silkscreen overlaps silkscreen',
      });
      pushConflict(idB, {
        type: 'overlap_silkscreen',
        targetId: idA,
        description: 'silkscreen overlaps silkscreen',
      });
    }
  }

  return {
    perSilk,
    stats: {
      totalConflicts,
      byType,
    },
    boardBox: boardBox || undefined,
  };
}

// ─── Public silkscreen commands ───

export async function getSilkscreens(params?: { includeConflicts?: boolean; onlyConflicted?: boolean; limit?: number }): Promise<any> {
  const rows = await collectSilkscreenRows();
  const selectedSet = await getSelectedPrimitiveIdSet();
  const limitRaw = toFinite(params?.limit, 20000);
  const limit = Math.max(1, Math.floor(limitRaw));

  const silkscreens: any[] = [];
  for (const row of rows) {
    const item = await buildSilkscreenItem(row, selectedSet);
    if (!item) continue;
    silkscreens.push(item);
    if (silkscreens.length >= limit) break;
  }

  const includeConflicts = Boolean(params?.includeConflicts || params?.onlyConflicted);
  if (!includeConflicts) {
    return {
      totalSilkscreens: silkscreens.length,
      returnedSilkscreens: silkscreens.length,
      silkscreens,
    };
  }

  const conflictResult = await detectSilkscreenConflicts(silkscreens);
  const onlyConflicted = Boolean(params?.onlyConflicted);
  const output = [];
  for (const item of silkscreens) {
    const conflicts = conflictResult.perSilk.get(item.primitiveId) || [];
    const next = {
      ...item,
      hasConflict: conflicts.length > 0,
      conflicts,
      conflictCount: conflicts.length,
    };
    if (!onlyConflicted || next.hasConflict) {
      output.push(next);
    }
  }

  return {
    totalSilkscreens: silkscreens.length,
    returnedSilkscreens: output.length,
    conflictSummary: conflictResult.stats,
    boardBox: conflictResult.boardBox || null,
    silkscreens: output,
  };
}

export async function moveSilkscreen(params: { primitiveId: string; x: number; y: number; rotation?: number }): Promise<any> {
  const api = anyEda();
  if (!params?.primitiveId) throw new Error('primitiveId is required');
  if (!Number.isFinite(Number(params?.x)) || !Number.isFinite(Number(params?.y))) {
    throw new Error('x/y must be numbers');
  }
  if (!api?.pcb_PrimitiveString?.modify) {
    throw new Error('current EDA does not support silkscreen modify');
  }

  const property: any = {
    x: Number(params.x),
    y: Number(params.y),
  };
  if (params.rotation !== undefined) {
    property.rotation = Number(params.rotation);
  }

  await api.pcb_PrimitiveString.modify(String(params.primitiveId), property);
  return {
    primitiveId: String(params.primitiveId),
    x: Number(params.x),
    y: Number(params.y),
    rotation: params.rotation !== undefined ? Number(params.rotation) : undefined,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function makeTranslatedSilkBox(item: any, x: number, y: number, rotation: number): Box {
  const w = Math.max(1, toFinite(item?.width, 10));
  const h = Math.max(1, toFinite(item?.height, 10));
  const vertical = isVerticalAngle(rotation);
  return createBoxFromCenter(x, y, vertical ? h : w, vertical ? w : h);
}

export async function autoSilkscreen(params?: {
  maxMoves?: number;
  step?: number;
  maxRadius?: number;
  tryAngles?: number[];
  onlyConflicted?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveString?.modify) {
    throw new Error('current EDA does not support silkscreen modify');
  }

  const maxMoves = Math.max(1, Math.floor(toFinite(params?.maxMoves, 80)));
  const step = Math.max(2, toFinite(params?.step, 12));
  const maxRadius = Math.max(step, toFinite(params?.maxRadius, 96));
  const angleCandidatesBase = Array.isArray(params?.tryAngles) && params?.tryAngles.length > 0
    ? params!.tryAngles.map((a) => toFinite(a, 0))
    : [0, 90, 180, -90];

  const silkResult = await getSilkscreens({ includeConflicts: true, onlyConflicted: Boolean(params?.onlyConflicted) });
  const items: any[] = Array.isArray(silkResult?.silkscreens) ? silkResult.silkscreens : [];
  if (items.length === 0) {
    return {
      total: 0,
      moved: 0,
      improved: 0,
      skipped: 0,
      details: [],
    };
  }

  const padObstacles = await collectPadObstacleBoxes();
  const viaObstacles = await collectViaObstacleBoxes();
  const boardBox = (await getBoardBoundingBox()) || undefined;

  const fixedBoxes = new Map<string, Box>();
  for (const item of items) {
    if (item?.primitiveId && item?.bbox) {
      fixedBoxes.set(String(item.primitiveId), item.bbox as Box);
    }
  }

  const evaluateScore = (selfId: string, candidateBox: Box): number => {
    let score = 0;
    for (const pad of padObstacles) {
      if (boxIntersects(candidateBox, pad.box, 0.5)) score += 20;
    }
    for (const via of viaObstacles) {
      if (boxIntersects(candidateBox, via.box, 0.5)) score += 18;
    }
    for (const [otherId, otherBox] of fixedBoxes.entries()) {
      if (otherId === selfId) continue;
      if (boxIntersects(candidateBox, otherBox, 0.5)) score += 12;
    }
    if (boardBox && !boxInside(candidateBox, boardBox, 0)) {
      score += 50;
    }
    return score;
  };

  const sortItems = [...items].sort((a, b) => Number(b?.conflictCount || 0) - Number(a?.conflictCount || 0));
  const details: any[] = [];
  let moved = 0;
  let improved = 0;
  let skipped = 0;

  for (const item of sortItems) {
    if (moved >= maxMoves) break;
    const primitiveId = String(item?.primitiveId || '');
    if (!primitiveId || item?.locked) {
      skipped += 1;
      continue;
    }

    const originalX = toFinite(item.x, 0);
    const originalY = toFinite(item.y, 0);
    const originalRot = toFinite(item.rotation, 0);
    const originalBox = makeTranslatedSilkBox(item, originalX, originalY, originalRot);
    const originalScore = evaluateScore(primitiveId, originalBox);

    let best = {
      x: originalX,
      y: originalY,
      rotation: originalRot,
      score: originalScore,
      distance: 0,
    };

    const directionCandidates = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [0, 0],
    ];

    const tryAngles = Array.from(new Set([originalRot, ...angleCandidatesBase]));
    for (let radius = 0; radius <= maxRadius; radius += step) {
      for (const [dx, dy] of directionCandidates) {
        const x = round3(originalX + dx * radius);
        const y = round3(originalY + dy * radius);
        for (const rotation of tryAngles) {
          const box = makeTranslatedSilkBox(item, x, y, rotation);
          const score = evaluateScore(primitiveId, box);
          const distance = Math.hypot(x - originalX, y - originalY);
          if (score < best.score || (score === best.score && distance < best.distance)) {
            best = { x, y, rotation, score, distance };
          }
          if (best.score === 0 && best.distance <= step) {
            break;
          }
        }
      }
    }

    if (best.score < originalScore) {
      await api.pcb_PrimitiveString.modify(primitiveId, {
        x: best.x,
        y: best.y,
        rotation: best.rotation,
      });
      moved += 1;
      improved += 1;
      const finalBox = makeTranslatedSilkBox(item, best.x, best.y, best.rotation);
      fixedBoxes.set(primitiveId, finalBox);
      details.push({
        primitiveId,
        from: { x: originalX, y: originalY, rotation: originalRot, score: originalScore },
        to: { x: best.x, y: best.y, rotation: best.rotation, score: best.score },
      });
    } else {
      skipped += 1;
      details.push({
        primitiveId,
        from: { x: originalX, y: originalY, rotation: originalRot, score: originalScore },
        skipped: true,
      });
    }
  }

  return {
    total: sortItems.length,
    moved,
    improved,
    skipped,
    details,
  };
}
