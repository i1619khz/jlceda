import { anyEda } from './util';

// ─── Schematic state / read ───

export async function getSchematicState(): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveComponent?.getAll) {
    throw new Error('current EDA does not support sch_PrimitiveComponent.getAll');
  }

  const rows = await api.sch_PrimitiveComponent.getAll(undefined, true);
  const components = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    primitiveId: r?.getState_PrimitiveId?.() || r?.primitiveId || '',
    designator: r?.getState_Designator?.() || r?.designator || '',
    name: r?.getState_Name?.() || r?.name || '',
    value: r?.getState_Value?.() || r?.value || '',
    x: Number(r?.getState_X?.() ?? r?.x ?? 0),
    y: Number(r?.getState_Y?.() ?? r?.y ?? 0),
    rotation: Number(r?.getState_Rotation?.() ?? r?.rotation ?? 0),
    component: {
      libraryUuid: r?.getState_LibraryUuid?.() || r?.getState_ComponentLibraryUuid?.() || '',
      uuid: r?.getState_Uuid?.() || r?.getState_ComponentUuid?.() || '',
    },
  })).filter((c: any) => c.primitiveId);

  // Pins: sch_PrimitivePin.getAll() always returns [] — must enumerate per-component
  // via getAllPinsByPrimitiveId, and pin objects use direct properties (not getState_*).
  let pins: any[] = [];
  if (api?.sch_PrimitiveComponent?.getAllPinsByPrimitiveId) {
    for (const comp of components) {
      try {
        const pinRows = await api.sch_PrimitiveComponent.getAllPinsByPrimitiveId(comp.primitiveId);
        if (!Array.isArray(pinRows)) continue;
        for (const p of pinRows) {
          const x = Number(p?.x ?? 0);
          const y = Number(p?.y ?? 0);
          const rotation = Number(p?.rotation ?? 0);
          const pinLength = Number(p?.pinLength ?? 0);
          const rad = rotation * Math.PI / 180;
          pins.push({
            primitiveId: p?.primitiveId || '',
            parentPrimitiveId: comp.primitiveId,
            parentDesignator: comp.designator,
            pinNumber: String(p?.pinNumber ?? ''),
            pinName: String(p?.pinName ?? ''),
            net: String(p?.net ?? ''),
            x, y, rotation, pinLength,
            endPoint: { x: Math.round((x + Math.cos(rad) * pinLength) * 100) / 100, y: Math.round((y + Math.sin(rad) * pinLength) * 100) / 100 },
            noConnected: Boolean(p?.noConnected),
          });
        }
      } catch { /* ignore per-component errors */ }
    }
  }

  let wires: any[] = [];
  if (api?.sch_PrimitiveWire?.getAll) {
    try {
      const wireRows = await api.sch_PrimitiveWire.getAll();
      wires = (Array.isArray(wireRows) ? wireRows : []).map((w: any) => ({
        primitiveId: w?.getState_PrimitiveId?.() || w?.primitiveId || '',
        net: w?.getState_Net?.() || w?.net || '',
      })).filter((w: any) => w.primitiveId);
    } catch { /* ignore */ }
  }

  return { components, pins, wires };
}

export async function getNetlist(params: { type?: string }): Promise<any> {
  const api = anyEda();
  if (!api?.sch_Netlist?.getNetlist) {
    throw new Error('current EDA does not support sch_Netlist.getNetlist');
  }
  const netlist = await api.sch_Netlist.getNetlist(params?.type);
  return { netlist: typeof netlist === 'string' ? netlist : JSON.stringify(netlist) };
}

export async function runSchDrc(params: { strict?: boolean }): Promise<any> {
  const api = anyEda();
  if (!api?.sch_Drc?.check) {
    throw new Error('current EDA does not support sch_Drc.check');
  }
  const strict = params?.strict !== false;
  const result = await api.sch_Drc.check(strict, false);
  return { passed: Boolean(result) };
}

// ─── Schematic component / wire / netflag write operations ───

export async function schSearchDevice(params: { key: string; libraryUuid?: string }): Promise<any> {
  const api = anyEda();
  if (!api?.lib_Device?.search) {
    throw new Error('current EDA does not support lib_Device.search');
  }
  const { key, libraryUuid } = params;
  if (!key) throw new Error('key is required');
  const results = await api.lib_Device.search(key, libraryUuid, undefined, undefined, 10, 1);
  const items = (Array.isArray(results) ? results : []).map((r: any) => ({
    uuid: r?.uuid || '',
    libraryUuid: r?.libraryUuid || '',
    name: r?.name || r?.deviceName || '',
    designator: r?.designator || '',
    description: r?.description || '',
    manufacturer: r?.manufacturer || '',
    manufacturerId: r?.manufacturerId || '',
  })).filter((r: any) => r.uuid);
  return { count: items.length, items };
}

