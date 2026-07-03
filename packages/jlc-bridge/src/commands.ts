import { APP_VERSION, BridgeCommand, BridgeResult } from './constants';
import { anyEda } from './util';
import {
  createKeepoutRect,
  createPourRect,
  createVia,
  deletePour,
  deleteRegion,
  deleteTracks,
  deleteVia,
  getComponentBBox,
  getNetPrimitives,
  getPads,
  getPCBState,
  getTracks,
  moveComponent,
  relocateComponent,
  routeTrack,
  runDRC,
  takeScreenshot,
} from './pcb';
import {
  addNetToClass,
  createArc,
  createFill,
  createNetClass,
  createPolyline,
  deleteArc,
  deleteFill,
  deleteNetClass,
  deletePolyline,
  getAllNets,
  getDrcRules,
  getLayers,
  getNetByNetRules,
  getNetDetails,
  getNetRules,
  getRegionRules,
  highlightNet,
  listNetClasses,
  overwriteNetRules,
  overwriteRegionRules,
  selectNet,
  setCopperLayers,
  setLayerVisible,
} from './pcb-design';
import {
  autoSilkscreen,
  getSilkscreens,
  moveSilkscreen,
} from './silkscreen';
import {
  createDifferentialPair,
  createEqualLengthGroup,
  deleteDifferentialPair,
  deleteEqualLengthGroup,
  listDifferentialPairs,
  listEqualLengthGroups,
} from './routing-rules';
import {
  activateDocument,
  closeDocument,
  getBoardInfo,
  getCurrentProjectInfo,
  getOpenDocuments,
  openDocument,
  pcbExportBom,
  pcbExportGerber,
  pcbExportPickPlace,
  pcbImportChanges,
  pcbSave,
  schSave,
} from './document';
import {
  createPcbComponent,
  getNetlist,
  getProjectAllNets,
  getSchematicState,
  runSchDrc,
  schAutoLayout,
  schAutoRouting,
  schCreateComponent,
  schCreateNetFlag,
  schCreateWire,
  schGetComponentPins,
  schModifyComponent,
  schSearchDevice,
} from './schematic';

// ─── Safe serialization for eval results ───

function toSafeJson(value: any, depth = 0): any {
  if (depth > 5) return '[max depth]';
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'function') return `[fn ${value.name || 'anonymous'}]`;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'object') {
    // arrays
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => toSafeJson(v, depth + 1));
    // avoid circular / huge objects: only copy enumerable own keys, capped
    const out: Record<string, any> = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count++ >= 60) { out['...'] = 'truncated'; break; }
      try { out[key] = toSafeJson(value[key], depth + 1); } catch { out[key] = '[unreadable]'; }
    }
    return out;
  }
  return String(value);
}

export async function getFeatureSupport(): Promise<any> {
  const api = anyEda();
  return {
    bridgeVersion: APP_VERSION,
    screenshot: {
      renderedAreaImage: Boolean(api?.dmt_EditorControl?.getCurrentRenderedAreaImage),
      exportImage: Boolean(api?.pcb_Document?.exportImage),
      canvasToDataUrl: Boolean(api?.sys_Canvas?.toDataURL),
    },
    silkscreen: {
      query: Boolean(api?.pcb_PrimitiveString?.getAll),
      modify: Boolean(api?.pcb_PrimitiveString?.modify),
      auto: Boolean(api?.pcb_PrimitiveString?.modify),
    },
    via: {
      create: Boolean(api?.pcb_PrimitiveVia?.create),
      delete: Boolean(api?.pcb_PrimitiveVia?.delete),
    },
    keepout: {
      create: Boolean(api?.pcb_PrimitiveRegion?.create && api?.pcb_MathPolygon?.createPolygon),
      delete: Boolean(api?.pcb_PrimitiveRegion?.delete),
    },
    pour: {
      create: Boolean(api?.pcb_PrimitivePour?.create && api?.pcb_MathPolygon?.createPolygon),
      delete: Boolean(api?.pcb_PrimitivePour?.delete),
    },
    routingRules: {
      differentialPair: Boolean(api?.pcb_Drc?.createDifferentialPair),
      equalLengthGroup: Boolean(api?.pcb_Drc?.createEqualLengthNetGroup),
      drcCheck: Boolean(api?.pcb_Drc?.check || api?.pcb_Drc?.runDrc),
      padPairGroup: Boolean(api?.pcb_Drc?.createPadPairGroup),
    },
    project: {
      getCurrentProjectInfo: Boolean(api?.dmt_Project?.getCurrentProjectInfo),
    },
    schematic: {
      getBoardInfo: Boolean(api?.dmt_Board?.getCurrentBoardInfo),
      openDocument: Boolean(api?.dmt_EditorControl?.openDocument),
      getCurrentProjectInfo: Boolean(api?.dmt_Project?.getCurrentProjectInfo),
      getComponents: Boolean(api?.sch_PrimitiveComponent?.getAll),
      getNetlist: Boolean(api?.sch_Netlist?.getNetlist),
      schDrc: Boolean(api?.sch_Drc?.check),
      createPcbComponent: Boolean(api?.pcb_PrimitiveComponent?.create),
      searchDevice: Boolean(api?.lib_Device?.search),
      createComponent: Boolean(api?.sch_PrimitiveComponent?.create),
      createWire: Boolean(api?.sch_PrimitiveWire?.create),
      createNetFlag: Boolean(api?.sch_PrimitiveComponent?.createNetFlag),
      modifyComponent: Boolean(api?.sch_PrimitiveComponent?.modify),
    },
  };
}

