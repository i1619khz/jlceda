import { anyEda } from './util';

// ─── Schematic state / read ───

export async function getSchematicState(): Promise<any> {
  const api = anyEda();
  if (!api?.sch_PrimitiveComponent?.getAll) {
    throw new Error('current EDA does not support sch_PrimitiveComponent.getAll');
  }

  const rows = await api.sch_PrimitiveComponent.getAll(undefined, true);
  const components = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    primitiveId: r?.getState_PrimitiveId?.() || '',
    designator: r?.getState_Designator?.() || '',
    name: r?.getState_Name?.() || r?.getState_DisplayName?.() || '',
    value: r?.getState_Value?.() || '',
    component: {
      libraryUuid: r?.getState_LibraryUuid?.() || r?.getState_ComponentLibraryUuid?.() || '',
      uuid: r?.getState_Uuid?.() || r?.getState_ComponentUuid?.() || '',
    },
  })).filter((c: any) => c.primitiveId);

  let pins: any[] = [];
  if (api?.sch_PrimitivePin?.getAll) {
    try {
      const pinRows = await api.sch_PrimitivePin.getAll();
      pins = (Array.isArray(pinRows) ? pinRows : []).map((p: any) => ({
        primitiveId: p?.getState_PrimitiveId?.() || '',
        pinNumber: p?.getState_PinNumber?.() || p?.getState_Number?.() || '',
        pinName: p?.getState_PinName?.() || p?.getState_Name?.() || '',
        net: p?.getState_Net?.() || p?.getState_NetName?.() || '',
        x: Number(p?.getState_X?.() ?? 0),
        y: Number(p?.getState_Y?.() ?? 0),
      })).filter((p: any) => p.primitiveId);
    } catch { /* ignore */ }
  }

  let wires: any[] = [];
  if (api?.sch_PrimitiveWire?.getAll) {
    try {
      const wireRows = await api.sch_PrimitiveWire.getAll();
      wires = (Array.isArray(wireRows) ? wireRows : []).map((w: any) => ({
        primitiveId: w?.getState_PrimitiveId?.() || '',
        net: w?.getState_Net?.() || w?.getState_NetName?.() || '',
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

  const getVal = (obj: any, ...keys: string[]) => {
    for (const k of keys) {
      if (typeof obj?.[`getState_${k}`] === 'function') {
        const v = obj[`getState_${k}`]();
        if (v !== undefined && v !== '') return v;
      }
      if (obj?.[k] !== undefined && obj?.[k] !== '') return obj[k];
    }
    return '';
  };

  let pinRows: any[] = [];

  if (api?.sch_PrimitiveComponent?.getAllPinsByPrimitiveId) {
    try {
      const result = await api.sch_PrimitiveComponent.getAllPinsByPrimitiveId(primitiveId);
      if (Array.isArray(result) && result.length > 0) pinRows = result;
    } catch { /* fallback below */ }
  }

  if (pinRows.length === 0 && api?.sch_PrimitivePin?.getAll) {
    try {
      const allPins = await api.sch_PrimitivePin.getAll();
      if (Array.isArray(allPins)) {
        pinRows = allPins.filter((p: any) => {
          const parent = getVal(p, 'ParentPrimitiveId', 'ComponentPrimitiveId', 'Parent');
          return parent === primitiveId;
        });
      }
    } catch { /* ignore */ }
  }

  if (pinRows.length === 0 && api?.sch_PrimitivePin?.getAll) {
    try {
      const allPins = await api.sch_PrimitivePin.getAll();
      if (Array.isArray(allPins)) pinRows = allPins;
    } catch { /* ignore */ }
  }

  const pins = pinRows.map((p: any) => {
    const x = Number(getVal(p, 'X', 'Position_X') ?? 0);
    const y = Number(getVal(p, 'Y', 'Position_Y') ?? 0);
    const rotation = Number(getVal(p, 'Rotation') ?? 0);
    const pinLength = Number(getVal(p, 'PinLength') ?? 0);
    const rad = rotation * Math.PI / 180;
    const endX = x + Math.cos(rad) * pinLength;
    const endY = y + Math.sin(rad) * pinLength;
    return {
      primitiveId: getVal(p, 'PrimitiveId') || p?.primitiveId || '',
      pinNumber: getVal(p, 'PinNumber', 'Number'),
      pinName: getVal(p, 'PinName', 'Name'),
      net: getVal(p, 'Net', 'NetName'),
      x, y, rotation, pinLength,
      endPoint: { x: Math.round(endX * 100) / 100, y: Math.round(endY * 100) / 100 },
      parent: getVal(p, 'ParentPrimitiveId', 'ComponentPrimitiveId', 'Parent'),
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