export async function schCreateComponent(params: {
  component: { libraryUuid: string; uuid: string };
  x: number;
  y: number;
  rotation?: number;
  mirror?: boolean;
  addIntoBom?: boolean;
  addIntoPcb?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveComponent?.create) {
    throw new Error('current EDA does not support sch_PrimitiveComponent.create');
  }
  const { component, x, y, rotation, mirror, addIntoBom, addIntoPcb } = params;
  if (!component?.libraryUuid || !component?.uuid) {
    throw new Error('component.libraryUuid and component.uuid are required');
  }
  const result = await api.sch_PrimitiveComponent.create(
    { libraryUuid: component.libraryUuid, uuid: component.uuid },
    x, y, undefined, rotation ?? 0, mirror ?? false,
    addIntoBom ?? true, addIntoPcb ?? true,
  );
  const primitiveId = result?.getState_PrimitiveId?.() || '';
  const designator = result?.getState_Designator?.() || '';
  return { primitiveId, designator };
}

export async function schCreateWire(params: {
  line: Array<number> | Array<Array<number>>;
  net?: string;
}): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveWire?.create) {
    throw new Error('current EDA does not support sch_PrimitiveWire.create');
  }
  const { line, net } = params;
  if (!Array.isArray(line) || line.length === 0) {
    throw new Error('line must be a non-empty array of coordinates');
  }
  const result = await api.sch_PrimitiveWire.create(line, net ?? undefined, null, null, null);
  const primitiveId = result?.getState_PrimitiveId?.() || '';
  return { primitiveId, net: result?.getState_Net?.() || net || '' };
}

export async function schCreateNetFlag(params: {
  type: 'Power' | 'Ground' | 'AnalogGround' | 'ProtectGround';
  net: string;
  x: number;
  y: number;
  rotation?: number;
  mirror?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveComponent?.createNetFlag) {
    throw new Error('current EDA does not support sch_PrimitiveComponent.createNetFlag');
  }
  const { type: flagType, net, x, y, rotation, mirror } = params;
  if (!net) throw new Error('net is required');
  const result = await api.sch_PrimitiveComponent.createNetFlag(
    flagType, net, x, y, rotation ?? 0, mirror ?? false,
  );
  const primitiveId = result?.getState_PrimitiveId?.() || '';
  return { primitiveId, net, type: flagType };
}

export async function schModifyComponent(params: {
  primitiveId: string;
  x?: number;
  y?: number;
  rotation?: number;
  mirror?: boolean;
  designator?: string | null;
  name?: string | null;
  addIntoBom?: boolean;
  addIntoPcb?: boolean;
}): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveComponent?.modify) {
    throw new Error('current EDA does not support sch_PrimitiveComponent.modify');
  }
  const { primitiveId, ...rest } = params;
  if (!primitiveId) throw new Error('primitiveId is required');
  const property: Record<string, any> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) property[k] = v;
  }
  const result = await api.sch_PrimitiveComponent.modify(primitiveId, property);
  const newDesignator = result?.getState_Designator?.() || '';
  return { primitiveId, designator: newDesignator };
}

export async function schGetComponentPins(params: { primitiveId: string }): Promise<any> {
  const api = anyEda();
  const { primitiveId } = params;
  if (!primitiveId) throw new Error('primitiveId is required');

  // Pin objects use direct properties (primitiveId/x/y/pinNumber/pinName/rotation/pinLength/net),
  // NOT getState_* methods. Only getAllPinsByPrimitiveId returns real pin data.
  let pinRows: any[] = [];
  if (api?.sch_PrimitiveComponent?.getAllPinsByPrimitiveId) {
    try {
      const result = await api.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId);
      if (Array.isArray(result)) pinRows = result;
    } catch { /* ignore */ }
  }

  const pins = pinRows.map((p: any) => {
    const x = Number(p?.x ?? 0);
    const y = Number(p?.y ?? 0);
    const rotation = Number(p?.rotation ?? 0);
    const pinLength = Number(p?.pinLength ?? 0);
    const rad = rotation * Math.PI / 180;
    const endX = x + Math.cos(rad) * pinLength;
    const endY = y + Math.sin(rad) * pinLength;
    return {
      primitiveId: p?.primitiveId || '',
      pinNumber: String(p?.pinNumber ?? ''),
      pinName: String(p?.pinName ?? ''),
      net: String(p?.net ?? ''),
      x, y, rotation, pinLength,
      endPoint: { x: Math.round(endX * 100) / 100, y: Math.round(endY * 100) / 100 },
      noConnected: Boolean(p?.noConnected),
    };
  });
  return { primitiveId, pins };
}

// ─── PCB component creation (shared with PCB domain, used by sch→pcb flow) ───

export async function createPcbComponent(params: {
  component: { libraryUuid: string; uuid: string };
  layer: number;
  x: number;
  y: number;
  rotation?: number;
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_PrimitiveComponent?.create) {
    throw new Error('current EDA does not support pcb_PrimitiveComponent.create');
  }
  const { component, layer, x, y, rotation } = params;
  if (!component?.libraryUuid || !component?.uuid) {
    throw new Error('component.libraryUuid and component.uuid are required');
  }
  const result = await api.pcb_PrimitiveComponent.create(
    { libraryUuid: component.libraryUuid, uuid: component.uuid },
    layer, x, y, rotation ?? 0, false,
  );
  const primitiveId = result?.getState_PrimitiveId?.() || result?.primitiveId || '';
  const designator = result?.getState_Designator?.() || result?.designator || '';
  return { primitiveId, designator };
}
