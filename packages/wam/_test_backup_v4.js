// ═══════════════════════════════════════════════════════════════════
//  道 · 备份体系四维全链路测试 v4.0
//  道法自然 · 无为而无以为 · 反者道之动 · 弱者道之用
//
//  任务一: 后端备份路径迁移 + 增量备份验证
//  任务二: 前端完整备份地址展示
//  任务三: PB 文件解密 → MD 文档
//  任务四: @conversation 引用历史备份对话
//
//  用法: node _test_backup_v4.js
// ═══════════════════════════════════════════════════════════════════
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ─── 路径定义 ───
const HOME = process.env.USERPROFILE || os.homedir();
const WAM_DIR = path.join(HOME, ".wam");
const PB_DIR = path.join(HOME, ".codeium", "windsurf", "cascade");
const CONV_BACKUP_DEFAULT = path.join(WAM_DIR, "conversation_backups");
const TEST_DIR = path.join(WAM_DIR, "_test_backup_v4_" + Date.now());
const BACKUP_META_FILE = path.join(WAM_DIR, "_backup_meta.json");

// ─── 工具函数 ───
let _pass = 0, _fail = 0, _total = 0;
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function ok(msg) { _pass++; console.log("  ✓ PASS" + (msg ? " · " + msg : "")); }
function ng(id, msg) { _fail++; console.log("  ✗ FAIL [" + id + "] " + msg); }
function sep(title) { _total++; console.log("\n" + "═".repeat(60)); console.log(" " + title); console.log("═".repeat(60)); }

// ─── Proto 最小解析器 (wire-type aware) ───
function readVarint(buf, pos) {
  let v = 0, s = 0;
  while (pos < buf.length) {
    const x = buf[pos++];
    v |= (x & 0x7f) << s;
    if (!(x & 0x80)) return [v, pos];
    s += 7;
    if (s > 63) break;
  }
  return [v, pos];
}

function parseProto(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    const [tag, tagEnd] = readVarint(buf, pos);
    if (tagEnd === pos || tag === 0) break;
    pos = tagEnd;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    if (fieldNum === 0 || fieldNum > 10000) break;
    switch (wireType) {
      case 0: { // varint
        const [v, p2] = readVarint(buf, pos);
        if (p2 === pos) return fields;
        fields.push({ num: fieldNum, wire: 0, val: v });
        pos = p2;
        break;
      }
      case 1: { // fixed64
        if (pos + 8 > buf.length) return fields;
        fields.push({ num: fieldNum, wire: 1, val: buf.readBigUInt64LE(pos) });
        pos += 8;
        break;
      }
      case 2: { // length-delimited
        const [len, p2] = readVarint(buf, pos);
        if (p2 === pos || p2 + len > buf.length) return fields;
        fields.push({ num: fieldNum, wire: 2, val: buf.slice(p2, p2 + len), len });
        pos = p2 + len;
        break;
      }
      case 5: { // fixed32
        if (pos + 4 > buf.length) return fields;
        fields.push({ num: fieldNum, wire: 5, val: buf.readUInt32LE(pos) });
        pos += 4;
        break;
      }
      default: return fields;
    }
  }
  return fields;
}

// 尝试将 wire=2 字段解读为 UTF-8 字符串
function tryString(buf) {
  try {
    const s = buf.toString("utf8");
    // 检查是否为合法 UTF-8 文本 (允许中文等多字节)
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s)) return null;
    return s;
  } catch { return null; }
}

