#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# install.sh · dao-proxy-min v9.9.52 · Linux/macOS 自适装毕脚本
# ═══════════════════════════════════════════════════════════════════════════
# 道法自然 · 适万用户 · 适万机 · 零配置 · 一键装毕
# 「为道日损. 损之又损, 以至于无为, 无为而无不为」 — 四十八章
#
# 用法:
#   ./install.sh                       # 装毕 当前用户 当前 vsix (自动检测)
#   ./install.sh --vsix path.vsix      # 显式指定 vsix
#   ./install.sh --uninstall           # 卸 dao-proxy-min 全版
#   ./install.sh --dry-run             # 演 不真装
#
# 自动检测:
#   ① 当前用户名         (从 $USER 或 whoami)
#   ② Windsurf 扩展目录   ($HOME/.windsurf/extensions)
#   ③ 现版 dao-proxy-min   (扫目录 + 读 extensions.json)
#   ④ 端口自映           (FNV-1a hash · 8889..8988 per user)
# ═══════════════════════════════════════════════════════════════════════════

set -e

VSIX_PATH=""
UNINSTALL=0
DRY_RUN=0
QUIET=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --vsix) VSIX_PATH="$2"; shift 2 ;;
        --uninstall) UNINSTALL=1; shift ;;
        --dry-run) DRY_RUN=1; shift ;;
        --quiet) QUIET=1; shift ;;
        -h|--help)
            sed -n '2,20p' "$0"
            exit 0
            ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
done

log() {
    if [[ $QUIET -eq 0 ]]; then
        echo -e "$1"
    fi
}

