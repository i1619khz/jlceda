/**
 * deploy-bridge.cjs — 构建 jlc-bridge 并热替换到嘉立创EDA的 IndexedDB。
 *
 * 两种模式：
 *   首次安装：手动在 EDA 扩展管理器导入 .eext 文件
 *   后续更新：node deploy-bridge.cjs — 只覆盖 blob 内容，不删文件不动 leveldb
 *
 * 流程：杀EDA进程 → 升版本号 → 构建 → 覆盖blob → 提示重启。
 * 用法：node deploy-bridge.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BRIDGE_DIR = path.join(__dirname, '..', 'packages', 'jlc-bridge');
const LCEDA_DATA = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'AppData', 'Local', 'LCEDA-Pro'
);
const EXT_NAME = 'jlc-bridge';

// ─── 0. Kill EDA process if running ───

try {
  execSync('taskkill /f /im lceda-pro.exe 2>nul', { stdio: 'ignore' });
  console.log('✅ 已关闭嘉立创EDA');
} catch {
  console.log('ℹ️  嘉立创EDA未在运行');
}

// ─── 1. Bump patch version in extension.json ───

const extJsonPath = path.join(BRIDGE_DIR, 'extension.json');
const ext = JSON.parse(fs.readFileSync(extJsonPath, 'utf8'));
const parts = ext.version.split('.').map(Number);
const oldVersion = ext.version;
ext.version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
// 把版本号写到描述里，EDA 会从 blob 读取描述显示
ext.description = `JLC Bridge for PCB automation (MCP v${ext.version})`;
fs.writeFileSync(extJsonPath, JSON.stringify(ext, null, 2));
console.log(`✅ 版本号: ${oldVersion} → ${ext.version}`);

// ─── 2. Build ───

console.log('🔨 构建中...');
execSync('npm run build', { cwd: BRIDGE_DIR, stdio: 'inherit' });

const eextPath = path.join(BRIDGE_DIR, 'build', 'jlc-bridge.eext');
if (!fs.existsSync(eextPath)) {
  console.error('❌ 构建失败：未找到 .eext 产物');
  process.exit(1);
}
console.log(`✅ 构建完成: ${eextPath}`);

// ─── 3. Find IndexedDB blob directory ───

let blobDir = null;
if (fs.existsSync(LCEDA_DATA)) {
  const cacheDirs = fs.readdirSync(LCEDA_DATA).filter(d => /^cache\./.test(d));
  for (const cacheDir of cacheDirs) {
    const idbRoot = path.join(LCEDA_DATA, cacheDir, 'IndexedDB');
    if (!fs.existsSync(idbRoot)) continue;
    const dirs = fs.readdirSync(idbRoot).filter(d => d.includes('indexeddb.blob'));
    for (const d of dirs) {
      // blob 目录可能在 /1/00/ 也可能在其他子目录
      const fullBlobRoot = path.join(idbRoot, d);
      function findBlobDir(dir) {
        for (const sub of fs.readdirSync(dir)) {
          const subPath = path.join(dir, sub);
          if (fs.statSync(subPath).isDirectory()) {
            // 检查这个目录里有没有 zip 文件
            const files = fs.readdirSync(subPath).filter(f => {
              try {
                execSync(`unzip -t "${path.join(subPath, f)}" > /dev/null 2>&1`);
                return true;
              } catch { return false; }
            });
            if (files.length > 0) return subPath;
            // 递归找
            const found = findBlobDir(subPath);
            if (found) return found;
          }
        }
        return null;
      }
      const found = findBlobDir(fullBlobRoot);
      if (found) { blobDir = found; break; }
    }
    if (blobDir) break;
  }
}

if (!blobDir) {
  console.error('❌ 未找到 IndexedDB blob 目录');
  console.error('   请先在 EDA 扩展管理器中手动导入 jlc-bridge.eext 文件');
  process.exit(1);
}
console.log(`✅ Blob 目录: ${blobDir}`);

// ─── 4. Find and replace jlc-bridge blob (safe: only overwrite content) ───

let replaced = false;
for (const f of fs.readdirSync(blobDir)) {
  const fp = path.join(blobDir, f);
  try {
    const stdout = execSync(`unzip -p "${fp}" extension.json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(stdout);
    if (parsed.name === EXT_NAME) {
      // 安全覆盖：只替换文件内容，不删文件、不改文件名
      fs.copyFileSync(eextPath, fp);
      console.log(`✅ 覆盖 blob: ${f} (${oldVersion} → v${ext.version})`);
      replaced = true;
      break;
    }
  } catch {
    // not a zip or not jlc-bridge — skip
  }
}

if (!replaced) {
  console.error('❌ 未在 blob 中找到 jlc-bridge');
  console.error('   请先在 EDA 扩展管理器中手动导入 jlc-bridge.eext 文件');
  console.error(`   文件路径: ${eextPath}`);
  process.exit(1);
}

// 注意：不修改 leveldb。
// leveldb 存的是序列化 JS 对象，直接改二进制会破坏校验和/对象结构，
// 导致 EDA 启动时检测到数据损坏并清空扩展存储。
// EDA 加载扩展时实际执行 blob 里的代码，leveldb 里的版本号只用于显示，不影响功能。

console.log('\n🎉 部署完成！请重新打开嘉立创EDA。');
console.log(`   新版本: v${ext.version}`);
console.log('   注意：EDA 显示的版本号可能不更新，但代码已是最新版。');
