import { z } from 'zod';
import type { BridgeClient } from '../bridge-client.js';

export function registerDesignTools(server: any, bridge: BridgeClient): void {

  server.tool('pcb_get_layers', '获取 PCB 所有层信息（层名/类型/颜色/铜层数/层叠），多层板设计基础', {}, async () => {
    const data = await bridge.command('get_layers');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_set_copper_layers', '设置 PCB 铜层数（2=双层，4=四层...），会改变板子结构', {
    count: z.number().int().min(2).max(64).describe('铜层数，如 2/4/6'),
  }, async ({ count }: { count: number }) => {
    const data = await bridge.command('set_copper_layers', { count });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_set_layer_visible', '设置图层显示/隐藏', {
    layerId: z.number().int().describe('层 ID（通过 pcb_get_layers 获取）'),
    visible: z.boolean().describe('true=显示，false=隐藏'),
  }, async ({ layerId, visible }: { layerId: number; visible: boolean }) => {
    const data = await bridge.command('set_layer_visible', { layerId, visible });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_get_all_nets', '获取 PCB 所有网络详情（名称/颜色/长度/引脚数）', {}, async () => {
    const data = await bridge.command('get_all_nets');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_get_net_details', '获取指定网络的详情（长度/颜色/图元数）', {
    net: z.string().describe('网络名称'),
  }, async ({ net }: { net: string }) => {
    const data = await bridge.command('get_net_details', { net });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_select_net', '在编辑器中选中指定网络的所有图元', {
    net: z.string().describe('网络名称'),
    select: z.boolean().optional().default(true).describe('true=选中，false=取消选中'),
  }, async ({ net, select }: { net: string; select?: boolean }) => {
    const data = await bridge.command('select_net', { net, select });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_highlight_net', '高亮指定网络（便于查看走线）', {
    net: z.string().describe('网络名称'),
    highlight: z.boolean().optional().default(true).describe('true=高亮，false=取消高亮'),
  }, async ({ net, highlight }: { net: string; highlight?: boolean }) => {
    const data = await bridge.command('highlight_net', { net, highlight });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_create_net_class', '创建网络类（NetClass），可对整类网络统一设规则', {
    name: z.string().describe('网络类名，如 "Power"、"HighSpeed"'),
    nets: z.array(z.string()).optional().describe('初始包含的网络名数组（可选）'),
  }, async ({ name, nets }: { name: string; nets?: string[] }) => {
    const data = await bridge.command('create_net_class', { name, nets });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_delete_net_class', '删除网络类', {
    name: z.string().describe('网络类名'),
  }, async ({ name }: { name: string }) => {
    const data = await bridge.command('delete_net_class', { name });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_add_net_to_class', '将网络加入网络类', {
    className: z.string().describe('网络类名'),
    net: z.string().describe('要加入的网络名'),
  }, async ({ className, net }: { className: string; net: string }) => {
    const data = await bridge.command('add_net_to_class', { className, net });
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_list_net_classes', '列出所有网络类及其包含的网络', {}, async () => {
    const data = await bridge.command('list_net_classes');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });

  server.tool('pcb_get_drc_rules', '获取当前 DRC 规则配置及所有可用规则集', {}, async () => {
    const data = await bridge.command('get_drc_rules');
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  });
}