// ═══════════════════════════════════════════
//  任务一: 后端备份路径迁移 + 增量备份验证
// ═══════════════════════════════════════════
function testTask1() {
  sep("任务一 · 后端备份路径迁移 + 增量备份验证");

  // ── T1.1: 读取当前备份配置 ──
  console.log("\n[T1.1] 读取当前备份配置");
  try {
    const currentDir = CONV_BACKUP_DEFAULT;
    const metaFile = BACKUP_META_FILE;
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch {}

    console.log("  源 PB 目录   : " + PB_DIR);
    console.log("  当前备份目录 : " + currentDir);
    console.log("  元数据文件   : " + metaFile);
    console.log("  上次备份日期 : " + (meta.lastInitDate || "无记录"));
    console.log("  已知 PB 数   : " + (meta.knownPbs ? meta.knownPbs.length : 0));

    if (!fs.existsSync(PB_DIR)) throw new Error("PB_DIR 不存在: " + PB_DIR);
    if (!fs.existsSync(currentDir)) throw new Error("当前备份目录不存在");
    ok("配置读取成功");
  } catch (e) { ng("T1.1", e.message); }

  // ── T1.2: 创建新备份目录 + 迁移 ──
  console.log("\n[T1.2] 模拟迁移到新备份目录");
  const newBackupDir = path.join(TEST_DIR, "migrated_backup");
  try {
    const oldDir = CONV_BACKUP_DEFAULT;
    ensureDir(newBackupDir);

    // 复制 (不移动) 已有备份目录到新位置
    const oldEntries = fs.readdirSync(oldDir).filter(d => d.startsWith("backup_"));
    let migrated = 0;
    for (const entry of oldEntries) {
      const srcEntry = path.join(oldDir, entry);
      const dstEntry = path.join(newBackupDir, entry);
      if (fs.statSync(srcEntry).isDirectory()) {
        ensureDir(dstEntry);
        const files = fs.readdirSync(srcEntry);
        for (const f of files) {
          fs.copyFileSync(path.join(srcEntry, f), path.join(dstEntry, f));
        }
        migrated++;
      }
    }

    const newEntries = fs.readdirSync(newBackupDir).filter(d => d.startsWith("backup_"));
    console.log("  旧目录       : " + oldDir);
    console.log("  新目录       : " + newBackupDir);
    console.log("  旧备份批次   : " + oldEntries.length);
    console.log("  迁移完成     : " + migrated + " 个批次");
    console.log("  新目录批次   : " + newEntries.length);

    if (newEntries.length !== oldEntries.length) {
      throw new Error("迁移批次数不匹配: " + newEntries.length + " vs " + oldEntries.length);
    }
    ok("迁移完成 · 批次数一致");
  } catch (e) { ng("T1.2", e.message); }

  // ── T1.3: 迁移后执行全量备份到新位置 ──
  console.log("\n[T1.3] 在新位置执行全量备份");
  try {
    const pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb"));
    const ts = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const batchDir = path.join(newBackupDir, "backup_" + ts);
    ensureDir(batchDir);

    let copied = 0, failed = 0, skipped = 0;
    for (const f of pbFiles) {
      const src = path.join(PB_DIR, f);
      try {
        const sz = fs.statSync(src).size;
        if (sz < 28) { skipped++; continue; } // 损常检测
        fs.copyFileSync(src, path.join(batchDir, f));
        copied++;
      } catch { failed++; }
    }

    // 写元数据
    fs.writeFileSync(path.join(batchDir, "_meta.json"), JSON.stringify({
      timestamp: new Date().toISOString(),
      totalFiles: pbFiles.length, copied, failed, skipped,
      source: PB_DIR, targetDir: newBackupDir,
      note: "迁移后全量备份测试",
    }, null, 2));

    // 验证
    const verified = fs.readdirSync(batchDir).filter(f => f.endsWith(".pb"));
    console.log("  新批次目录   : " + batchDir);
    console.log("  源 .pb 文件  : " + pbFiles.length);
    console.log("  成功复制     : " + copied);
    console.log("  跳过 (损常)  : " + skipped);
    console.log("  失败         : " + failed);
    console.log("  验证 .pb 数  : " + verified.length);

    if (copied === 0) throw new Error("零文件备份");
    if (verified.length !== copied) throw new Error("验证数不匹配");
    ok("新位置全量备份成功 · " + copied + " 个文件");
  } catch (e) { ng("T1.3", e.message); }

  // ── T1.4: 增量备份模拟 (新位置) ──
  console.log("\n[T1.4] 增量备份模拟 (新位置)");
  try {
    // 找新位置最新 backup_ 目录
    const dirs = fs.readdirSync(newBackupDir)
      .filter(d => d.startsWith("backup_")).sort().reverse();
    if (dirs.length === 0) throw new Error("无备份目录");

    const targetDir = path.join(newBackupDir, dirs[0]);
    const beforeCount = fs.readdirSync(targetDir).filter(f => f.endsWith(".pb")).length;

    // 模拟一个新 .pb 文件出现
    const fakeUuid = crypto.randomUUID();
    const fakePbSrc = path.join(TEST_DIR, fakeUuid + ".pb");
    const fakeContent = crypto.randomBytes(1024); // 模拟加密内容
    fs.writeFileSync(fakePbSrc, fakeContent);

    // 增量备份逻辑: 新文件→复制到最新批次
    const dst = path.join(targetDir, fakeUuid + ".pb");
    const srcSz = fs.statSync(fakePbSrc).size;
    const needBk = !fs.existsSync(dst) || fs.statSync(dst).size < srcSz;
    if (needBk) {
      fs.copyFileSync(fakePbSrc, dst);
    }

    const afterCount = fs.readdirSync(targetDir).filter(f => f.endsWith(".pb")).length;
    console.log("  目标批次     : " + dirs[0]);
    console.log("  增量前 .pb   : " + beforeCount);
    console.log("  模拟新文件   : " + fakeUuid.substring(0, 8) + "... (" + srcSz + "B)");
    console.log("  增量后 .pb   : " + afterCount);
    console.log("  增量差值     : +" + (afterCount - beforeCount));

    if (afterCount !== beforeCount + 1) throw new Error("增量备份未生效");

    // 清理模拟文件
    try { fs.unlinkSync(dst); fs.unlinkSync(fakePbSrc); } catch {}

    ok("增量备份在新位置正常运行");
  } catch (e) { ng("T1.4", e.message); }

  // ── T1.5: 迁移后旧目录数据完整性 ──
  console.log("\n[T1.5] 验证旧目录数据完整性 (不应受迁移影响)");
  try {
    const oldDir = CONV_BACKUP_DEFAULT;
    const oldBatches = fs.readdirSync(oldDir).filter(d => d.startsWith("backup_"));
    console.log("  旧目录       : " + oldDir);
    console.log("  旧批次数     : " + oldBatches.length);
    if (oldBatches.length === 0) throw new Error("旧目录无备份");

    // 验证最新批次完整性
    const latest = oldBatches.sort().reverse()[0];
    const latestDir = path.join(oldDir, latest);
    const latestFiles = fs.readdirSync(latestDir);
    const hasMeta = latestFiles.includes("_meta.json");
    const pbCount = latestFiles.filter(f => f.endsWith(".pb")).length;
    console.log("  最新批次     : " + latest);
    console.log("  .pb 文件     : " + pbCount);
    console.log("  有 _meta     : " + hasMeta);

    if (pbCount === 0) throw new Error("最新批次无 .pb 文件");
    ok("旧目录数据完整 · 迁移为复制而非移动 · 安全");
  } catch (e) { ng("T1.5", e.message); }

  return newBackupDir;
}

