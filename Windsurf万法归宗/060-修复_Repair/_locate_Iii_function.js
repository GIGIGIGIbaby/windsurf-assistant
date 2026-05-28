/**
 * 定位 Iii() 函数和 wii() 函数的完整实现
 * Iii() 过滤从 localStorage 恢复的 tabs，如果太激进可能导致 tabs 清空
 */
const fs = require('fs');
const sessionsFile = String.raw`E:\道\道生一\一生二\Windsurf万法归宗\020-逆向_Reverse\_归一\01-WindSurf本体\N-本机快照_E_Windsurf\out\vs\sessions\sessions.desktop.main.js`;
const c = fs.readFileSync(sessionsFile, 'utf-8');

// Find Iii function
const searches = ['function Iii(', 'Iii=(m)=>', 'Iii=m=>', 'Iii=function'];
for (const s of searches) {
  const idx = c.indexOf(s);
  if (idx >= 0) {
    console.log(`\n✓ Iii 定义 @ ${idx}:`);
    console.log(c.substring(idx, Math.min(c.length, idx + 800)));
    break;
  }
}

// Find wii function
const searches2 = ['function wii(', 'wii=(m)=>', 'wii=m=>', 'wii=function', 'wii=()=>'];
for (const s of searches2) {
  const idx = c.indexOf(s);
  if (idx >= 0) {
    console.log(`\n✓ wii 定义 @ ${idx}:`);
    console.log(c.substring(idx, Math.min(c.length, idx + 300)));
    break;
  }
}

// Also look near the initializeForWorkspace to find Iii
const initIdx = c.indexOf('initializeForWorkspace:(m,l)=>{');
const region = c.substring(Math.max(0, initIdx - 3000), initIdx + 200);
console.log('\n\n═══ initializeForWorkspace 前的区域 ═══');
// find function definitions in this region
const funcs = [...region.matchAll(/(?:let|var|const|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=(]/g)];
funcs.forEach(m => console.log(`  var ${m[1]} @ rel ${m.index}`));

// Special: find Iii near the reducer
const near = c.substring(Math.max(0, initIdx - 5000), initIdx + 200);
const iiiIdx = near.lastIndexOf('Iii');
if (iiiIdx >= 0) {
  const absIdx = initIdx - 5000 + iiiIdx;
  console.log(`\n\n═══ 靠近 initializeForWorkspace 的 Iii 用法/定义 ═══`);
  // look backwards for the function definition
  const searchBack = near.substring(0, iiiIdx + 10);
  const iiiFuncIdx = searchBack.lastIndexOf('function Iii');
  if (iiiFuncIdx >= 0) {
    const absFunc = initIdx - 5000 + iiiFuncIdx;
    console.log(`Iii 函数定义 @ 文件绝对位置 ${absFunc}:`);
    console.log(c.substring(absFunc, Math.min(c.length, absFunc + 600)));
  } else {
    // maybe Iii = arrow function
    const iiiarr = near.lastIndexOf('Iii=');
    if (iiiarr >= 0) {
      const absArr = initIdx - 5000 + iiiarr;
      console.log(`Iii= 赋值 @ ${absArr}:`);
      console.log(c.substring(absArr, Math.min(c.length, absArr + 600)));
    }
  }
}

// Look for all definitions in the 2000 chars before initializeForWorkspace
console.log('\n\n═══ initializeForWorkspace 前 2000 字符中的函数定义 ═══');
const before2k = c.substring(Math.max(0, initIdx - 2000), initIdx);
const allFuncMatches = [...before2k.matchAll(/((?:let|var|const|function)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*[=(][^,;]{0,100})/g)];
allFuncMatches.forEach(m => console.log(`  ${m[1].substring(0, 120)}`));
