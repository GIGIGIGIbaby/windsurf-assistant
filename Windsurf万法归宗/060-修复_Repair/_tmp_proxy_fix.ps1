$ErrorActionPreference = 'Continue'
# Load secrets
$secrets = @{}
$envFile = Join-Path $PSScriptRoot '..\secrets.env'
if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
            $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
        }
    }
}
$user = $secrets['DESKTOP_USER']
$pass = $secrets['DESKTOP_PASSWORD']
$secPass = ConvertTo-SecureString $pass -AsPlainText -Force
$cred = New-Object PSCredential($user, $secPass)

# Fix WAM + full rebuild extensions.json on remote 141
$result = Invoke-Command -ComputerName 192.168.31.141 -Credential $cred -ScriptBlock {
    $log = @()
    
    # Kill Windsurf
    Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep 1
    
    # 1. Fix WAM package.json with correct UTF-8 content
    $wamPkgPath = "C:\Users\Administrator\.windsurf\extensions\local.wam-4.0.0\package.json"
    if (Test-Path $wamPkgPath) {
        # Write correct UTF-8 BOM-less content
        $correctWam = @'
{
  "name": "wam",
  "displayName": "WAM",
  "description": "Windsurf Account Manager v6",
  "version": "4.0.0",
  "publisher": "local",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "wam-container",
          "title": "WAM",
          "icon": "media/icon.svg"
        }
      ]
    },
    "views": {
      "wam-container": [
        {
          "id": "wam.panel",
          "name": "WAM Panel",
          "type": "webview"
        }
      ]
    },
    "commands": [
      { "command": "wam.openEditor", "title": "WAM: Open Panel" },
      { "command": "wam.switchAccount", "title": "WAM: Switch Account" },
      { "command": "wam.refreshAll", "title": "WAM: Refresh All" },
      { "command": "wam.addAccount", "title": "WAM: Add Account" },
      { "command": "wam.autoRotate", "title": "WAM: Auto Rotate" },
      { "command": "wam.panicSwitch", "title": "WAM: Panic Switch" },
      { "command": "wam.injectToken", "title": "WAM: Inject Token" },
      { "command": "wam.verifyAll", "title": "WAM: Verify All" },
      { "command": "wam.officialMode", "title": "WAM: Official Mode" },
      { "command": "wam.wamMode", "title": "WAM: WAM Mode" },
      { "command": "wam.status", "title": "WAM: Status" }
    ],
    "configuration": {
      "title": "WAM",
      "properties": {
        "wam.autoRotate": {
          "type": "boolean",
          "default": true,
          "description": "Auto-rotate accounts when quota changes detected"
        }
      }
    }
  }
}
'@
        [System.IO.File]::WriteAllText($wamPkgPath, $correctWam, [System.Text.UTF8Encoding]::new($false))
        $log += "[FIX] WAM package.json rewritten (ASCII-safe)"
        try {
            $null = Get-Content $wamPkgPath -Raw | ConvertFrom-Json -ErrorAction Stop
            $log += "[OK] WAM package.json valid"
        } catch {
            $log += "[ERROR] WAM still invalid: $_"
        }
    }
    
    # 2. Full rebuild extensions.json from ALL directories
    $extDir = "C:\Users\Administrator\.windsurf\extensions"
    $extJson = Join-Path $extDir 'extensions.json'
    $extDirs = Get-ChildItem $extDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^\.' }
    $log += "[INFO] Scanning $($extDirs.Count) extension directories..."
    
    $entries = [System.Collections.ArrayList]@()
    foreach ($d in $extDirs) {
        $pkgJson = Join-Path $d.FullName 'package.json'
        if (Test-Path $pkgJson) {
            try {
                $pkg = Get-Content $pkgJson -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
                $publisher = if ($pkg.publisher) { $pkg.publisher } else { 'unknown' }
                $name = if ($pkg.name) { $pkg.name } else { $d.Name }
                $version = if ($pkg.version) { $pkg.version } else { '0.0.0' }
                $id = "$publisher.$name"
                $tp = 'undefined'
                if ($d.Name -match '-(win32-x64|linux-x64|darwin-x64|darwin-arm64|universal)$') { $tp = $Matches[1] }
                
                $entry = [ordered]@{
                    identifier = [ordered]@{ id = $id; uuid = $id }
                    version = $version
                    relativeLocation = $d.Name
                    location = [ordered]@{ scheme = 'file'; path = "C:/Users/Administrator/.windsurf/extensions/$($d.Name)"; '$mid' = 1 }
                    metadata = [ordered]@{ installedTimestamp = [long]((Get-Date) - (Get-Date '1970-01-01')).TotalMilliseconds; targetPlatform = $tp }
                }
                $null = $entries.Add($entry)
                $log += "  [OK] $id@$version"
            } catch {
                $log += "  [WARN] $($d.Name): parse failed"
            }
        }
    }
    
    $jsonOut = ConvertTo-Json @($entries) -Depth 10
    [System.IO.File]::WriteAllText($extJson, $jsonOut, [System.Text.UTF8Encoding]::new($false))
    $sz = (Get-Item $extJson).Length
    $log += ""
    $log += "[FIX] extensions.json rebuilt: $($entries.Count) extensions, $sz bytes"
    
    # Verify
    try {
        $v = Get-Content $extJson -Raw | ConvertFrom-Json
        $log += "[OK] Verified: $(@($v).Count) extensions"
    } catch { $log += "[ERROR] Verify failed: $_" }
    
    $log -join "`n"
}

Write-Host $result