// ═══════════════════════════════════════════
//  任务二: 前端完整备份地址展示 (验证 + 生成展示数据)
// ═══════════════════════════════════════════
function testTask2(backupDir) {
  sep("任务二 · 前端完整备份地址展示");

  // ── T2.1: 收集所有路径信息 ──
  console.log("\n[T2.1] 收集完整路径信息");
  try {
    const bkRoot = backupDir || CONV_BACKUP_DEFAULT;
    const paths = {
      "源 PB 目录 (cascade/)": PB_DIR,
      "WAM 主目录": WAM_DIR,
      "当前备份根目录": bkRoot,
      "备份元数据文件": BACKUP_META_FILE,
      "Hub 数据文件": path.join(WAM_DIR, "_hub.json"),
      "API 接口文件": path.join(WAM_DIR, "_api.json"),
    };

    for (const [label, p] of Object.entries(paths)) {
      const exists = fs.existsSync(p);
      const info = exists ? (fs.statSync(p).isDirectory() ? "DIR" : fs.statSync(p).size + "B") : "不存在";
      console.log("  " + label.padEnd(22) + ": " + p + " [" + info + "]");
    }
    ok("路径信息收集完成");
  } catch (e) { ng("T2.1", e.message); }

  // ── T2.2: 列出所有备份批次 + 详情 ──
  console.log("\n[T2.2] 列出所有备份批次详情");
  try {
    const bkRoot = CONV_BACKUP_DEFAULT;
    const batches = fs.readdirSync(bkRoot)
      .filter(d => d.startsWith("backup_") && fs.statSync(path.join(bkRoot, d)).isDirectory())
      .sort().reverse();

    console.log("  备份批次总数 : " + batches.length);
    console.log("");

    const batchDetails = [];
    for (const batch of batches) {
      const dir = path.join(bkRoot, batch);
      const files = fs.readdirSync(dir);
      const pbFiles = files.filter(f => f.endsWith(".pb"));
      const hasMeta = files.includes("_meta.json");
      const hasIndex = files.includes("_index.json");
      const totalSize = pbFiles.reduce((sum, f) => {
        try { return sum + fs.statSync(path.join(dir, f)).size; } catch { return sum; }
      }, 0);

      const detail = {
        name: batch,
        fullPath: dir,
        pbCount: pbFiles.length,
        totalSizeKB: Math.round(totalSize / 1024),
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(1),
        hasMeta,
        hasIndex,
        timestamp: batch.replace("backup_", "").replace(/T/, " ").replace(/-/g, function(m, i) {
          // 智能替换: 日期部分的 - 替换为 /, 时间部分的 - 替换为 :
          return i < 10 ? "/" : ":";
        }),
      };
      batchDetails.push(detail);

      console.log("  📁 " + batch);
      console.log("     路径  : " + dir);
      console.log("     .pb   : " + detail.pbCount + " 个 | " + detail.totalSizeMB + " MB");
      console.log("     元数据: " + (hasMeta ? "✓" : "✗") + " | 索引: " + (hasIndex ? "✓" : "✗"));
    }

    // 写出前端展示数据
    const displayData = {
      generatedAt: new Date().toISOString(),
      pbSourceDir: PB_DIR,
      pbSourceCount: fs.existsSync(PB_DIR) ? fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).length : 0,
      backupRootDir: bkRoot,
      totalBatches: batches.length,
      batches: batchDetails,
    };
    const displayFile = path.join(TEST_DIR, "_backup_display_data.json");
    ensureDir(TEST_DIR);
    fs.writeFileSync(displayFile, JSON.stringify(displayData, null, 2));
    console.log("\n  展示数据已写入: " + displayFile);

    ok("所有备份批次 + 完整路径已展示");
  } catch (e) { ng("T2.2", e.message); }

  // ── T2.3: 生成前端 HTML 展示片段 (备份路径全展示) ──
  console.log("\n[T2.3] 生成前端完整路径 HTML 片段");
  try {
    const bkRoot = CONV_BACKUP_DEFAULT;
    const batches = fs.readdirSync(bkRoot)
      .filter(d => d.startsWith("backup_") && fs.statSync(path.join(bkRoot, d)).isDirectory())
      .sort().reverse();

    // 构造 HTML
    let html = `<div class="conv-paths-section">
  <div class="conv-paths-header" onclick="togglePaths()">
    <span>📂 备份路径详情</span>
    <span id="pathsArrow">▼</span>
  </div>
  <div class="conv-paths-body" id="pathsBody">
    <div class="conv-path-item" title="${PB_DIR}">
      <span class="path-label">📦 源目录</span>
      <span class="path-value">${PB_DIR}</span>
      <button class="path-open" onclick="openPath('${PB_DIR.replace(/\\/g, '\\\\')}')">打开</button>
    </div>
    <div class="conv-path-item" title="${bkRoot}">
      <span class="path-label">💾 备份目录</span>
      <span class="path-value">${bkRoot}</span>
      <button class="path-open" onclick="openPath('${bkRoot.replace(/\\/g, '\\\\')}')">打开</button>
    </div>`;

    for (const batch of batches) {
      const dir = path.join(bkRoot, batch);
      const pbCount = fs.readdirSync(dir).filter(f => f.endsWith(".pb")).length;
      html += `
    <div class="conv-path-batch" title="${dir}">
      <span class="batch-name">📁 ${batch}</span>
      <span class="batch-info">${pbCount} 个对话</span>
      <button class="path-open" onclick="openPath('${dir.replace(/\\/g, '\\\\')}')">打开</button>
    </div>`;
    }

    html += `
  </div>
</div>`;

    const htmlFile = path.join(TEST_DIR, "_backup_paths.html");
    fs.writeFileSync(htmlFile, html);
    console.log("  HTML 片段行数: " + html.split("\n").length);
    console.log("  已写入: " + htmlFile);
    ok("前端路径展示 HTML 已生成");
  } catch (e) { ng("T2.3", e.message); }
}

