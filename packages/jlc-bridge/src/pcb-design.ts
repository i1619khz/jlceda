import { anyEda } from './util';

// ─── Layer management ───

export async function getLayers(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Layer?.getAllLayers) {
    throw new Error('current EDA does not support pcb_Layer.getAllLayers');
  }
  const rows = await api.pcb_Layer.getAllLayers();
  const layers = (Array.isArray(rows) ? rows : []).map((l: any) => ({
    id: l?.id,
    name: String(l?.name || ''),
    type: String(l?.type || ''),
    color: String(l?.color || ''),
    transparency: Number(l?.transparency ?? 0),
    layerStatus: l?.layerStatus,
    locked: Boolean(l?.locked),
  }));

  let copperLayerCount: number | undefined;
  if (api?.pcb_Layer?.getTheNumberOfCopperLayers) {
    try { copperLayerCount = await api.pcb_Layer.getTheNumberOfCopperLayers(); } catch { /* ignore */ }
  }

  let currentLayerId: any;
  if (api?.pcb_Layer?.getCurrentLayer) {
    try { currentLayerId = await api.pcb_Layer.getCurrentLayer(); } catch { /* ignore */ }
  }

  return {
    copperLayerCount,
    currentLayerId,
    totalLayers: layers.length,
    layers,
  };
}

export async function setCopperLayers(params: { count: number }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Layer?.setTheNumberOfCopperLayers) {
    throw new Error('current EDA does not support pcb_Layer.setTheNumberOfCopperLayers');
  }
  const count = Math.max(2, Math.floor(Number(params?.count) || 2));
  await api.pcb_Layer.setTheNumberOfCopperLayers(count);
  return { copperLayerCount: count };
}

export async function setLayerVisible(params: { layerId: number; visible: boolean }): Promise<any> {
  const api = anyEda();
  const { layerId, visible } = params;
  if (!Number.isFinite(Number(layerId))) throw new Error('layerId is required');
  if (visible) {
    if (!api?.pcb_Layer?.setLayerVisible) throw new Error('current EDA does not support setLayerVisible');
    await api.pcb_Layer.setLayerVisible(Number(layerId));
  } else {
    if (!api?.pcb_Layer?.setLayerInvisible) throw new Error('current EDA does not support setLayerInvisible');
    await api.pcb_Layer.setLayerInvisible(Number(layerId));
  }
  return { layerId: Number(layerId), visible: Boolean(visible) };
}

// ─── Net management ───

export async function getAllNets(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Net?.getAllNets) {
    throw new Error('current EDA does not support pcb_Net.getAllNets');
  }
  const rows = await api.pcb_Net.getAllNets();
  const nets = (Array.isArray(rows) ? rows : []).map((n: any) => {
    const get = (obj: any, ...ks: string[]) => {
      for (const k of ks) {
        if (obj?.[k] !== undefined && obj?.[k] !== '') return obj[k];
        if (typeof obj?.[`getState_${k}`] === 'function') {
          try { const v = obj[`getState_${k}`](); if (v !== undefined && v !== '') return v; } catch { /* ignore */ }
        }
      }
      return '';
    };
    return {
      name: get(n, 'net', 'name', 'netName'),
      color: get(n, 'color'),
      length: get(n, 'length'),
      pinCount: get(n, 'pinCount', 'padCount'),
    };
  });
  return { totalNets: nets.length, nets };
}

export async function getNetDetails(params: { net: string }): Promise<any> {
  const api = anyEda();
  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');

  let length: number | undefined;
  let color: string | undefined;
  if (api?.pcb_Net?.getNetLength) { try { length = await api.pcb_Net.getNetLength(net); } catch { /* ignore */ } }
  if (api?.pcb_Net?.getNetColor) { try { color = await api.pcb_Net.getNetColor(net); } catch { /* ignore */ } }

  let primitives: any = null;
  if (api?.pcb_Net?.getAllPrimitivesByNet) {
    try {
      const rows = await api.pcb_Net.getAllPrimitivesByNet(net);
      primitives = Array.isArray(rows) ? rows.length : typeof rows;
    } catch { /* ignore */ }
  }

  return { net, length, color, primitiveCount: primitives };
}

export async function selectNet(params: { net: string; select?: boolean }): Promise<any> {
  const api = anyEda();
  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');
  const select = params?.select !== false;
  if (select) {
    if (!api?.pcb_Net?.selectNet) throw new Error('current EDA does not support selectNet');
    await api.pcb_Net.selectNet(net);
  } else {
    if (!api?.pcb_Net?.unselectNet) throw new Error('current EDA does not support unselectNet');
    await api.pcb_Net.unselectNet(net);
  }
  return { net, selected: select };
}

