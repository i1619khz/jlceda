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