export async function executeCommand(cmd: BridgeCommand): Promise<BridgeResult> {
  const start = Date.now();
  const p = cmd.params as any;
  let data: any;

  try {
    switch (cmd.action) {
      case 'ping':
        data = { message: 'pong', timestamp: Date.now() };
        break;
      case 'get_state':
        data = await getPCBState();
        break;
      case 'get_feature_support':
        data = await getFeatureSupport();
        break;
      case 'screenshot':
        data = await takeScreenshot();
        break;
      case 'get_silkscreens':
        data = await getSilkscreens(p);
        break;
      case 'move_silkscreen':
        data = await moveSilkscreen(p);
        break;
      case 'auto_silkscreen':
        data = await autoSilkscreen(p);
        break;
      case 'move_component':
        data = await moveComponent(p);
        break;
      case 'route_track':
        data = await routeTrack(p);
        break;
      case 'create_via':
        data = await createVia(p);
        break;
      case 'delete_via':
        data = await deleteVia(p);
        break;
      case 'get_tracks':
        data = await getTracks(p);
        break;
      case 'delete_tracks':
        data = await deleteTracks(p);
        break;
      case 'get_net_primitives':
        data = await getNetPrimitives(p);
        break;
      case 'relocate_component':
        data = await relocateComponent(p);
        break;
      case 'create_keepout_rect':
        data = await createKeepoutRect(p);
        break;
      case 'delete_region':
        data = await deleteRegion(p);
        break;
      case 'create_pour_rect':
        data = await createPourRect(p);
        break;
      case 'delete_pour':
        data = await deletePour(p);
        break;
      case 'create_differential_pair':
        data = await createDifferentialPair(p);
        break;
      case 'delete_differential_pair':
        data = await deleteDifferentialPair(p);
        break;
      case 'list_differential_pairs':
        data = await listDifferentialPairs();
        break;
      case 'create_equal_length_group':
        data = await createEqualLengthGroup(p);
        break;
      case 'delete_equal_length_group':
        data = await deleteEqualLengthGroup(p);
        break;
      case 'list_equal_length_groups':
        data = await listEqualLengthGroups();
        break;
      case 'run_drc':
        data = await runDRC();
        break;
      case 'get_pads':
        data = await getPads(p);
        break;
      case 'select_component': {
        const api = anyEda();
        if (!api?.pcb_SelectControl?.selectByDesignator) {
          throw new Error('select not supported');
        }
        await api.pcb_SelectControl.selectByDesignator(p.designator);
        data = { selected: p.designator };
        break;
      }
      case 'delete_selected': {
        const api = anyEda();
        if (!api?.pcb_SelectControl?.deleteSelected) {
          throw new Error('delete not supported');
        }
        await api.pcb_SelectControl.deleteSelected();
        data = { deleted: true };
        break;
      }
      case 'get_board_info':
        data = await getBoardInfo();
        break;
      case 'get_current_project_info':
        data = await getCurrentProjectInfo();
        break;
      case 'open_document':
        data = await openDocument(p);
        break;
      case 'get_open_documents':
        data = await getOpenDocuments();
        break;
      case 'activate_document':
        data = await activateDocument(p);
        break;
      case 'close_document':
        data = await closeDocument(p);
        break;
      case 'get_schematic_state':
        data = await getSchematicState();
        break;
      case 'get_netlist':
        data = await getNetlist(p);
        break;
      case 'get_project_nets':
        data = await getProjectAllNets();
        break;
      case 'sch_auto_routing':
        data = await schAutoRouting(p);
        break;
      case 'sch_auto_layout':
        data = await schAutoLayout(p);
        break;
      case 'run_sch_drc':
        data = await runSchDrc(p);
        break;
      case 'create_pcb_component':
        data = await createPcbComponent(p);
        break;
      case 'sch_search_device':
        data = await schSearchDevice(p);
        break;
      case 'sch_create_component':
        data = await schCreateComponent(p);
        break;
      case 'sch_create_wire':
        data = await schCreateWire(p);
        break;
      case 'sch_create_netflag':
        data = await schCreateNetFlag(p);
        break;
      case 'sch_modify_component':
        data = await schModifyComponent(p);
        break;
      case 'sch_get_component_pins':
        data = await schGetComponentPins(p);
        break;
      case 'pcb_import_changes':
        data = await pcbImportChanges(p);
        break;
      case 'sch_save':
        data = await schSave();
        break;
      case 'pcb_save':
        data = await pcbSave();
        break;
      case 'pcb_export_gerber':
        data = await pcbExportGerber(p);
        break;
      case 'pcb_export_bom':
        data = await pcbExportBom(p);
        break;
      case 'pcb_export_pickplace':
        data = await pcbExportPickPlace(p);
        break;
      case 'get_component_bbox':
        data = await getComponentBBox(p);
        break;
      case 'get_layers':
        data = await getLayers();
        break;
      case 'set_copper_layers':
        data = await setCopperLayers(p);
        break;
      case 'set_layer_visible':
        data = await setLayerVisible(p);
        break;
      case 'get_all_nets':
        data = await getAllNets();
        break;
      case 'get_net_details':
        data = await getNetDetails(p);
        break;
      case 'select_net':
        data = await selectNet(p);
        break;
      case 'highlight_net':
        data = await highlightNet(p);
        break;
      case 'create_net_class':
        data = await createNetClass(p);
        break;
      case 'delete_net_class':
        data = await deleteNetClass(p);
        break;
      case 'add_net_to_class':
        data = await addNetToClass(p);
        break;
      case 'list_net_classes':
        data = await listNetClasses();
        break;
      case 'get_drc_rules':
        data = await getDrcRules();
        break;
      case 'get_region_rules':
        data = await getRegionRules();
        break;
      case 'overwrite_region_rules':
        data = await overwriteRegionRules(p);
        break;
      case 'get_net_rules':
        data = await getNetRules();
        break;
      case 'get_net_by_net_rules':
        data = await getNetByNetRules();
        break;
      case 'overwrite_net_rules':
        data = await overwriteNetRules(p);
        break;
      case 'create_arc':
        data = await createArc(p);
        break;
      case 'delete_arc':
        data = await deleteArc(p);
        break;
      case 'create_polyline':
        data = await createPolyline(p);
        break;
      case 'delete_polyline':
        data = await deletePolyline(p);
        break;
      case 'create_fill':
        data = await createFill(p);
        break;
      case 'delete_fill':
        data = await deleteFill(p);
        break;
      case 'eval': {
        // Run arbitrary JS in the EDA runtime using the global `eda` object.
        // Used for self-service API probing without redeploying the extension.
        const code = String(p?.code ?? '');
        if (!code.trim()) throw new Error('code is required');
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('eda', code);
        const result = await fn((eda as any));
        data = { ok: true, result: toSafeJson(result) };
        break;
      }
      default:
        throw new Error(`unknown action: ${cmd.action}`);
    }

    return { id: cmd.id, success: true, data, durationMs: Date.now() - start };
  } catch (error) {
    return {
      id: cmd.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}