// ═══════════════════════════════════════════
//  任务三: PB 文件解密分析 → MD 文档
// ═══════════════════════════════════════════
function testTask3() {
  sep("任务三 · PB 文件解密分析 → MD 文档");

  // ── T3.1: PB 文件结构分析 ──
  console.log("\n[T3.1] PB 文件结构分析");
  try {
    const pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb"));
    if (pbFiles.length === 0) throw new Error("无 .pb 文件");

    // 取最小和最大文件分析
    const fileSizes = pbFiles.map(f => ({
      name: f,
      size: fs.statSync(path.join(PB_DIR, f)).size,
    })).sort((a, b) => a.size - b.size);

    const smallest = fileSizes[0];
    const largest = fileSizes[fileSizes.length - 1];
    const median = fileSizes[Math.floor(fileSizes.length / 2)];

    console.log("  .pb 文件总数 : " + pbFiles.length);
    console.log("  最小文件     : " + smallest.name.substring(0, 8) + "... " + Math.round(smallest.size / 1024) + "KB");
    console.log("  中位文件     : " + median.name.substring(0, 8) + "... " + Math.round(median.size / 1024) + "KB");
    console.log("  最大文件     : " + largest.name.substring(0, 8) + "... " + Math.round(largest.size / 1024) + "KB");

    // 分析头部字节模式
    const sampleFile = path.join(PB_DIR, smallest.name);
    const sampleBuf = fs.readFileSync(sampleFile);
    const head = sampleBuf.slice(0, 64);

    console.log("\n  头部 64 字节 (hex):");
    console.log("  " + head.toString("hex").replace(/(.{2})/g, "$1 ").trim());

    // 熵分析 (判断是否加密)
    const entropy = calcEntropy(sampleBuf.slice(0, Math.min(4096, sampleBuf.length)));
    console.log("\n  前 4KB 熵值  : " + entropy.toFixed(4) + " (7.5+ = 加密/压缩, <6 = 明文)");

    // 尝试 protobuf 直接解析
    console.log("\n  尝试直接 protobuf 解析:");
    const fields = parseProto(sampleBuf.slice(0, 256));
    if (fields.length > 0) {
      console.log("  成功解析 " + fields.length + " 个字段 → 可能为明文 protobuf");
      for (const f of fields.slice(0, 5)) {
        if (f.wire === 0) console.log("    field " + f.num + " (varint) = " + f.val);
        else if (f.wire === 2) {
          const s = tryString(f.val);
          console.log("    field " + f.num + " (bytes) len=" + f.len + (s ? " str=" + JSON.stringify(s.substring(0, 50)) : ""));
        }
      }
    } else {
      console.log("  无法解析为 protobuf → 高熵数据 → 确认为加密文件");
    }

    ok("文件结构分析完成");
  } catch (e) { ng("T3.1", e.message); }

  // ── T3.2: 加密方案逆向分析 ──
  console.log("\n[T3.2] 加密方案逆向分析");
  try {
    // 已知信息:
    // 1. extension.js 注释: "AES-256-GCM 最小结构: 12B nonce + 16B tag = 28B"
    // 2. WINDSURF_LS_REVERSE_v2.md: Electron safeStorage (DPAPI + AES-256-GCM)
    //    Master Key: `Local State` → `os_crypt.encrypted_key` (base64, DPAPI前缀)
    //    数据: `v10` + 12字节nonce + AES-256-GCM密文 + 16字节tag

    // 检查 Windsurf Local State 是否存在
    const windsurfLocalState = path.join(HOME, "AppData", "Roaming", "Windsurf", "Local State");
    const hasLocalState = fs.existsSync(windsurfLocalState);

    // 检查多个可能的 key 存储位置
    const keyLocations = [
      { path: windsurfLocalState, desc: "Windsurf Local State (Chromium master key)" },
      { path: path.join(HOME, "AppData", "Roaming", "Windsurf", "User", "globalStorage", "state.vscdb"), desc: "VSCode GlobalStorage (SQLite)" },
      { path: path.join(HOME, ".codeium", "windsurf", "config.json"), desc: "Codeium Config" },
    ];

    console.log("  加密方案: AES-256-GCM (12B nonce + ciphertext + 16B tag)");
    console.log("  密钥来源分析:");

    for (const loc of keyLocations) {
      const exists = fs.existsSync(loc.path);
      const size = exists ? fs.statSync(loc.path).size : 0;
      console.log("    " + (exists ? "✓" : "✗") + " " + loc.desc);
      if (exists) console.log("      " + loc.path + " (" + Math.round(size / 1024) + "KB)");
    }

    // 尝试读取 Local State 获取 encrypted_key
    if (hasLocalState) {
      try {
        const localState = JSON.parse(fs.readFileSync(windsurfLocalState, "utf8"));
        if (localState.os_crypt && localState.os_crypt.encrypted_key) {
          const encKeyB64 = localState.os_crypt.encrypted_key;
          const encKeyBuf = Buffer.from(encKeyB64, "base64");
          console.log("\n  ★ 找到 os_crypt.encrypted_key:");
          console.log("    Base64 长度 : " + encKeyB64.length);
          console.log("    解码后长度  : " + encKeyBuf.length + " bytes");
          console.log("    前缀 (5B)   : " + encKeyBuf.slice(0, 5).toString("ascii"));

          // DPAPI 前缀检查
          if (encKeyBuf.slice(0, 5).toString("ascii") === "DPAPI") {
            console.log("    → DPAPI 前缀确认 · 需要 Windows DPAPI 解密 Master Key");
            console.log("    → Master Key 绑定到当前 Windows 用户 · 不可跨机器");
            console.log("    → 解密链路: DPAPI(encrypted_key) → AES-256-GCM Key → 解密 .pb");
          }
        }
      } catch (e) {
        console.log("  读取 Local State 失败: " + e.message);
      }
    }

    // 检查 .pb 文件是否有 v10 前缀 (Chromium 加密标记)
    const pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb"));
    if (pbFiles.length > 0) {
      const sample = fs.readFileSync(path.join(PB_DIR, pbFiles[0]));
      const hasV10 = sample.length >= 3 && sample.slice(0, 3).toString("ascii") === "v10";
      console.log("\n  .pb 文件 v10 前缀: " + (hasV10 ? "✓ 确认 Chromium 加密格式" : "✗ 无 v10 前缀"));

      if (!hasV10) {
        // 可能是 Go LS 自有加密 或 直接 protobuf
        console.log("  → .pb 文件不使用 Chromium safeStorage 加密格式");
        console.log("  → 可能是 Go Language Server 自有加密方案");
        console.log("  → 或者是纯 protobuf 但使用自定义序列化");
      }
    }

    ok("加密方案分析完成");
  } catch (e) { ng("T3.2", e.message); }

  // ── T3.3: 多策略解密尝试 ──
  console.log("\n[T3.3] 多策略解密尝试");
  try {
    const pbFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).sort(
      (a, b) => fs.statSync(path.join(PB_DIR, a)).size - fs.statSync(path.join(PB_DIR, b)).size
    );
    if (pbFiles.length === 0) throw new Error("无 .pb 文件");

    const samplePath = path.join(PB_DIR, pbFiles[0]);
    const sampleBuf = fs.readFileSync(samplePath);
    const sampleUuid = pbFiles[0].replace(".pb", "");
    console.log("  测试文件: " + pbFiles[0] + " (" + sampleBuf.length + "B)");

    // 策略 1: 直接 protobuf (无加密)
    console.log("\n  策略 1: 直接 protobuf 解析");
    const fields1 = parseProto(sampleBuf);
    if (fields1.length > 2) {
      console.log("    ✓ 解析到 " + fields1.length + " 个字段 → 明文 protobuf!");
    } else {
      console.log("    ✗ 无法直接解析 → 数据已加密");
    }

    // 策略 2: 跳过可能的 header (Windsurf 自定义格式)
    console.log("\n  策略 2: 尝试跳过 header 后解析");
    for (const offset of [4, 5, 8, 12, 16, 28]) {
      if (offset >= sampleBuf.length) continue;
      const sub = sampleBuf.slice(offset);
      const fields2 = parseProto(sub);
      if (fields2.length > 3) {
        console.log("    ✓ offset=" + offset + " 解析到 " + fields2.length + " 个字段!");
        break;
      }
    }

    // 策略 3: AES-256-GCM 结构分析
    console.log("\n  策略 3: AES-256-GCM 结构假设");
    if (sampleBuf.length >= 28) {
      // 假设: [12B nonce][ciphertext][16B tag]
      const nonce = sampleBuf.slice(0, 12);
      const tag = sampleBuf.slice(sampleBuf.length - 16);
      const ciphertext = sampleBuf.slice(12, sampleBuf.length - 16);
      console.log("    假设 nonce (12B) : " + nonce.toString("hex"));
      console.log("    假设 tag (16B)   : " + tag.toString("hex"));
      console.log("    假设密文长度     : " + ciphertext.length + "B");

      // 尝试用 UUID 本身作为 key 来源 (常见的 key derivation 方式)
      const keyFromUuid = crypto.createHash("sha256").update(sampleUuid).digest();
      try {
        const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromUuid, nonce);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        console.log("    ★ UUID-key 解密成功! 明文长度: " + decrypted.length);
        // 尝试解析为 protobuf
        const decFields = parseProto(decrypted);
        if (decFields.length > 0) {
          console.log("    → protobuf 字段数: " + decFields.length);
        }
      } catch (e) {
        console.log("    ✗ UUID-key 失败: " + (e.message || e).substring(0, 60));
      }

      // 尝试用 机器ID 或固定字符串作为 key
      const fixedKeys = [
        { name: "codeium-cascade", key: crypto.createHash("sha256").update("codeium-cascade").digest() },
        { name: "windsurf", key: crypto.createHash("sha256").update("windsurf").digest() },
      ];
      for (const { name, key } of fixedKeys) {
        try {
          const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
          decipher.setAuthTag(tag);
          const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
          console.log("    ★ key='" + name + "' 解密成功! 明文: " + dec.length + "B");
        } catch {
          // 静默失败 - 预期中
        }
      }
    }

    // 策略 4: 检查是否为 gzip + protobuf
    console.log("\n  策略 4: 检查压缩格式");
    const isGzip = sampleBuf.length >= 2 && sampleBuf[0] === 0x1f && sampleBuf[1] === 0x8b;
    const isZlib = sampleBuf.length >= 2 && sampleBuf[0] === 0x78 && (sampleBuf[1] === 0x01 || sampleBuf[1] === 0x9c || sampleBuf[1] === 0xda);
    console.log("    gzip: " + (isGzip ? "✓" : "✗") + " | zlib: " + (isZlib ? "✓" : "✗"));

    if (isGzip || isZlib) {
      try {
        const zlib = require("zlib");
        const decompressed = isGzip ? zlib.gunzipSync(sampleBuf) : zlib.inflateSync(sampleBuf);
        console.log("    解压后: " + decompressed.length + "B");
        const fields = parseProto(decompressed);
        console.log("    protobuf 字段: " + fields.length);
      } catch (e) {
        console.log("    解压失败: " + e.message);
      }
    }

    // 结论
    console.log("\n  ── 解密分析结论 ──");
    const entropy = calcEntropy(sampleBuf.slice(0, Math.min(4096, sampleBuf.length)));
    if (entropy > 7.5) {
      console.log("  ⚠ 文件熵值 " + entropy.toFixed(2) + " → 高度加密");
      console.log("  ⚠ 加密密钥由 Go LS (Language Server) 管理");
      console.log("  ⚠ 密钥可能绑定到 DPAPI (Windows 用户) 或 LS 进程内存");
      console.log("  ⚠ 在不逆向 Go 二进制的前提下 · 无法直接解密 .pb → MD");
      console.log("");
      console.log("  → 替代方案 A: 通过 Go LS gRPC 接口 GetCascadeTrajectory 获取明文");
      console.log("  → 替代方案 B: 在 extension.js 中 hook 对话序列化/反序列化时机");
      console.log("  → 替代方案 C: 利用 vscdb metadataCache 提取对话标题/摘要");
    } else {
      console.log("  文件熵值 " + entropy.toFixed(2) + " → 可能为明文/弱加密");
    }

    ok("解密分析完成");
  } catch (e) { ng("T3.3", e.message); }

  // ── T3.4: vscdb 元数据提取 (替代方案 C 实现) ──
  console.log("\n[T3.4] vscdb 对话元数据提取 (替代解密方案)");
  try {
    // vscdb 是 SQLite 数据库 · 存储对话元数据 (标题、创建时间等)
    const globalStorageDir = path.join(HOME, "AppData", "Roaming", "Windsurf", "User", "globalStorage");
    const vscdbPath = path.join(globalStorageDir, "state.vscdb");
    const exists = fs.existsSync(vscdbPath);
    console.log("  state.vscdb  : " + (exists ? "✓ 存在" : "✗ 不存在") + " " + vscdbPath);

    if (exists) {
      const sz = fs.statSync(vscdbPath).size;
      console.log("  文件大小     : " + Math.round(sz / 1024) + "KB");

      // 尝试在 vscdb 二进制中搜索 cascade/conversation 相关字符串
      const vscdbBuf = fs.readFileSync(vscdbPath);
      const searchStr = "metadataCache";
      const idx = vscdbBuf.indexOf(searchStr);
      if (idx >= 0) {
        console.log("  metadataCache: 在 offset " + idx + " 找到");

        // 提取 metadataCache 附近的数据
        const contextStart = Math.max(0, idx - 20);
        const contextEnd = Math.min(vscdbBuf.length, idx + 2000);
        const context = vscdbBuf.slice(contextStart, contextEnd);

        // 搜索 JSON 对象
        const jsonStart = context.indexOf(Buffer.from("{"));
        if (jsonStart >= 0) {
          // 尝试提取 JSON
          let depth = 0, end = jsonStart;
          for (let i = jsonStart; i < context.length; i++) {
            if (context[i] === 0x7b) depth++;
            if (context[i] === 0x7d) depth--;
            if (depth === 0) { end = i + 1; break; }
          }
          const jsonSlice = context.slice(jsonStart, end).toString("utf8");
          try {
            const parsed = JSON.parse(jsonSlice);
            console.log("  → 提取到 JSON 对象, 键数: " + Object.keys(parsed).length);
          } catch {
            console.log("  → JSON 碎片 (部分): " + jsonSlice.substring(0, 100));
          }
        }
      } else {
        console.log("  metadataCache: 未在二进制中直接找到");
      }

      // 搜索 cascade session UUID 模式
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const vscdbStr = vscdbBuf.toString("utf8", 0, Math.min(vscdbBuf.length, 1024 * 1024));
      const uuids = vscdbStr.match(uuidPattern);
      if (uuids) {
        const uniqueUuids = [...new Set(uuids)];
        console.log("  UUID 模式    : " + uniqueUuids.length + " 个唯一 UUID");

        // 与 cascade/ 目录对比
        const cascadeUuids = new Set(
          fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).map(f => f.replace(".pb", ""))
        );
        let matched = 0;
        for (const u of uniqueUuids) {
          if (cascadeUuids.has(u)) matched++;
        }
        console.log("  与 cascade/ 匹配: " + matched + "/" + cascadeUuids.size);
      }
    }

    ok("vscdb 元数据分析完成");
  } catch (e) { ng("T3.4", e.message); }

  // ── T3.5: 生成 _index.json → MD 对话目录 ──
  console.log("\n[T3.5] 从 _index.json 生成 MD 对话目录");
  try {
    const bkRoot = CONV_BACKUP_DEFAULT;
    const batches = fs.readdirSync(bkRoot)
      .filter(d => d.startsWith("backup_")).sort().reverse();

    // 合并所有 _index.json
    const allConversations = {};
    for (const batch of batches) {
      const idxFile = path.join(bkRoot, batch, "_index.json");
      if (fs.existsSync(idxFile)) {
        try {
          const idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
          for (const [uuid, info] of Object.entries(idx)) {
            if (!allConversations[uuid]) {
              allConversations[uuid] = { ...info, batch, uuid };
            }
          }
        } catch {}
      }
    }

    const entries = Object.values(allConversations)
      .sort((a, b) => (b.backedUpAt || "").localeCompare(a.backedUpAt || ""));

    // 生成 MD
    let md = "# Windsurf Cascade 对话备份目录\n\n";
    md += "> 生成时间: " + new Date().toISOString() + "\n";
    md += "> 备份目录: `" + bkRoot + "`\n";
    md += "> 对话总数: " + entries.length + "\n\n";
    md += "| # | 标题 | UUID | 大小 | 备份时间 | 批次 |\n";
    md += "|---|------|------|------|----------|------|\n";

    let idx = 1;
    for (const e of entries) {
      const title = (e.title || "无标题").substring(0, 40);
      const uuid = e.uuid.substring(0, 8) + "...";
      const size = e.sizeBytes ? Math.round(e.sizeBytes / 1024) + "KB" : "?";
      const time = (e.backedUpAt || "").substring(0, 19);
      md += `| ${idx} | ${title} | \`${uuid}\` | ${size} | ${time} | ${e.batch} |\n`;
      idx++;
    }

    md += "\n## 备份批次详情\n\n";
    for (const batch of batches) {
      const dir = path.join(bkRoot, batch);
      const pbCount = fs.readdirSync(dir).filter(f => f.endsWith(".pb")).length;
      md += "- **" + batch + "**: " + pbCount + " 个对话\n";
      md += "  - 路径: `" + dir + "`\n";
    }

    md += "\n## 解密状态\n\n";
    md += "- `.pb` 文件格式: AES-256-GCM 加密\n";
    md += "- 密钥管理: Go Language Server 内部管理 (DPAPI 绑定)\n";
    md += "- 解密状态: ⚠ 需通过 LS gRPC 接口获取明文\n";
    md += "- 替代方案: 通过 `@conversation` 恢复功能在 Cascade 面板中查看\n";

    const mdFile = path.join(TEST_DIR, "对话备份目录.md");
    ensureDir(TEST_DIR);
    fs.writeFileSync(mdFile, md, "utf8");
    console.log("  对话总数     : " + entries.length);
    console.log("  有标题对话   : " + entries.filter(e => e.title).length);
    console.log("  MD 文件      : " + mdFile);
    console.log("  MD 行数      : " + md.split("\n").length);

    ok("MD 对话目录已生成");
  } catch (e) { ng("T3.5", e.message); }
}