export async function highlightNet(params: { net: string; highlight?: boolean }): Promise<any> {
  const api = anyEda();
  const net = String(params?.net || '').trim();
  if (!net) throw new Error('net is required');
  const highlight = params?.highlight !== false;
  if (highlight) {
    if (!api?.pcb_Net?.highlightNet) throw new Error('current EDA does not support highlightNet');
    await api.pcb_Net.highlightNet(net);
  } else {
    if (!api?.pcb_Net?.unhighlightNet) throw new Error('current EDA does not support unhighlightNet');
    await api.pcb_Net.unhighlightNet(net);
  }
  return { net, highlighted: highlight };
}

// ─── NetClass management ───

export async function createNetClass(params: { name: string; nets?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.createNetClass) throw new Error('current EDA does not support createNetClass');
  const name = String(params?.name || '').trim();
  if (!name) throw new Error('name is required');
  const nets = Array.isArray(params?.nets) ? params.nets.map((n) => String(n || '').trim()).filter(Boolean) : [];
  const ok = await api.pcb_Drc.createNetClass(name, nets);
  return { created: Boolean(ok), name, nets };
}

export async function deleteNetClass(params: { name: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.deleteNetClass) throw new Error('current EDA does not support deleteNetClass');
  const name = String(params?.name || '').trim();
  if (!name) throw new Error('name is required');
  const ok = await api.pcb_Drc.deleteNetClass(name);
  return { deleted: Boolean(ok), name };
}

export async function addNetToClass(params: { className: string; net: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.addNetToNetClass) throw new Error('current EDA does not support addNetToNetClass');
  const className = String(params?.className || '').trim();
  const net = String(params?.net || '').trim();
  if (!className || !net) throw new Error('className and net are required');
  const ok = await api.pcb_Drc.addNetToNetClass(className, net);
  return { added: Boolean(ok), className, net };
}

export async function listNetClasses(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getAllNetClasses) throw new Error('current EDA does not support getAllNetClasses');
  const rows = await api.pcb_Drc.getAllNetClasses();
  const classes = (Array.isArray(rows) ? rows : []).map((c: any) => ({
    name: String(c?.name || c?.className || ''),
    nets: Array.isArray(c?.nets) ? c.nets : (Array.isArray(c) ? c : []),
    raw: c,
  }));
  return { totalClasses: classes.length, classes };
}

// ─── DRC rules ───

export async function getDrcRules(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getCurrentRuleConfiguration && !api?.pcb_Drc?.getAllRuleConfigurations) {
    throw new Error('current EDA does not support DRC rule configuration');
  }
  let currentName: string | undefined;
  let current: any = null;
  let all: any[] = [];
  if (api?.pcb_Drc?.getCurrentRuleConfigurationName) {
    try { currentName = await api.pcb_Drc.getCurrentRuleConfigurationName(); } catch { /* ignore */ }
  }
  if (api?.pcb_Drc?.getCurrentRuleConfiguration) {
    try { current = await api.pcb_Drc.getCurrentRuleConfiguration(); } catch { /* ignore */ }
  }
  if (api?.pcb_Drc?.getAllRuleConfigurations) {
    try { const rows = await api.pcb_Drc.getAllRuleConfigurations(); all = Array.isArray(rows) ? rows : []; } catch { /* ignore */ }
  }
  return { currentRuleName: currentName, currentRule: current, allRuleNames: all.map((r: any) => r?.name || r) };
}

// ─── Region rules (per-region spacing overrides) ───

export async function getRegionRules(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getRegionRules) {
    throw new Error('current EDA does not support getRegionRules');
  }
  const rows = await api.pcb_Drc.getRegionRules();
  const rules = Array.isArray(rows) ? rows : [];
  return { totalRegionRules: rules.length, regionRules: rules };
}

export async function overwriteRegionRules(params: { regionRules: any[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.overwriteRegionRules) {
    throw new Error('current EDA does not support overwriteRegionRules');
  }
  const rules = Array.isArray(params?.regionRules) ? params.regionRules : [];
  const ok = await api.pcb_Drc.overwriteRegionRules(rules);
  return { overwritten: Boolean(ok), count: rules.length };
}

// ─── Net rules (per-net / per-netclass rule overrides) ───

export async function getNetRules(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getNetRules) {
    throw new Error('current EDA does not support getNetRules');
  }
  const rows = await api.pcb_Drc.getNetRules();
  const rules = Array.isArray(rows) ? rows : [];
  return { totalNetRules: rules.length, netRules: rules };
}

export async function getNetByNetRules(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getNetByNetRules) {
    throw new Error('current EDA does not support getNetByNetRules');
  }
  const rows = await api.pcb_Drc.getNetByNetRules();
  const rules = Array.isArray(rows) ? rows : [];
  return { totalNetByNetRules: rules.length, netByNetRules: rules };
}

