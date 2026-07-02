# jlceda

AI-driven PCB design pipeline via MCP ¡ª control JLCEDA Pro from any AI coding agent.

## Structure

```
jlceda/
  packages/
    jlcmcp/        MCP server ¡ª 39+ PCB tools + 11 schematic operations
    jlc-bridge/    EDA extension + WebSocket relay
  scripts/
    deploy-bridge.cjs   Deploy extension to EDA IndexedDB
    clear-bridge.cjs    Clear extension from EDA IndexedDB
```

## Setup

### 1. Build

```bash
npm install          # installs all workspace deps
npm run build        # builds MCP server + bridge extension
```

### 2. Start relay

```bash
npm run relay        # starts ws://127.0.0.1:18800/ws/bridge
```

### 3. Deploy extension to EDA

```bash
npm run deploy       # patches version, builds, writes to EDA IndexedDB
# restart EDA, import packages/jlc-bridge/build/jlc-bridge.eext manually
```

### 4. Configure MCP in your agent

For OMP (`~/.omp/agent/mcp.json`):
```json
{
  "mcpServers": {
    "jlceda": {
      "command": "node",
      "args": ["path/to/jlceda/packages/jlcmcp/dist/index.js"]
    }
  }
}
```

## Credits

- MCP server based on [hyl64/jlcmcp](https://github.com/hyl64/jlcmcp) (MIT)
- Relay based on [Khaerinxi/claude-jlceda-pcb](https://github.com/Khaerinxi/claude-jlceda-pcb) (MIT)
- Bridge extension originally by OpenClaw (Apache-2.0)

## License

MIT
