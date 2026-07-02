# jlceda

AI 驱动的嘉立创EDA专业版自动化工具链 — 通过 MCP 协议让 AI 编程 agent 直接控制 PCB 设计全流程。

从搜索器件 → 画原理图 → 导入 PCB → 布局布线 → 铺铜 DRC → 导出制造文件，全程 AI 自动完成。

## 架构

```
AI Agent (OMP / OpenCode / Claude Code / Pi)
    │
    │  MCP stdio
    ▼
jlcmcp (MCP Server)          ← 52 个工具，定义所有 PCB/原理图操作
    │
    │  WebSocket
    ▼
relay (ws://127.0.0.1:18800) ← 中继，转发 MCP 命令到 EDA 扩展
    │
    │  WebSocket
    ▼
jlc-bridge (EDA 扩展)         ← 运行在嘉立创EDA内部，调用 EDA API
    │
    ▼
嘉立创EDA专业版
```

**三个组件各司其职：**

| 组件 | 位置 | 作用 |
|---|---|---|
| **jlcmcp** | `packages/jlcmcp/` | MCP Server，注册 52 个工具，通过 stdio 与 AI agent 通信 |
| **relay** | `packages/jlc-bridge/relay.js` | WebSocket 中继，转发 MCP Server 的命令到 EDA 扩展 |
| **jlc-bridge** | `packages/jlc-bridge/` | 嘉立创EDA 扩展（.eext），运行在 EDA 内部，调用 EDA 的 JS API |

## 工具列表（52 个）

### 原理图工具（11 个）

| 工具 | 说明 |
|---|---|
| `sch_search_device` | 搜索嘉立创器件库，返回 libraryUuid + uuid |
| `sch_create_component` | 在原理图上放置器件（指定坐标、旋转、镜像） |
| `sch_create_wire` | 画导线连接器件引脚 |
| `sch_create_netflag` | 放置电源/地网络标识（VCC/GND/AGND/PGND） |
| `sch_modify_component` | 修改器件属性（位号、坐标、旋转、BOM 标记等） |
| `sch_get_component_pins` | 获取器件所有引脚信息（坐标、端点、网络） |
| `sch_get_state` | 读取原理图当前状态 |
| `sch_get_netlist` | 导出网表 |
| `sch_run_drc` | 运行原理图 DRC |
| `sch_save` | 保存原理图文档 |
| `pcb_import_changes` | 从原理图导入变更到 PCB（设计→更新到 PCB） |

### PCB 状态查询（9 个）

| 工具 | 说明 |
|---|---|
| `pcb_ping` | 检查 bridge 连接状态 |
| `pcb_get_state` | 获取 PCB 完整状态（元件、网络、板框等） |
| `pcb_get_board_info` | 获取工程信息（板名、层数等） |
| `pcb_get_feature_support` | 查询 bridge 支持的功能列表 |
| `pcb_screenshot` | 截取当前 PCB 编辑器截图（返回 PNG） |
| `pcb_get_pads` | 查询焊盘信息（可按位号过滤） |
| `pcb_get_tracks` | 查询走线段（可按网络/层过滤） |
| `pcb_get_net_primitives` | 查询指定网络的所有图元 |
| `pcb_get_silkscreens` | 查询所有丝印文字 |

### PCB 元件操作（7 个）

| 工具 | 说明 |
|---|---|
| `pcb_move_component` | 移动元件到指定坐标 (mil) |
| `pcb_relocate_component` | 安全搬迁元件（自动断开走线再重连） |
| `pcb_batch_move` | 批量移动多个元件（一次调用移动整排） |
| `pcb_select_component` | 在编辑器中选中元件 |
| `pcb_delete_selected` | 删除当前选中的对象 |
| `pcb_create_component` | 从库中放置元件到 PCB |
| `pcb_create_via` | 创建过孔 |

### PCB 布线（3 个）

| 工具 | 说明 |
|---|---|
| `pcb_route_track` | 画走线（指定起点、终点、线宽、层） |
| `pcb_delete_tracks` | 删除走线 |
| `pcb_delete_via` | 删除过孔 |

### PCB 铺铜与禁布区（4 个）

| 工具 | 说明 |
|---|---|
| `pcb_create_copper_pour` | 创建矩形铺铜区域 |
| `pcb_delete_pour` | 删除铺铜 |
| `pcb_create_keepout` | 创建矩形禁布区 |
| `pcb_delete_keepout` | 删除禁布区 |

### PCB 差分对与等长（6 个）