export async function overwriteNetRules(params: { netRules: any[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.overwriteNetRules) {
    throw new Error('current EDA does not support overwriteNetRules');
  }
  const rules = Array.isArray(params?.netRules) ? params.netRules : [];
  const ok = await api.pcb_Drc.overwriteNetRules(rules);
  return { overwritten: Boolean(ok), count: rules.length };
}

// ─── Primitive graphics: arc / polyline / fill ───

function getPid(p: any): string {
  try { const id = p?.getState_PrimitiveId?.(); if (typeof id === 'string' && id.trim()) return id.trim(); } catch { /* ignore */ }
  return p?.primitiveId || '';
}

export async function createArc(params: {
  net?: string; layer: number; startX: number; startY: number; endX: number; endY: number;
  arcAngle: number; lineWidth?: number; primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveArc?.create) throw new Error('current EDA does not support pcb_PrimitiveArc.create');
  const { net = '', layer, startX, startY, endX, endY, arcAngle, lineWidth = 6, primitiveLock = false } = params;
  if (!Number.isFinite(layer) || !Number.isFinite(startX)) throw new Error('layer/startX/startY/endX/endY/arcAngle are required');
  const arc = await api.pcb_PrimitiveArc.create(net, Number(layer), Number(startX), Number(startY), Number(endX), Number(endY), Number(arcAngle), Number(lineWidth), undefined, Boolean(primitiveLock));
  return { primitiveId: getPid(arc), net, layer, startX, startY, endX, endY, arcAngle, lineWidth };
}

export async function deleteArc(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveArc?.delete) throw new Error('current EDA does not support pcb_PrimitiveArc.delete');
  const ids = Array.isArray(params?.primitiveIds) ? params.primitiveIds : (params?.primitiveId ? [params.primitiveId] : []);
  if (!ids.length) throw new Error('primitiveId or primitiveIds required');
  const ok = await api.pcb_PrimitiveArc.delete(ids as any);
  return { deleted: Boolean(ok), primitiveIds: ids };
}

export async function createPolyline(params: {
  net?: string; layer: number; points: Array<[number, number]>; lineWidth?: number; primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitivePolyline?.create || !api?.pcb_MathPolygon?.createPolygon) {
    throw new Error('current EDA does not support pcb_PrimitivePolyline.create');
  }
  const { net = '', layer, points, lineWidth = 6, primitiveLock = false } = params;
  if (!Array.isArray(points) || points.length < 2) throw new Error('points must have at least 2 [x,y] pairs');
  // build polygon source: [x1,y1, 'L', x2,y2, ...]
  const source: any[] = [Number(points[0][0]), Number(points[0][1])];
  for (let i = 1; i < points.length; i++) { source.push('L'); source.push(Number(points[i][0])); source.push(Number(points[i][1])); }
  const polygon = api.pcb_MathPolygon.createPolygon(source as any);
  const poly = await api.pcb_PrimitivePolyline.create(net, Number(layer), polygon, Number(lineWidth), Boolean(primitiveLock));
  return { primitiveId: getPid(poly), net, layer, pointCount: points.length, lineWidth };
}

export async function deletePolyline(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitivePolyline?.delete) throw new Error('current EDA does not support pcb_PrimitivePolyline.delete');
  const ids = Array.isArray(params?.primitiveIds) ? params.primitiveIds : (params?.primitiveId ? [params.primitiveId] : []);
  if (!ids.length) throw new Error('primitiveId or primitiveIds required');
  const ok = await api.pcb_PrimitivePolyline.delete(ids as any);
  return { deleted: Boolean(ok), primitiveIds: ids };
}

export async function createFill(params: {
  layer: number; points: Array<[number, number]>; net?: string; fillMode?: number; lineWidth?: number; primitiveLock?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveFill?.create || !api?.pcb_MathPolygon?.createPolygon) {
    throw new Error('current EDA does not support pcb_PrimitiveFill.create');
  }
  const { layer, points, net = '', fillMode = 0, lineWidth = 4, primitiveLock = false } = params;
  if (!Array.isArray(points) || points.length < 3) throw new Error('points must have at least 3 [x,y] pairs (closed region)');
  const source: any[] = [Number(points[0][0]), Number(points[0][1])];
  for (let i = 1; i < points.length; i++) { source.push('L'); source.push(Number(points[i][0])); source.push(Number(points[i][1])); }
  const polygon = api.pcb_MathPolygon.createPolygon(source as any);
  const fill = await api.pcb_PrimitiveFill.create(Number(layer), polygon, net, Number(fillMode), Number(lineWidth), Boolean(primitiveLock));
  return { primitiveId: getPid(fill), layer, net, fillMode, pointCount: points.length, lineWidth };
}

export async function deleteFill(params: { primitiveId?: string; primitiveIds?: string[] }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveFill?.delete) throw new Error('current EDA does not support pcb_PrimitiveFill.delete');
  const ids = Array.isArray(params?.primitiveIds) ? params.primitiveIds : (params?.primitiveId ? [params.primitiveId] : []);
  if (!ids.length) throw new Error('primitiveId or primitiveIds required');
  const ok = await api.pcb_PrimitiveFill.delete(ids as any);
  return { deleted: Boolean(ok), primitiveIds: ids };
}
