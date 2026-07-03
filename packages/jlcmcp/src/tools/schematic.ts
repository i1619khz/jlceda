import { z } from 'zod';
import { BridgeClient } from '../bridge-client.js';

export function registerSchematicTools(server: any, bridge: BridgeClient) {
  server.tool('sch_get_state', '读取原理图状态', {}, async () => {
    const data = await bridge.command('get_schematic_state');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_get_netlist', '导出网表', {
    type: z.string().optional().describe('网表格式'),
  }, async ({ type }: { type?: string }) => {
    const params: Record<string, unknown> = {};
    if (type) params.type = type;
    const data = await bridge.command('get_netlist', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_run_drc', '运行原理图 DRC', {
    strict: z.boolean().optional().describe('是否严格模式'),
  }, async ({ strict }: { strict?: boolean }) => {
    const params: Record<string, unknown> = {};
    if (strict !== undefined) params.strict = strict;
    const data = await bridge.command('run_sch_drc', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_open_document', '切换到指定文档（原理图或 PCB）', {
    uuid: z.string().describe('文档 UUID'),
  }, async ({ uuid }: { uuid: string }) => {
    const data = await bridge.command('open_document', { uuid });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data ?? { success: true }, null, 2) }] };
  });

  server.tool('pcb_get_open_documents', '获取当前所有打开的文档列表（原理图、PCB 等），包含 tabId 用于切换', {}, async () => {
    const data = await bridge.command('get_open_documents');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_get_current_project_info', '获取当前工程的详细属性，包括工程内所有文档（含未打开）的 UUID、名称、类型', {}, async () => {
    const data = await bridge.command('get_current_project_info');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_eval', '在 EDA 运行时中执行任意 JS 代码（用于探测 API 行为），代码中可直接使用全局 eda 对象；返回 {ok, result}', {
    code: z.string().describe('要执行的 JS 代码（async 函数体），可直接用 eda.xxx 调用 API，用 return 返回结果'),
  }, async ({ code }: { code: string }) => {
    const data = await bridge.command('eval', { code });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_ensure_document_open', '复合操作：按类型/名称（或 UUID）打开工程内指定文档，并返回 tabId', {
    documentType: z.enum(['schematic', 'schematic_page', 'pcb', 'panel', 'board']).describe('文档类型'),
    name: z.string().optional().describe('文档名称，如 "Schematic1"、"PCB1"；不填则匹配同类型的第一个'),
    uuid: z.string().optional().describe('文档 UUID；若提供则优先使用，不再按名称查找'),
  }, async ({ documentType, name, uuid }: { documentType: 'schematic' | 'schematic_page' | 'pcb' | 'panel' | 'board'; name?: string; uuid?: string }) => {
    let targetUuid = uuid?.trim();

    if (!targetUuid) {
      const projectInfo = (await bridge.command('get_current_project_info')) as any;
      const project = projectInfo?.project;
      if (!project || !Array.isArray(project.documents)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: '无法获取当前工程信息或工程内无文档' }, null, 2) }] };
      }

      const typeMap: Record<string, string[]> = {
        schematic: ['Schematic', 'CBB Schematic'],
        schematic_page: ['Schematic Page'],
        pcb: ['PCB', 'CBB PCB'],
        panel: ['Panel'],
        board: ['Board'],
      };
      const wanted = typeMap[documentType] || [documentType];
      const docs = project.documents as Array<any>;
      let candidates: any[] = [];

      for (const doc of docs) {
        if (wanted.includes(doc?.itemType)) candidates.push(doc);
        if (documentType === 'schematic_page' && Array.isArray(doc?.page)) {
          for (const page of doc.page) {
            if (wanted.includes(page?.itemType)) candidates.push(page);
          }
        }
      }

      if (name?.trim()) {
        const n = name.trim();
        candidates = candidates.filter(c => (c?.name || '').toLowerCase() === n.toLowerCase());
      }

      if (candidates.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `未找到类型为 ${documentType}${name ? ` 且名称为 "${name}"` : ''} 的文档` }, null, 2) }] };
      }

      // For schematic type, prefer the page uuid (openDocument only opens pages, not the schematic root)
      let targetDoc = candidates[0];
      if (documentType === 'schematic' && Array.isArray(targetDoc?.page) && targetDoc.page.length > 0) {
        const matchingPage = name?.trim()
          ? targetDoc.page.find((pg: any) => (pg?.name || '').toLowerCase() === name.trim().toLowerCase())
          : targetDoc.page[0];
        if (matchingPage?.uuid) targetDoc = matchingPage;
      }

      targetUuid = targetDoc?.uuid;
      if (!targetUuid) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: '匹配到的文档没有 UUID' }, null, 2) }] };
      }
    }

    await bridge.command('open_document', { uuid: targetUuid });
    const openDocs = (await bridge.command('get_open_documents')) as any;
    const opened = (openDocs?.documents || []).find((d: any) => (d?.uuid && d.uuid === targetUuid) || (d?.title || '').toLowerCase().includes((name || '').toLowerCase()));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          uuid: targetUuid,
          tabId: opened?.tabId || null,
          title: opened?.title || null,
          documentType,
          name: name || null,
        }, null, 2),
      }],
    };
  });

  server.tool('pcb_activate_document', '切换到指定标签页（通过 tabId 激活文档，可切换原理图/PCB）', {
    tabId: z.string().describe('标签页 ID（通过 pcb_get_open_documents 获取）'),
  }, async ({ tabId }: { tabId: string }) => {
    const data = await bridge.command('activate_document', { tabId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_close_document', '关闭指定标签页文档（通过 tabId）', {
    tabId: z.string().describe('标签页 ID'),
  }, async ({ tabId }: { tabId: string }) => {
    const data = await bridge.command('close_document', { tabId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_search_device', '在嘉立创EDA器件库中搜索器件，返回 libraryUuid 和 uuid 供放置使用', {
    key: z.string().describe('搜索关键字，如 "0805电阻"、"STM32F103C8T6"、"排针"'),
    libraryUuid: z.string().optional().describe('库 UUID，默认系统库'),
  }, async ({ key, libraryUuid }: { key: string; libraryUuid?: string }) => {
    const params: Record<string, unknown> = { key };
    if (libraryUuid) params.libraryUuid = libraryUuid;
    const data = await bridge.command('sch_search_device', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_create_component', '在原理图上放置器件（指定坐标）', {
    libraryUuid: z.string().describe('器件所属库 UUID（通过 sch_search_device 获取）'),
    uuid: z.string().describe('器件 UUID（通过 sch_search_device 获取）'),
    x: z.number().describe('放置坐标 X'),
    y: z.number().describe('放置坐标 Y'),
    rotation: z.number().optional().describe('旋转角度，默认 0'),
    mirror: z.boolean().optional().describe('是否镜像，默认 false'),
    addIntoBom: z.boolean().optional().describe('是否加入 BOM，默认 true'),
    addIntoPcb: z.boolean().optional().describe('是否转到 PCB，默认 true'),
  }, async (params: { libraryUuid: string; uuid: string; x: number; y: number; rotation?: number; mirror?: boolean; addIntoBom?: boolean; addIntoPcb?: boolean }) => {
    const data = await bridge.command('sch_create_component', {
      component: { libraryUuid: params.libraryUuid, uuid: params.uuid },
      x: params.x, y: params.y,
      rotation: params.rotation, mirror: params.mirror,
      addIntoBom: params.addIntoBom, addIntoPcb: params.addIntoPcb,
    });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_create_wire', '在原理图上画导线连接器件', {
    line: z.array(z.number()).describe('多段线坐标组 [x1,y1,x2,y2,...]，连续的线段'),
    net: z.string().optional().describe('网络名称，不指定则自动跟随连接的图元'),
  }, async ({ line, net }: { line: number[]; net?: string }) => {
    const params: Record<string, unknown> = { line };
    if (net) params.net = net;
    const data = await bridge.command('sch_create_wire', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_create_netflag', '在原理图上放置电源/地网络标识（VCC/GND 等）', {
    type: z.enum(['Power', 'Ground', 'AnalogGround', 'ProtectGround']).describe('标识类型'),
    net: z.string().describe('网络名称，如 "VCC"、"GND"、"+3.3V"'),
    x: z.number().describe('放置坐标 X'),
    y: z.number().describe('放置坐标 Y'),
    rotation: z.number().optional().describe('旋转角度，默认 0'),
    mirror: z.boolean().optional().describe('是否镜像，默认 false'),
  }, async (params: { type: 'Power' | 'Ground' | 'AnalogGround' | 'ProtectGround'; net: string; x: number; y: number; rotation?: number; mirror?: boolean }) => {
    const data = await bridge.command('sch_create_netflag', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_modify_component', '修改原理图器件属性（位号、坐标、旋转等）', {
    primitiveId: z.string().describe('器件图元 ID'),
    x: z.number().optional().describe('新坐标 X'),
    y: z.number().optional().describe('新坐标 Y'),
    rotation: z.number().optional().describe('旋转角度'),
    mirror: z.boolean().optional().describe('是否镜像'),
    designator: z.string().nullable().optional().describe('位号，null 表示留空'),
    name: z.string().nullable().optional().describe('名称，null 表示留空'),
    addIntoBom: z.boolean().optional().describe('是否加入 BOM'),
    addIntoPcb: z.boolean().optional().describe('是否转到 PCB'),
  }, async (params: { primitiveId: string; x?: number; y?: number; rotation?: number; mirror?: boolean; designator?: string | null; name?: string | null; addIntoBom?: boolean; addIntoPcb?: boolean }) => {
    const { primitiveId, ...rest } = params;
    const data = await bridge.command('sch_modify_component', { primitiveId, ...rest });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_get_component_pins', '获取原理图器件的所有引脚信息（坐标、网络等）', {
    primitiveId: z.string().describe('器件图元 ID'),
  }, async ({ primitiveId }: { primitiveId: string }) => {
    const data = await bridge.command('sch_get_component_pins', { primitiveId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_import_changes', '从原理图导入变更到 PCB（相当于设计→更新到PCB）', {
    uuid: z.string().optional().describe('原理图 UUID，默认关联同一 Board 下的原理图'),
  }, async ({ uuid }: { uuid?: string }) => {
    const params: Record<string, unknown> = {};
    if (uuid) params.uuid = uuid;
    const data = await bridge.command('pcb_import_changes', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('sch_save', '保存原理图文档', {}, async () => {
    const data = await bridge.command('sch_save');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_save', '保存 PCB 文档', {}, async () => {
    const data = await bridge.command('pcb_save');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_export_gerber', '导出 PCB 制版文件（Gerber），会弹出保存对话框', {
    fileName: z.string().optional().describe('文件名，默认 gerber.zip'),
  }, async ({ fileName }: { fileName?: string }) => {
    const params: Record<string, unknown> = {};
    if (fileName) params.fileName = fileName;
    const data = await bridge.command('pcb_export_gerber', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_export_bom', '导出 BOM 文件，会弹出保存对话框', {
    fileName: z.string().optional().describe('文件名，默认 bom.csv'),
    fileType: z.enum(['xlsx', 'csv']).optional().describe('文件类型，默认 csv'),
  }, async ({ fileName, fileType }: { fileName?: string; fileType?: 'xlsx' | 'csv' }) => {
    const params: Record<string, unknown> = {};
    if (fileName) params.fileName = fileName;
    if (fileType) params.fileType = fileType;
    const data = await bridge.command('pcb_export_bom', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_export_pickplace', '导出坐标文件（Pick & Place），会弹出保存对话框', {
    fileName: z.string().optional().describe('文件名，默认 pickplace.csv'),
    fileType: z.enum(['xlsx', 'csv']).optional().describe('文件类型，默认 csv'),
  }, async ({ fileName, fileType }: { fileName?: string; fileType?: 'xlsx' | 'csv' }) => {
    const params: Record<string, unknown> = {};
    if (fileName) params.fileName = fileName;
    if (fileType) params.fileType = fileType;
    const data = await bridge.command('pcb_export_pickplace', params);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });
}