| 工具 | 说明 |
|---|---|
| `pcb_create_diff_pair` | 创建差分对 |
| `pcb_list_diff_pairs` | 列出所有差分对 |
| `pcb_delete_diff_pair` | 删除差分对 |
| `pcb_create_equal_length` | 创建等长组 |
| `pcb_list_equal_lengths` | 列出所有等长组 |
| `pcb_delete_equal_length` | 删除等长组 |

### PCB 丝印（3 个）

| 工具 | 说明 |
|---|---|
| `pcb_get_silkscreens` | 查询所有丝印文字 |
| `pcb_move_silkscreen` | 移动丝印文字 |
| `pcb_auto_silkscreen` | 自动排列所有丝印（避免重叠） |

### PCB 设计规则与导出（5 个）

| 工具 | 说明 |
|---|---|
| `pcb_run_drc` | 运行 PCB 设计规则检查 (DRC) |
| `pcb_save` | 保存 PCB 文档 |
| `pcb_export_gerber` | 导出 Gerber 制版文件 |
| `pcb_export_bom` | 导出 BOM 文件（xlsx/csv） |
| `pcb_export_pickplace` | 导出坐标文件 Pick & Place（xlsx/csv） |

### 文档切换（4 个）

| 工具 | 说明 |
|---|---|
| `pcb_get_open_documents` | 获取所有打开的文档列表（含 tabId） |
| `pcb_activate_document` | 通过 tabId 切换文档（原理图↔PCB） |
| `pcb_open_document` | 通过 UUID 切换文档 |

## 快速开始

### 前提条件

