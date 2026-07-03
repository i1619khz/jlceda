import { anyEda } from './util';

// ─── Board / Project / Document management ───

export async function getBoardInfo(): Promise<any> {
  const api = anyEda();
  if (!api?.dmt_Board?.getCurrentBoardInfo) {
    throw new Error('current EDA does not support dmt_Board.getCurrentBoardInfo');
  }
  const info = await api.dmt_Board.getCurrentBoardInfo();
  return {
    name: String(info?.name || info?.title || ''),
    schematicUuid: String(info?.schematicUuid || info?.schUuid || info?.sch_uuid || ''),
    pcbUuid: String(info?.pcbUuid || info?.pcb_uuid || ''),
  };
}

export async function getCurrentProjectInfo(): Promise<any> {
  const api = anyEda();
  if (!api?.dmt_Project?.getCurrentProjectInfo) {
    throw new Error('current EDA does not support dmt_Project.getCurrentProjectInfo');
  }
  const info = await api.dmt_Project.getCurrentProjectInfo();
  if (!info) {
    return {
      project: null,
      note: 'no current project info returned; ensure a project is open and has had focus',
    };
  }

  const documents: any[] = [];
  const data = Array.isArray(info.data) ? info.data : [];
  for (const item of data) {
    const type = item?.itemType || '';
    const base = {
      itemType: type,
      uuid: item?.uuid || '',
      name: item?.name || '',
      parentProjectUuid: item?.parentProjectUuid || '',
    };
    if (type === 'SCHEMATIC' || type === 'CBB_SCHEMATIC') {
      const pages = Array.isArray(item.page)
        ? item.page.map((p: any) => ({
            itemType: p?.itemType || 'SCHEMATIC_PAGE',
            uuid: p?.uuid || '',
            name: p?.name || '',
            parentSchematicUuid: p?.parentSchematicUuid || item?.uuid || '',
          }))
        : [];
      documents.push({ ...base, page: pages });
    } else {
      documents.push(base);
    }
  }

  return {
    project: {
      uuid: info?.uuid || '',
      name: info?.name || '',
      friendlyName: info?.friendlyName || info?.name || '',
      description: info?.description || '',
      documents,
      documentCount: documents.length,
    },
  };
}

export async function getOpenDocuments(): Promise<any> {
  const api = anyEda();
  if (!api?.dmt_EditorControl) {
    throw new Error('current EDA does not support dmt_EditorControl');
  }

  let currentDoc: any = null;
  try {
    const info = await api.dmt_EditorControl.getCurrentDocumentInfo();
    if (info) {
      currentDoc = {
        documentType: info.documentType,
        uuid: info.uuid || '',
        tabId: info.tabId || '',
      };
    }
  } catch { /* ignore */ }

  let documents: any[] = [];
  try {
    const tree = await api.dmt_EditorControl.getSplitScreenTree();
    const collectTabs = (node: any) => {
      if (!node) return;
      if (Array.isArray(node.tabs)) {
        for (const tab of node.tabs) {
          documents.push({
            documentType: tab.documentType,
            uuid: tab.uuid || tab.documentUuid || '',
            tabId: tab.tabId || tab.id || '',
            title: tab.title || tab.name || '',
          });
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) collectTabs(child);
      }
    };
    if (tree) collectTabs(tree);
  } catch { /* ignore */ }

  return { current: currentDoc, documents };
}

export async function activateDocument(params: { tabId: string }): Promise<any> {
  const api = anyEda();
  if (!api?.dmt_EditorControl?.activateDocument) {
    throw new Error('current EDA does not support dmt_EditorControl.activateDocument');
  }
  const { tabId } = params;
  if (!tabId) throw new Error('tabId is required');
  const result = await api.dmt_EditorControl.activateDocument(tabId);
  await new Promise(r => setTimeout(r, 500));
  return { activated: tabId, success: Boolean(result) };
}

export async function openDocument(params: { uuid: string }): Promise<any> {
  const api = anyEda();
  if (!api?.dmt_EditorControl?.openDocument) {
    throw new Error('current EDA does not support dmt_EditorControl.openDocument');
  }
  const uuid = String(params?.uuid || '').trim();
  if (!uuid) throw new Error('uuid is required');
  await api.dmt_EditorControl.openDocument(uuid);
  await new Promise(r => setTimeout(r, 500));
  return { opened: uuid };
}

// ─── Import / Save ───

export async function pcbImportChanges(params: { uuid?: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Document?.importChanges) {
    throw new Error('current EDA does not support pcb_Document.importChanges');
  }
  const result = await api.pcb_Document.importChanges(params?.uuid);
  return { success: Boolean(result) };
}

export async function schSave(): Promise<any> {
  const api = anyEda();
  if (!api?.sch_Document?.save) {
    throw new Error('current EDA does not support sch_Document.save');
  }
  const result = await api.sch_Document.save();
  return { success: Boolean(result) };
}

export async function pcbSave(): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_Document?.save) {
    throw new Error('current EDA does not support pcb_Document.save');
  }
  const result = await api.pcb_Document.save();
  return { success: Boolean(result) };
}

// ─── Manufacturing exports ───

export async function pcbExportGerber(params: { fileName?: string }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_ManufactureData?.getGerberFile) {
    throw new Error('current EDA does not support pcb_ManufactureData.getGerberFile');
  }
  if (!api?.sys_FileSystem?.saveFile) {
    throw new Error('current EDA does not support sys_FileSystem.saveFile');
  }
  const file = await api.pcb_ManufactureData.getGerberFile(params?.fileName);
  if (!file) throw new Error('failed to generate Gerber file');
  await api.sys_FileSystem.saveFile(file, params?.fileName || 'gerber.zip');
  return { success: true, fileName: params?.fileName || 'gerber.zip' };
}

export async function pcbExportBom(params: { fileName?: string; fileType?: 'xlsx' | 'csv' }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_ManufactureData?.getBomFile) {
    throw new Error('current EDA does not support pcb_ManufactureData.getBomFile');
  }
  if (!api?.sys_FileSystem?.saveFile) {
    throw new Error('current EDA does not support sys_FileSystem.saveFile');
  }
  const fileType = params?.fileType || 'csv';
  const fileName = params?.fileName || `bom.${fileType}`;
  const file = await api.pcb_ManufactureData.getBomFile(fileName, fileType);
  if (!file) throw new Error('failed to generate BOM file');
  await api.sys_FileSystem.saveFile(file, fileName);
  return { success: true, fileName };
}

export async function pcbExportPickPlace(params: { fileName?: string; fileType?: 'xlsx' | 'csv' }): Promise<any> {
  const api = anyEda();
  if (!api?.pcb_ManufactureData?.getPickAndPlaceFile) {
    throw new Error('current EDA does not support pcb_ManufactureData.getPickAndPlaceFile');
  }
  if (!api?.sys_FileSystem?.saveFile) {
    throw new Error('current EDA does not support sys_FileSystem.saveFile');
  }
  const fileType = params?.fileType || 'csv';
  const fileName = params?.fileName || `pickplace.${fileType}`;
  const file = await api.pcb_ManufactureData.getPickAndPlaceFile(fileName, fileType);
  if (!file) throw new Error('failed to generate pick-and-place file');
  await api.sys_FileSystem.saveFile(file, fileName);
  return { success: true, fileName };
}
