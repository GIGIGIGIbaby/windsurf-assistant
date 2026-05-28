@echo off
chcp 65001 > nul
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

REM ═══════════════════════════════════════════════════════════════════
REM  一念 · 验印 142 · intercept 拦截路 真原汤化原食 闭环
REM
REM  帛书 · 四十: "反者道之动 · 弱者道之用"
REM
REM  此一念之路:
REM    ① ping 179:11434 验 v2.0 LanProxy 已起
REM    ② 探 /v1/intercept 看 hook 装 + capture 数
REM    ③ 若无 capture, 提示主公在 cascade 内真发一次
REM    ④ 再探 → 若有 capture, 触发一次 LAN 真本路 chat 验
REM ═══════════════════════════════════════════════════════════════════

set HOST=192.168.31.179
set PORT=11434
set BASE=http://%HOST%:%PORT%

echo.
echo ═══ 一念 · 验印 142 · intercept 真原汤闭环 ═══
echo.
echo 目标: %BASE%
echo.

REM ── ① ping 11434 ──
echo [1/4] 探 %BASE%/health ...
curl -s -m 5 -o "%TEMP%\dao142_health.json" -w "  HTTP %%{http_code} · time=%%{time_total}s\n" %BASE%/health
if errorlevel 1 (
    echo.
    echo   ✗ %HOST%:%PORT% 不可达
    echo.
    echo   主公请先在 179 端打开 Windsurf:
    echo     1. 启动 Windsurf
    echo     2. 等 ext host 装好 dao.dao-lan-proxy-2.0.0
    echo     3. 看状态栏出现 "🌐 LanProxy:11434"
    echo     4. 再双击此 cmd
    echo.
    pause
    exit /b 1
)

REM ── ② 探 /v1/intercept ──
echo.
echo [2/4] 探 %BASE%/v1/intercept ...
curl -s -m 5 -o "%TEMP%\dao142_intercept.json" -w "  HTTP %%{http_code}\n" %BASE%/v1/intercept
if exist "%TEMP%\dao142_intercept.json" (
    echo.
    echo ── /v1/intercept 返 ──
    type "%TEMP%\dao142_intercept.json"
    echo.
)

REM ── ③ 用 node 解 capture 计数 ──
echo.
echo [3/4] 解 capture 计 ...
for /f "delims=" %%i in ('node -e "try{const j=require('%TEMP:\=/%/dao142_intercept.json');console.log((j.stats&&j.stats.totalCaptures)||0);}catch(e){console.log(-1);}"') do set CAPTURE=%%i
echo   抓取次数: !CAPTURE!

if "!CAPTURE!"=="0" (
    echo.
    echo   ⚠ intercept hook 已装但未抓到任 cascade 请求
    echo.
    echo   主公请在 179 Windsurf 内做以下事:
    echo     1. 打开 Cascade 面板
    echo     2. 随便问一句 (e.g., "hi" / "test")
    echo     3. 任意 model 任意问
    echo     4. 等响应回来
    echo     5. 之后此 cmd 会自动验
    echo.
    echo   按任意键继续 (主公已发 cascade 后)...
    pause > nul
    
    REM 再探一次
    echo.
    echo   再探 /v1/intercept ...
    curl -s -m 5 -o "%TEMP%\dao142_intercept.json" -w "  HTTP %%{http_code}\n" %BASE%/v1/intercept
    for /f "delims=" %%i in ('node -e "try{const j=require('%TEMP:\=/%/dao142_intercept.json');console.log((j.stats&&j.stats.totalCaptures)||0);}catch(e){console.log(-1);}"') do set CAPTURE=%%i
    echo   抓取次数: !CAPTURE!
)

if "!CAPTURE!"=="0" (
    echo.
    echo   ⚠ 仍无 capture · 检以下:
    echo     - 179 windsurf 是否真用 Cascade (而非 ChatGPT 等其它面板)
    echo     - 040 v2.0 是否真起 (curl %BASE%/health 看 version)
    echo     - 040 extensionKind 是否含 "workspace" (vsce package.json)
    echo.
    pause
    exit /b 0
)

if "!CAPTURE!"=="-1" (
    echo.
    echo   ✗ /v1/intercept 返非 JSON · 040 v2.0 未真起? 看 /health 之 version
    echo.
    pause
    exit /b 1
)

REM ── ④ 真本路 chat 验 ──
echo.
echo [4/4] 触发一次 LAN 真本路 chat (走 intercept upstream) ...
echo.
echo   POST %BASE%/v1/chat/completions
echo   model: claude-sonnet-4-6
echo   prompt: 一句话告诉我你是什么模型
echo.

curl -s -m 60 -X POST %BASE%/v1/chat/completions ^
    -H "Content-Type: application/json" ^
    -d "{\"model\":\"claude-sonnet-4-6\",\"messages\":[{\"role\":\"user\",\"content\":\"一句话告诉我你是什么模型\"}],\"stream\":false}" ^
    -o "%TEMP%\dao142_chat.json" -w "  HTTP %%{http_code} · time=%%{time_total}s · size=%%{size_download}B\n"

echo.
if exist "%TEMP%\dao142_chat.json" (
    echo ── chat 返 (前 800 字) ──
    node -e "try{const j=require('%TEMP:\=/%/dao142_chat.json');const t=(j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||(j.error&&j.error.message)||JSON.stringify(j).slice(0,800);console.log(t);}catch(e){console.log(require('fs').readFileSync('%TEMP%/dao142_chat.json','utf8').slice(0,800));}"
    echo.
)

REM ── 末态 ──
echo.
echo ═══ 末态 · 印 142 ═══
curl -s -m 5 %BASE%/v1/intercept > "%TEMP%\dao142_final.json"
node -e "try{const j=require('%TEMP:\=/%/dao142_final.json');console.log('  intercept hook:',(j.stats&&j.stats.installed)?'✓ 装':'✗ 未装');console.log('  抓取数:',(j.stats&&j.stats.totalCaptures)||0);console.log('  unique hosts:',(j.stats&&j.stats.uniqueHosts)||0);console.log('  latest:',j.latest?(j.latest.host+' ('+j.latest.kind+')'):'-');console.log('  latest auth:',j.latest&&j.latest.authPreview||'-');}catch(e){console.log('  err:',e.message);}"

echo.
echo ═══ 印 142 闭环验毕 ═══
echo.
echo 文献:  e:\道\道生一\一生二\Windsurf万法归宗\印142_真原汤化原食_intercept拦截路_2026-05-18.md
echo 浏: %BASE%/v1/intercept
echo 浏: %BASE%/v1/intercept/log
echo 浏: %BASE%/v1/diag
echo.
pause
endlocal
