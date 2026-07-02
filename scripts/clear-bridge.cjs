/**
 * clear-bridge.cjs — 清空 IndexedDB 里的 jlc-bridge 扩展记录。
 * 清空后需要手动重新导入 .eext 文件。
 *
 * 用法：node clear-bridge.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LCEDA_DATA = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'AppData', 'Local', 'LCEDA-Pro'
);

// ─── 0. Kill EDA ───
try {
  execSync('taskkill /f /im lceda-pro.exe 2>nul', { stdio: 'ignore' });
  console.log('✅ 已关闭嘉立创EDA');
} catch {
  console.log('ℹ️  嘉立创EDA未在运行');
}

// ─── 1. Find IndexedDB directories ───
let cleaned = false;

if (!fs.existsSync(LCEDA_DATA)) {
  console.error('❌ 未找到 LCEDA-Pro 数据目录');
  process.exit(1);
}

const cacheDirs = fs.readdirSync(LCEDA_DATA).filter(d => /^cache\./.test(d));
for (const cacheDir of cacheDirs) {
  const idbRoot = path.join(LCEDA_DATA, cacheDir, 'IndexedDB');
  if (!fs.existsSync(idbRoot)) continue;

  // ─── 2. Delete blob files containing jlc-bridge ───
  const blobDirs = fs.readdirSync(idbRoot).filter(d => d.includes('indexeddb.blob'));
  for (const d of blobDirs) {
    const blobRoot = path.join(idbRoot, d);
    // 递归找所有文件
    function cleanDir(dir) {
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) {
          cleanDir(fp);
        } else {
          try {
            const stdout = execSync(`unzip -p "${fp}" extension.json`, {
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'ignore'],
            });
            const parsed = JSON.parse(stdout);
            if (parsed.name === 'jlc-bridge') {
              fs.unlinkSync(fp);
              console.log(`🗑️  删除 blob: ${fp}`);
              cleaned = true;
            }
          } catch { /* not a zip — skip */ }
        }
      }
    }
    cleanDir(blobRoot);
  }

  // ─── 3. Delete entire leveldb (let EDA rebuild it) ───
  const leveldbDirs = fs.readdirSync(idbRoot).filter(d => d.includes('indexeddb.leveldb'));
  for (const d of leveldbDirs) {
    const leveldbPath = path.join(idbRoot, d);
    try {
      fs.rmSync(leveldbPath, { recursive: true, force: true });
      console.log(`🗑️  删除 leveldb: ${d}`);
      cleaned = true;
    } catch (e) {
      console.error(`⚠️  删除失败: ${d} - ${e.message}`);
    }
  }
}

if (cleaned) {
  console.log('\n✅ 清空完成！请打开嘉立创EDA，重新导入 .eext 文件：');
  console.log('   packages/jlc-bridge/build/jlc-bridge.eext (运行 npm run build 生成)');
} else {
  console.log('\nℹ️  未找到 jlc-bridge 记录（可能已清空）');
}
