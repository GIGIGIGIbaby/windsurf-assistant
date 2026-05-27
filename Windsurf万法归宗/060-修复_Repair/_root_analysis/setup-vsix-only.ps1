# setup-vsix-only-v2.ps1
# Simple installer: VSCode + 030 + 040, no Windsurf needed.
param(
    [switch]$DryRun,
    [switch]$Verify,
    [switch]$Uninstall
)

$Repo = Split-Path -Parent $PSScriptRoot
$VSIX_030 = Join-Path $Repo "070-插件_Plugins\030-转制VSIX_Repack\windsurf-dao-0.2.0.vsix"
$VSIX_040 = Join-Path $Repo "070-插件_Plugins\040-道反代_LanProxy\dao-lan-proxy-1.0.0.vsix"

function Say($msg, $color = 'White') { Write-Host $msg -ForegroundColor $color }
function Section($title) { Write-Host ""; Write-Host "==== $title ====" -ForegroundColor Cyan }

# 1. Find VSCode CLI
Section "Step 1: VS Code CLI"
$codeCli = $null
foreach ($cli in @('code', 'code-insiders', 'cursor')) {
    $found = Get-Command $cli -ErrorAction SilentlyContinue
    if ($found) { $codeCli = $found.Source; break }
}
if (-not $codeCli) {
    Say "  Not found: 'code' CLI" Red
    Say "  Install VS Code first: https://code.visualstudio.com/" Yellow
    exit 1
}
Say "  Found: $codeCli" Green

# 2. Verify VSIX files
Section "Step 2: VSIX files"
foreach ($v in @($VSIX_030, $VSIX_040)) {
    if (-not (Test-Path $v)) {
        Say "  Missing: $v" Red
        exit 1
    }
    $sz = [math]::Round((Get-Item $v).Length / 1MB, 1)
    Say ("  OK: " + (Split-Path $v -Leaf) + " ($sz MB)") Green
}

# 3. Uninstall mode
if ($Uninstall) {
    Section "Uninstall"
    foreach ($id in @('dao-agi.windsurf-dao', 'dao-agi.dao-lan-proxy')) {
        if ($DryRun) {
            Say "  [dry] $codeCli --uninstall-extension $id" Yellow
        } else {
            & $codeCli --uninstall-extension $id
        }
    }
    Say "Done." Cyan
    exit 0
}

# 4. Verify mode
if ($Verify) {
    Section "Verify"

    Say "  Installed extensions:"
    $list = & $codeCli --list-extensions
    foreach ($id in @('dao-agi.windsurf-dao', 'dao-agi.dao-lan-proxy')) {
        if ($list -match $id) {
            Say "    OK: $id" Green
        } else {
            Say "    MISSING: $id" Red
        }
    }

    Say "  LS process:"
    $procs = Get-Process language_server* -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($p in $procs) {
            Say ("    OK: PID " + $p.Id) Green
        }
    } else {
        Say "    WARN: no LS process running (start VS Code first)" Yellow
    }

    Say "  LAN endpoint :11434:"
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/v1/models' -TimeoutSec 3 -UseBasicParsing
        $j = $r.Content | ConvertFrom-Json
        Say ("    OK: " + $j.data.Count + " models") Green
    } catch {
        Say "    WARN: not reachable (start VS Code, wait 5s, retry)" Yellow
    }

    Say ""
    Say "Verify complete." Cyan
    exit 0
}

# 5. Install
Section "Step 3: Install VSIX"
foreach ($v in @($VSIX_030, $VSIX_040)) {
    $name = Split-Path $v -Leaf
    if ($DryRun) {
        Say ("  [dry] " + $codeCli + " --install-extension " + $v) Yellow
    } else {
        Say "  Installing $name..." White
        & $codeCli --install-extension $v
        if ($LASTEXITCODE -ne 0) {
            Say ("  FAIL exit=" + $LASTEXITCODE) Red
            exit 1
        }
        Say "  OK: $name" Green
    }
}

# 6. post-install (one-shot for proposed APIs)
Section "Step 4: post-install"
$postInstall = Join-Path $Repo "070-插件_Plugins\030-转制VSIX_Repack\post-install.js"
if (Test-Path $postInstall) {
    if ($DryRun) {
        Say "  [dry] node $postInstall" Yellow
    } else {
        try {
            & node $postInstall
            Say "  OK" Green
        } catch {
            Say ("  WARN: " + $_.Exception.Message) Yellow
        }
    }
} else {
    Say "  (no post-install.js, skip)" Yellow
}

# 7. Done
Section "Done"
Say "  Next:"
Say "    1. Reload VS Code (Ctrl+Shift+P -> 'Reload Window')"
Say "    2. Look for Cascade icon on left sidebar"
Say "    3. Status bar should show 'LanProxy:11434'"
Say "    4. Verify: -Verify"
Say ""
Say "  No Windsurf needed. Two paths run parallel without conflict." Cyan
