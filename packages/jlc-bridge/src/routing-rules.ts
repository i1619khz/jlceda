import { anyEda } from './util';

// ─── Differential pairs ───

export async function createDifferentialPair(params: { name: string; positiveNet: string; negativeNet: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.createDifferentialPair) {
    throw new Error('current EDA does not support differential pair');
  }

  const name = String(params?.name || '').trim();
  const positiveNet = String(params?.positiveNet || '').trim();
  const negativeNet = String(params?.negativeNet || '').trim();
  if (!name || !positiveNet || !negativeNet) {
    throw new Error('name/positiveNet/negativeNet are required');
  }

  const ok = await api.pcb_Drc.createDifferentialPair(name, positiveNet, negativeNet);
  return { created: Boolean(ok), name, positiveNet, negativeNet };
}

export async function deleteDifferentialPair(params: { name: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.deleteDifferentialPair) {
    throw new Error('current EDA does not support differential pair');
  }
  const name = String(params?.name || '').trim();
  if (!name) throw new Error('name is required');
  const ok = await api.pcb_Drc.deleteDifferentialPair(name);
  return { deleted: Boolean(ok), name };
}

export async function listDifferentialPairs(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getAllDifferentialPairs) {
    throw new Error('current EDA does not support differential pair');
  }
  const rows = await api.pcb_Drc.getAllDifferentialPairs();
  const pairs = Array.isArray(rows)
    ? rows.map((row: any) => ({
        name: String(row?.name || ''),
        positiveNet: String(row?.positiveNet || ''),
        negativeNet: String(row?.negativeNet || ''),
      }))
    : [];
  return { totalPairs: pairs.length, pairs };
}

// ─── Equal-length groups ───

export async function createEqualLengthGroup(params: {
  name: string;
  nets: string[];
  color?: { r: number; g: number; b: number; alpha: number };
}): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.createEqualLengthNetGroup) {
    throw new Error('current EDA does not support equal-length group');
  }
  const name = String(params?.name || '').trim();
  const nets = Array.isArray(params?.nets)
    ? params.nets.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!name || nets.length === 0) {
    throw new Error('name and nets are required');
  }
  const color = params?.color || { r: 255, g: 128, b: 0, alpha: 1 };
  const ok = await api.pcb_Drc.createEqualLengthNetGroup(name, nets, color);
  return { created: Boolean(ok), name, nets, color };
}

export async function deleteEqualLengthGroup(params: { name: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.deleteEqualLengthNetGroup) {
    throw new Error('current EDA does not support equal-length group');
  }
  const name = String(params?.name || '').trim();
  if (!name) throw new Error('name is required');
  const ok = await api.pcb_Drc.deleteEqualLengthNetGroup(name);
  return { deleted: Boolean(ok), name };
}

export async function listEqualLengthGroups(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Drc?.getAllEqualLengthNetGroups) {
    throw new Error('current EDA does not support equal-length group');
  }
  const rows = await api.pcb_Drc.getAllEqualLengthNetGroups();
  const groups = Array.isArray(rows)
    ? rows.map((row: any) => ({
        name: String(row?.name || ''),
        nets: Array.isArray(row?.nets) ? row.nets : [],
        color: row?.color || null,
      }))
    : [];
  return { totalGroups: groups.length, groups };
}