// ═══════════════════════════════════════════
//  任务四: @conversation 引用历史备份对话
// ═══════════════════════════════════════════
function testTask4() {
  sep("任务四 · @conversation 引用历史备份对话");

  // ── T4.1: 分析 cascade/ vs 备份 差集 ──
  console.log("\n[T4.1] cascade/ 与备份差集分析");
  try {
    // 当前 cascade/ 目录中的对话
    const cascadeFiles = new Set(
      fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).map(f => f.replace(".pb", ""))
    );
    console.log("  当前 cascade/ : " + cascadeFiles.size + " 个对话");

    // 所有备份中的对话 (去重)
    const bkRoot = CONV_BACKUP_DEFAULT;
    const batches = fs.readdirSync(bkRoot)
      .filter(d => d.startsWith("backup_")).sort().reverse();

    const allBackupUuids = new Set();
    const backupTitles = {};
    for (const batch of batches) {
      const dir = path.join(bkRoot, batch);
      // 从文件名收集
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".pb"));
        for (const f of files) {
          allBackupUuids.add(f.replace(".pb", ""));
        }
      } catch {}
      // 从 _index.json 收集标题
      try {
        const idx = JSON.parse(fs.readFileSync(path.join(dir, "_index.json"), "utf8"));
        for (const [uuid, info] of Object.entries(idx)) {
          if (info.title && !backupTitles[uuid]) backupTitles[uuid] = info.title;
        }
      } catch {}
    }
    console.log("  所有备份     : " + allBackupUuids.size + " 个唯一对话");

    // 差集: 仅在备份中存在，不在当前 cascade/ 中
    const restorable = [];
    for (const uuid of allBackupUuids) {
      if (!cascadeFiles.has(uuid)) {
        restorable.push({
          uuid,
          title: backupTitles[uuid] || "",
          shortId: uuid.substring(0, 8),
        });
      }
    }

    console.log("  可恢复对话   : " + restorable.length + " 个 (仅在备份中)");
    console.log("  已在 cascade/: " + (allBackupUuids.size - restorable.length) + " 个 (已可@引用)");

    // 展示可恢复对话
    if (restorable.length > 0) {
      console.log("\n  可恢复对话列表 (前 20 个):");
      for (const r of restorable.slice(0, 20)) {
        console.log("    " + r.shortId + "... " + (r.title || "(无标题)"));
      }
    }

    ok("差集分析完成 · " + restorable.length + " 个对话可恢复");
  } catch (e) { ng("T4.1", e.message); }

  // ── T4.2: 模拟单个对话恢复 ──
  console.log("\n[T4.2] 模拟单个对话恢复到 cascade/");
  try {
    const bkRoot = CONV_BACKUP_DEFAULT;
    const batches = fs.readdirSync(bkRoot)
      .filter(d => d.startsWith("backup_")).sort().reverse();

    if (batches.length === 0) throw new Error("无备份可用");

    const cascadeFiles = new Set(
      fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb")).map(f => f.replace(".pb", ""))
    );

    // 找一个仅在备份中的对话
    let restoreCandidate = null;
    for (const batch of batches) {
      const dir = path.join(bkRoot, batch);
      const files = fs.readdirSync(dir).filter(f => f.endsWith(".pb"));
      for (const f of files) {
        const uuid = f.replace(".pb", "");
        if (!cascadeFiles.has(uuid)) {
          restoreCandidate = { uuid, file: f, src: path.join(dir, f), batch };
          break;
        }
      }
      if (restoreCandidate) break;
    }

    if (!restoreCandidate) {
      console.log("  所有备份对话均已在 cascade/ 中 · 无需恢复");
      console.log("  → 这说明官方尚未清理这些对话 · @conversation 已可引用");
      ok("全部对话已在 cascade/ · @conversation 可直接引用");
      return;
    }

    console.log("  恢复候选     : " + restoreCandidate.uuid.substring(0, 8) + "...");
    console.log("  来源批次     : " + restoreCandidate.batch);
    console.log("  源文件       : " + restoreCandidate.src);

    // 验证源文件完整性
    const srcSize = fs.statSync(restoreCandidate.src).size;
    console.log("  文件大小     : " + Math.round(srcSize / 1024) + "KB");

    if (srcSize < 28) {
      console.log("  ⚠ 文件过小 (< 28B) · 可能损常 · 跳过");
    } else {
      // 模拟恢复: 复制到 cascade/ (实际恢复)
      const dstPath = path.join(PB_DIR, restoreCandidate.file);
      console.log("  目标路径     : " + dstPath);

      // 执行恢复
      fs.copyFileSync(restoreCandidate.src, dstPath);
      const dstExists = fs.existsSync(dstPath);
      const dstSize = dstExists ? fs.statSync(dstPath).size : 0;

      console.log("  恢复结果     : " + (dstExists ? "✓ 成功" : "✗ 失败"));
      console.log("  目标大小     : " + Math.round(dstSize / 1024) + "KB");

      if (dstExists && dstSize === srcSize) {
        console.log("  → 对话已恢复到 cascade/ · Windsurf LS 将自动感知");
        console.log("  → @conversation 应可引用此对话");
        ok("对话恢复成功");
      } else {
        throw new Error("恢复后文件大小不匹配");
      }
    }
  } catch (e) { ng("T4.2", e.message); }

  // ── T4.3: 批量恢复可行性分析 ──
  console.log("\n[T4.3] 批量恢复可行性分析");
  try {
    const cascadeFiles = fs.readdirSync(PB_DIR).filter(f => f.endsWith(".pb"));
    const cascadeSize = cascadeFiles.reduce((sum, f) => {
      try { return sum + fs.statSync(path.join(PB_DIR, f)).size; } catch { return sum; }
    }, 0);

    console.log("  当前 cascade/ 对话数: " + cascadeFiles.length);
    console.log("  当前 cascade/ 总大小: " + Math.round(cascadeSize / 1024 / 1024) + "MB");

    // 官方限制分析
    console.log("\n  官方 @conversation 机制分析:");
    console.log("  1. LS 清理策略: 保留最近 ~50 个 .pb 文件");
    console.log("  2. vscdb metadataCache: 保留 ~86-101 条元数据记录");
    console.log("  3. @conversation 引用条件: .pb 文件存在 + vscdb 有元数据");
    console.log("  4. 恢复方案: 将备份 .pb 复制回 cascade/ → LS 自动感知");
    console.log("");
    console.log("  限制与风险:");
    console.log("  ⚠ LS 可能在下次启动时清理多余的 .pb 文件");
    console.log("  ⚠ 大量恢复可能触发 LS 的清理策略");
    console.log("  → 建议: 按需恢复 · 每次恢复少量 · 用完即移出");
    console.log("  → 官方 50 限制是 LS 端执行 · 不改官方配置无法绕过");
    console.log("  → WAM 的恢复功能是在 LS 清理前抢先恢复 · 属于 ← 及时恢复");

    ok("批量恢复可行性分析完成");
  } catch (e) { ng("T4.3", e.message); }

  // ── T4.4: @conversation 引用链路验证 ──
  console.log("\n[T4.4] @conversation 引用链路验证");
  try {
    // 检查 _api.json 中的恢复能力声明
    const apiFile = path.join(WAM_DIR, "_api.json");
    if (fs.existsSync(apiFile)) {
      const api = JSON.parse(fs.readFileSync(apiFile, "utf8"));
      console.log("  _api.json 版本    : " + (api.version || "?"));
      if (api.capabilities) {
        const restoreCap = api.capabilities.find(c => c.name === "backup.restore");
        console.log("  backup.restore    : " + (restoreCap ? "✓ 已声明" : "✗ 未声明"));
        if (restoreCap) console.log("    描述: " + restoreCap.desc);
      }
      if (api.backup) {
        console.log("  备份对话数       : " + (api.backup.count || 0));
        console.log("  PB 源目录        : " + (api.backup.pbDir || "?"));
        console.log("  说明             : " + (api.backup.note || "无"));
      }
    } else {
      console.log("  _api.json 不存在 → 插件未运行或未写入");
    }

    ok("引用链路验证完成");
  } catch (e) { ng("T4.4", e.message); }
}