- [嘉立创EDA专业版](https://lceda.cn/pro) ≥ 2.3.0
- Node.js ≥ 18
- 任意支持 MCP 的 AI 编程 agent（OMP / OpenCode / Claude Code / Pi / Cursor）

### 1. 克隆并构建

```bash
git clone https://github.com/i1619khz/jlceda.git
cd jlceda
npm install              # 安装所有 workspace 依赖
npm run build            # 构建 MCP server + bridge 扩展
```

构建产物：
- `packages/jlcmcp/dist/index.js` — MCP Server 入口
- `packages/jlc-bridge/build/jlc-bridge.eext` — EDA 扩展包

### 2. 启动 relay

```bash
npm run relay            # 启动 WebSocket 中继 ws://127.0.0.1:18800/ws/bridge
```

relay 需要常驻运行，保持端口 18800 可用。

### 3. 安装 EDA 扩展

1. 打开嘉立创EDA专业版
2. 扩展 → 扩展管理器 → 导入扩展
3. 选择 `packages/jlc-bridge/build/jlc-bridge.eext`
4. 菜单栏出现 **JLC Bridge** 菜单即为安装成功
5. 点击 **JLC Bridge → Enable/Disable Bridge** 启用连接

### 4. 配置 AI agent

#### OMP (Oh My Pi)

`~/.omp/agent/mcp.json`:

```json
{
  "mcpServers": {
    "jlceda": {
      "command": "node",
      "args": ["/path/to/jlceda/packages/jlcmcp/dist/index.js"]
    }
  }
}
```

推荐配合以下 OMP 设置（解决工具发现和视觉问题）：

```bash
omp config set mcp.discoveryMode true
omp config set mcp.discoveryDefaultServers '["jlceda"]'
omp config set inspect_image.enabled true
```

#### OpenCode

`opencode.jsonc`:

```jsonc
{
  "mcp": {
    "jlceda": {
      "type": "local",
      "command": ["node", "/path/to/jlceda/packages/jlcmcp/dist/index.js"]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add jlceda -- node /path/to/jlceda/packages/jlcmcp/dist/index.js
```

#### Pi

`~/.pi/agent/settings.json`:

```json
{
  "mcpServers": {
    "jlceda": {
      "command": "node",
      "args": ["/path/to/jlceda/packages/jlcmcp/dist/index.js"]
    }
  }
}
```

### 5. 验证连接

在 AI agent 中调用：

```
pcb_ping
```

返回 `pong` 即表示全链路连通。

## 开发工作流

### 修改 bridge 扩展后热部署

```bash
npm run deploy            # 杀 EDA → 升版本号 → 构建 → 覆盖 IndexedDB blob
```

> 注意：EDA 缓存内存中的扩展代码，deploy 后需要重启 EDA 才能加载新代码。
> 如果 EDA 显示旧版本，运行 `npm run clear` 清空 IndexedDB，然后手动重新导入 `.eext`。

### 清空扩展存储

```bash
npm run clear             # 删除 IndexedDB 中的 jlc-bridge blob + leveldb
```

清空后需要手动重新导入 `.eext` 文件。

### 完整重建

```bash
npm run build             # 重建 MCP server + bridge 扩展
```

## 目录结构

```
jlceda/
  packages/
    jlcmcp/                    MCP Server
      src/
        index.ts               入口，注册所有工具
        bridge-client.ts       WebSocket 客户端（连接 relay）
        agent.ts               PCB Agent 工具（Claude API 循环）
        calculators.ts         阻抗/线宽计算器
        tools/
          state.ts             状态查询工具（9 个）
          components.ts        元件操作工具（7 个）
          routing.ts           布线工具（3 个）
          copper-keepout.ts    铺铜/禁布区工具（4 个）
          silkscreen.ts        丝印工具（3 个）
          advanced.ts          差分对/等长工具（6 个）
          schematic.ts         原理图工具（11 个）
          agent.ts             Agent 模式工具
          calculators.ts       计算器工具
      dist/                    编译产物（gitignore）
      package.json
      tsconfig.json

    jlc-bridge/                EDA 扩展 + relay
      src/
        index.ts               扩展主代码（~3000 行，IIFE bundle）
      extension.json           扩展清单（版本号、菜单注册）
      build/
        pack.js                .eext 打包脚本
      dist/                    esbuild bundle 产物（gitignore）
      relay.js                 WebSocket relay 中继
      smoke-ping.js            连通性测试
      smoke-state.js           状态读取测试
      test-ws.js               WebSocket 测试
      package.json

  scripts/
    deploy-bridge.cjs          构建 + 热部署到 EDA IndexedDB
    clear-bridge.cjs           清空 EDA IndexedDB 扩展存储

  package.json                 workspace 根配置
  LICENSE                      MIT
  README.md
```

## 典型使用场景

### AI 自动画一块接口扩展板

```
用户：帮我画一块 4 端口接口扩展板，4 个 4P 排针，加一个电源 LED

AI：
  1. sch_search_device("4p排针") → 拿到 libraryUuid + uuid
  2. sch_create_component(...) × 4 → 放置 P1-P4
  3. sch_search_device("0805 LED") → 搜索 LED
  4. sch_create_component(...) → 放置 LED1
  5. sch_search_device("0805 1k") → 搜索电阻
  6. sch_create_component(...) → 放置 R1
  7. sch_create_netflag("VCC") + sch_create_netflag("GND") → 放置网络标号
  8. sch_create_wire(...) → 连线
  9. sch_save() → 保存
  10. pcb_import_changes() → 导入 PCB
  11. pcb_batch_move(...) → 布局排针
  12. pcb_route_track(...) → 布线
  13. pcb_create_copper_pour(...) → 铺铜
  14. pcb_run_drc() → DRC 检查
  15. pcb_export_gerber() + pcb_export_bom() → 导出制造文件
```

### 视觉反馈布线（配合视觉模型）

```
AI：
  1. pcb_screenshot() → 截图当前 PCB
  2. [视觉子智能体分析截图] → "P3 和 P4 之间走线交叉，建议 P3 向右移 200mil"
  3. pcb_move_component("P3", x+200, y) → 调整位置
  4. pcb_route_track(...) → 重新布线
  5. pcb_screenshot() → 再次截图验证
```

## 已知限制

- **原理图连线**：导线必须精确对齐引脚 endPoint 坐标才能分配网络，坐标偏差会导致连接失败
- **EDA 扩展缓存**：覆盖 IndexedDB blob 后 EDA 可能仍加载旧代码，需要 clear + 重新导入
- **DRC 连接错误**：铺铜连接 GND 焊盘时可能报连接错误，需要手动调整走线或铺铜策略
- **relay 常驻**：relay 进程需要独立管理（推荐用 pm2 或 Task Scheduler），AI agent 重启不会自动重启 relay

## Credits

| 来源 | 作者 | 协议 | 贡献 |
|---|---|---|---|
| [hyl64/jlcmcp](https://github.com/hyl64/jlcmcp) | hyl64 | MIT | MCP Server 基础框架 + 39 个 PCB 工具 |
| [Khaerinxi/claude-jlceda-pcb](https://github.com/Khaerinxi/claude-jlceda-pcb) | Khaerinxi | MIT | WebSocket relay + 端到端验证 |
| OpenClaw | OpenClaw | Apache-2.0 | jlc-bridge EDA 扩展原始版本 |

## License

MIT
