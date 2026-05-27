// v3.11.0 回归测 · 人体工学多选 + 复用行按钮批量操作
// 守住契约：点/Shift/拖拽可多选；选中集内任意 🔒/📋/× 应作用于整组选中账号。
"use strict";
const fs = require("node:fs");
const path = require("node:path");

let pass = 0;
let fail = 0;
function expect(name, cond) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.error("  ✗ " + name);
  }
}
function src(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}
function section(name) {
  console.log("\n[" + name + "]");
}
function checkActiveFile(label, text, opts = {}) {
  section(label);
  expect("行锁按钮携带 data-locked，批量锁定可按点击行下一状态对齐", /class="b sk"[^>]+data-locked=/.test(text));
  expect("batch bar 提示复用选中行 🔒/📋/× 批量", text.includes("点选中行 🔒/📋/× 批量"));
  expect("选中行有 .row.sel 高亮", text.includes(".row.sel"));
  expect("行区域禁用文本误选 user-select:none", /\.row\{[^}]*user-select:none/.test(text));

  expect("前端收集勾选账号 _selIx", /function _selIx\(\)/.test(text));
  expect("_selectedFor: 只有点击已选中行且选中数>1时才批量，否则单行", /function _selectedFor\(i\)\{const xs=_selIx\(\);return xs\.includes\(i\)&&xs\.length>1\?xs:\[i\];\}/.test(text));
  expect("Shift 范围选择 _applyRange", /function _applyRange\(a,b,v\)/.test(text));
  expect("拖拽刷选 _startSelect", /function _startSelect\(e\)/.test(text));
  expect("mousedown 启动拖选", /addEventListener\('mousedown',e=>\{if\(e\.button!==0\)return;_startSelect\(e\);\}\)/.test(text));
  expect("mouseover 拖过行时刷选", /addEventListener\('mouseover',e=>\{if\(!_dragSel\)return;/.test(text));
  expect("checkbox click 默认翻转被拦截，避免双翻转", /addEventListener\('click',e=>\{if\(e\.target\.classList&&e\.target\.classList\.contains\('chk'\)\)e\.preventDefault\(\);\},true\)/.test(text));

  expect("锁按钮发送 setSkipBatch", /type:'setSkipBatch'/.test(text));
  expect("锁按钮按 data-locked 计算目标 locked 状态", /const locked=!\(b&&b\.dataset\.locked==='1'\)/.test(text));
  expect("复制选中集发送 copyAccounts", /ix\.length>1\?'copyAccounts':'copyAccount'/.test(text));
  expect("删除选中集复用 removeBatch", /if\(ix\.length>1\)vscode\.postMessage\(\{type:'removeBatch',indices:ix\}\);else send\('remove',i\);/.test(text));

  expect("后端有 copyAccounts case", text.includes('case "copyAccounts"'));
  expect("后端有 setSkipBatch case", text.includes('case "setSkipBatch"'));
  expect("后端批量索引去重", text.includes("...new Set((msg.indices || []).map(Number).filter(Number.isInteger))"));
  expect("Store.removeBatch 对 indices 去重，防重复 index 误删", text.includes("...new Set((indices || []).map(Number).filter(Number.isInteger))"));

  if (opts.lockFile) {
    expect("独立 lock-state 批量写 helper", text.includes("function _writeLockStates(items)"));
    expect("setSkipBatch 调用 _writeLockStates", text.includes("const wr = _writeLockStates(items)"));
  }
}

console.log("═══ v3.11.0 · 多选批量操作回归测 ═══");
checkActiveFile("root extension.js", src("extension.js"));
checkActiveFile("packages/wam extension.js", src("_github_src/packages/wam/extension.js"), { lockFile: true });
checkActiveFile("wam-bundle extension.js", src("_github_src/wam-bundle/extension.js"), { lockFile: true });

console.log(`\n═══ 结果: ${pass} 过 / ${fail} 败 ═══`);
process.exit(fail > 0 ? 1 : 0);