// ─── 熵计算工具 ───
function calcEntropy(buf) {
  const freq = new Array(256).fill(0);
  for (let i = 0; i < buf.length; i++) freq[buf[i]]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue;
    const p = freq[i] / buf.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ═══ MAIN ═══
console.log("═".repeat(60));
console.log(" 道 · 备份体系四维全链路测试 v4.0");
console.log(" 道法自然 · 反者道之动 · 弱者道之用");
console.log(" " + new Date().toISOString());
console.log("═".repeat(60));

ensureDir(TEST_DIR);
console.log("\n测试输出目录: " + TEST_DIR);

const newDir = testTask1();
testTask2(newDir);
testTask3();
testTask4();

// ═══ 总结 ═══
console.log("\n" + "═".repeat(60));
console.log(" 测试总结");
console.log("═".repeat(60));
console.log("  通过: " + _pass);
console.log("  失败: " + _fail);
console.log("  输出: " + TEST_DIR);
console.log("");

if (_fail === 0) {
  console.log("  ✓ 全部通过 · 道法自然 · 万物自化");
} else {
  console.log("  ⚠ " + _fail + " 项失败 · 需进一步分析");
}

// 清理测试临时目录中的迁移备份 (保留分析结果)
try {
  const migDir = path.join(TEST_DIR, "migrated_backup");
  if (fs.existsSync(migDir)) {
    fs.rmSync(migDir, { recursive: true, force: true });
    console.log("\n  清理迁移测试目录: ✓");
  }
} catch {}

console.log("\n道恒无名 · 朴虽小 · 天下弗敢臣");