# FNV-1a port hash · per-user 8889..8988
fnv1a_port() {
    local input="$1"
    [[ -z "$input" ]] && input="0"
    local h=2166136261
    local prime=16777619
    local i
    for ((i=0; i<${#input}; i++)); do
        local c=$(printf '%d' "'${input:i:1}")
        h=$(( (h ^ c) & 0xFFFFFFFF ))
        h=$(( (h * prime) & 0xFFFFFFFF ))
    done
    echo $((8889 + (h % 100)))
}

# ═══════════════ 1. 自适应检测 ═══════════════
log "═══ 反者道之动 · 第九回 · 软编码 · 适万环境装毕 ═══"
log ""

CUR_USER="${USER:-$(whoami)}"
CUR_HOME="${HOME:-$(eval echo ~$CUR_USER)}"
EXT_DIR="$CUR_HOME/.windsurf/extensions"
AUTO_PORT=$(fnv1a_port "$CUR_USER")

log "【自适应检测】"
log "  当前用户   : $CUR_USER"
log "  用户目录   : $CUR_HOME"
log "  扩展目录   : $EXT_DIR"
log "  自映端口   : $AUTO_PORT  (FNV-1a · per-user 自然隔离)"
log ""

if [[ ! -d "$EXT_DIR" ]]; then
    log "  ⚠ 扩展目录不存 · 创建中..."
    [[ $DRY_RUN -eq 0 ]] && mkdir -p "$EXT_DIR"
fi

# ═══════════════ 2. 解析 / 检测 vsix ═══════════════
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$VSIX_PATH" ]]; then
    VSIX_PATH=$(find "$SCRIPT_DIR" -maxdepth 1 -name 'dao-proxy-min-*.vsix' | sort -r | head -1)
    if [[ -z "$VSIX_PATH" ]]; then
        log "  ✗ 未找到 dao-proxy-min-*.vsix · 请显式指定 --vsix"
        exit 1
    fi
    log "【vsix 自动检测】"
    log "  $VSIX_PATH"
else
    [[ ! -f "$VSIX_PATH" ]] && { log "  ✗ vsix 不存: $VSIX_PATH"; exit 1; }
    log "【vsix 显式指定】"
    log "  $VSIX_PATH"
fi

VSIX_NAME=$(basename "$VSIX_PATH")
if [[ "$VSIX_NAME" =~ dao-proxy-min-([0-9]+\.[0-9]+\.[0-9]+)\.vsix ]]; then
    VER="${BASH_REMATCH[1]}"
else
    log "  ✗ vsix 文件名不合格 (期 dao-proxy-min-X.Y.Z.vsix): $VSIX_NAME"
    exit 1
fi
log "  目标版本   : v$VER"
log ""

# ═══════════════ 3. 卸载分支 ═══════════════
if [[ $UNINSTALL -eq 1 ]]; then
    log "═══ 卸载模式 · 清 dao-proxy-min 全版 ═══"
    for d in "$EXT_DIR"/dao-agi.dao-proxy-min*; do
        [[ -d "$d" ]] || continue
        log "  ─ 删 $(basename $d)"
        [[ $DRY_RUN -eq 0 ]] && rm -rf "$d"
    done

    EXT_JSON="$EXT_DIR/extensions.json"
    if [[ -f "$EXT_JSON" ]] && command -v python3 >/dev/null 2>&1; then
        if [[ $DRY_RUN -eq 0 ]]; then
            python3 -c "
import json, sys
with open('$EXT_JSON', 'r', encoding='utf-8') as f:
    arr = json.load(f)
filtered = [e for e in arr if e.get('identifier', {}).get('id') != 'dao-agi.dao-proxy-min']
with open('$EXT_JSON', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, ensure_ascii=False, separators=(',', ':'))
"
        fi
        log "  ─ extensions.json: 移除 dao-proxy-min 注册"
    fi
    log ""
    log "✓ 卸载毕 · 主公须 reload Windsurf 窗以完成净化"
    exit 0
fi

# ═══════════════ 4. 旧版处理 ═══════════════
log "═══ 装毕主链路 ═══"

TGT_DIR="$EXT_DIR/dao-agi.dao-proxy-min-$VER"
OLD_DIRS=($(find "$EXT_DIR" -maxdepth 1 -type d -name 'dao-agi.dao-proxy-min-*' ! -name "dao-agi.dao-proxy-min-$VER" 2>/dev/null))

if [[ ${#OLD_DIRS[@]} -gt 0 ]]; then
    log "【旧版处理 · 入 .obsolete + 不删 (主公自决)】"
    OBSOLETE_PATH="$EXT_DIR/.obsolete"
    if command -v python3 >/dev/null 2>&1; then
        if [[ $DRY_RUN -eq 0 ]]; then
            python3 << PYEOF
import json, os
p = "$OBSOLETE_PATH"
obj = {}
if os.path.isfile(p):
    try:
        with open(p, "r", encoding="utf-8") as f:
            obj = json.load(f)
    except Exception:
        obj = {}
new_olds = """$(printf '%s\n' "${OLD_DIRS[@]}")""".strip().split("\n")
for d in new_olds:
    if d:
        obj[os.path.basename(d)] = True
with open(p, "w", encoding="utf-8") as f:
    json.dump(obj, f, separators=(',', ':'))
PYEOF
        fi
        for d in "${OLD_DIRS[@]}"; do
            log "  ─ $(basename $d) → .obsolete"
        done
    fi
    log ""
fi

if [[ -d "$TGT_DIR" ]]; then
    BAK_DIR="${TGT_DIR}.bak_$(date +%Y%m%d_%H%M%S)"
    log "【已存目标版 · 备份】"
    log "  $TGT_DIR → $BAK_DIR"
    [[ $DRY_RUN -eq 0 ]] && mv "$TGT_DIR" "$BAK_DIR"
    log ""
fi

# ═══════════════ 5. 解 vsix ═══════════════
log "【解 vsix · 装毕】"
TMP_DIR=$(mktemp -d -t dao-proxy-min-install-XXXXXXXX)

if [[ $DRY_RUN -eq 0 ]]; then
    if command -v unzip >/dev/null 2>&1; then
        unzip -q "$VSIX_PATH" -d "$TMP_DIR"
    elif command -v python3 >/dev/null 2>&1; then
        python3 -c "
import zipfile
with zipfile.ZipFile('$VSIX_PATH') as z:
    z.extractall('$TMP_DIR')
"
    else
        log "  ✗ 既无 unzip 又无 python3 · 不能解 vsix"
        rm -rf "$TMP_DIR"
        exit 1
    fi

    [[ ! -d "$TMP_DIR/extension" ]] && { log "  ✗ vsix 无 extension/ 目录"; rm -rf "$TMP_DIR"; exit 1; }
    cp -R "$TMP_DIR/extension" "$TGT_DIR"
    rm -rf "$TMP_DIR"
fi
log "  ✓ $VSIX_PATH → $TGT_DIR"
log ""

# ═══════════════ 6. 注册 extensions.json (用 python3) ═══════════════
log "【注册 extensions.json】"
EXT_JSON="$EXT_DIR/extensions.json"

if [[ $DRY_RUN -eq 0 ]] && command -v python3 >/dev/null 2>&1; then
    python3 << PYEOF
import json, os, time

ext_json = "$EXT_JSON"
tgt_dir = "$TGT_DIR"
ver = "$VER"

# 读现 (容错)
arr = []
if os.path.isfile(ext_json):
    try:
        with open(ext_json, "r", encoding="utf-8") as f:
            arr = json.load(f)
        if not isinstance(arr, list):
            arr = []
    except Exception:
        arr = []

# 过 dao-proxy-min 旧条
filtered = [e for e in arr if e.get("identifier", {}).get("id") != "dao-agi.dao-proxy-min"]

# 读 package.json
pkg = {}
pkg_path = os.path.join(tgt_dir, "package.json")
if os.path.isfile(pkg_path):
    with open(pkg_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)

# 加新条
new_entry = {
    "identifier": {"id": "dao-agi.dao-proxy-min"},
    "version": pkg.get("version", ver),
    "location": {
        "\$mid": 1,
        "fsPath": tgt_dir,
        "path": "/" + tgt_dir.replace("\\\\", "/"),
        "scheme": "file"
    },
    "relativeLocation": f"dao-agi.dao-proxy-min-{ver}",
    "metadata": {
        "installedTimestamp": int(time.time() * 1000),
        "source": "vsix"
    }
}
filtered.append(new_entry)

with open(ext_json, "w", encoding="utf-8") as f:
    json.dump(filtered, f, separators=(',', ':'))

print(f"  ✓ dao-agi.dao-proxy-min v{pkg.get('version', ver)} 注册")
PYEOF
else
    log "  ⚠ python3 不可用 · extensions.json 须主公手动加 (windsurf 启动时自检亦可)"
fi
log ""

# ═══════════════ 7. 终结报告 ═══════════════
log "═══ 装毕毕 · 三事须主公 ═══"
log "  1. 关 Windsurf 全窗 · 重开 (或 Cmd/Ctrl+Shift+P → Reload Window)"
log "  2. 主公新发 chat · proxy 自启于端口 $AUTO_PORT"
log "  3. 看 webview 之「道Agent · 本源观照」面板 · 三事自验:"
log "     a. webview 显完整 SP 字段 (撤真药 Q 之效)"
log "     b. 「道」按钮 active = 帛书《老子》注入"
log "     c. 「官」按钮 active = 透传不改 SP"
log ""
log "─── 状态摘要 ───"
log "  用户        : $CUR_USER"
log "  端口        : $AUTO_PORT"
log "  扩展        : dao-agi.dao-proxy-min v$VER"
log "  位置        : $TGT_DIR"
log "  extensions.json: $EXT_JSON"
log ""
[[ $DRY_RUN -eq 1 ]] && log "  ⚠ DryRun 模式 · 无真装"
log "「道法自然 · 无为而无不为」"
exit 0
