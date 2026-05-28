# Windsurf Extension Root-Cause Fix
# Root cause: extensions.json manifest is corrupted/incomplete
# Fix: Scan all installed extension dirs and rebuild manifest
# Also fixes: product.json gallery config, network connectivity
# Supports: dual-machine fix (local 141 + remote laptop 179)

param(
    [switch]$RemoteFix,
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Status {
    param([string]$msg, [string]$color = 'Cyan')
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" -ForegroundColor $color
}

function Backup-File {
    param([string]$path)
    if (Test-Path $path) {
        $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
        $bak = "$path.$ts.bak"
        Copy-Item $path $bak -Force
        Write-Status "Backup: $bak" 'DarkGray'
        return $bak
    }
    return $null
}

function Rebuild-ExtensionsJson {
    param(
        [string]$ExtDir = "$env:USERPROFILE\.windsurf\extensions",
        [switch]$Preview
    )

    if (-not (Test-Path $ExtDir)) {
        Write-Status "Extension dir not found: $ExtDir" 'Red'
        return $false
    }

    $manifestPath = Join-Path $ExtDir 'extensions.json'
    $dirs = Get-ChildItem $ExtDir -Directory | Where-Object { $_.Name -ne '.obsolete' -and $_.Name -ne 'auto_run_debug' }

    # Read .obsolete to skip those
    $obsolete = @{}
    $obsoletePath = Join-Path $ExtDir '.obsolete'
    if (Test-Path $obsoletePath) {
        try {
            $obs = Get-Content $obsoletePath -Raw | ConvertFrom-Json
            $obs.PSObject.Properties | ForEach-Object { $obsolete[$_.Name] = $true }
        } catch {}
    }

    Write-Status "Scanning: $ExtDir"
    Write-Status "Found $($dirs.Count) dirs, $($obsolete.Count) obsolete"

    $entries = @()
    $errors = @()

    foreach ($dir in $dirs) {
        if ($obsolete.ContainsKey($dir.Name)) {
            Write-Status "  SKIP obsolete: $($dir.Name)" 'DarkGray'
            continue
        }

        $pkgPath = Join-Path $dir.FullName 'package.json'
        if (-not (Test-Path $pkgPath)) {
            $errors += "No package.json: $($dir.Name)"
            Write-Status "  SKIP no pkg: $($dir.Name)" 'Yellow'
            continue
        }

        try {
            $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
            $publisher = $pkg.publisher
            $extName = $pkg.name
            $version = $pkg.version

            if (-not $publisher -or -not $extName -or -not $version) {
                $errors += "Incomplete package.json: $($dir.Name)"
                Write-Status "  SKIP incomplete: $($dir.Name)" 'Yellow'
                continue
            }

            $id = "$publisher.$extName"

            $meta = $pkg.__metadata
            $targetPlatform = 'undefined'
            $size = 0
            $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

            if ($meta) {
                if ($meta.targetPlatform) { $targetPlatform = $meta.targetPlatform }
                if ($meta.size) { $size = $meta.size }
                if ($meta.installedTimestamp) { $timestamp = $meta.installedTimestamp }
            }

            $canonPath = $dir.FullName -replace '\\','/'

            $entry = [ordered]@{
                relativeLocation = $dir.Name
                metadata = [ordered]@{
                    size = $size
                    installedTimestamp = $timestamp
                    targetPlatform = $targetPlatform
                }
                version = $version
                identifier = [ordered]@{
                    id = $id
                    uuid = $id
                }
                location = [ordered]@{
                    '$mid' = 1
                    scheme = 'file'
                    path = $canonPath
                }
            }

            $entries += $entry
            Write-Status "  + $id@$version [$targetPlatform]" 'Green'

        } catch {
            $errors += "Parse fail: $($dir.Name) - $($_.Exception.Message)"
            Write-Status "  x $($dir.Name): $_" 'Red'
        }
    }

    $resultColor = if ($errors.Count -gt 0) { 'Yellow' } else { 'Green' }
    Write-Status "Result: $($entries.Count) valid, $($errors.Count) errors" $resultColor

    if ($Preview) {
        Write-Status "PREVIEW MODE - no files written" 'Yellow'
        return @{ Entries = $entries; Errors = $errors; Count = $entries.Count }
    }

    Backup-File $manifestPath

    $json = $entries | ConvertTo-Json -Depth 10 -Compress
    if ($entries.Count -eq 1) { $json = "[$json]" }
    if ($entries.Count -eq 0) { $json = '[]' }

    [System.IO.File]::WriteAllText($manifestPath, $json, [System.Text.UTF8Encoding]::new($false))

    Write-Status "Written: $manifestPath ($($json.Length) bytes, $($entries.Count) extensions)" 'Green'

    if ($errors.Count -gt 0) {
        Write-Status "Errors:" 'Yellow'
        $errors | ForEach-Object { Write-Status "  - $_" 'Yellow' }
    }

    return @{ Entries = $entries; Errors = $errors; Count = $entries.Count; Path = $manifestPath }
}

function Test-MarketplaceConnectivity {
    Write-Status "=== Marketplace Connectivity ==="

    $results = @{}

    Write-Status "DNS resolve..."
    try {
        $dns = Resolve-DnsName 'marketplace.windsurf.com' -ErrorAction Stop
        $results['dns'] = $true
        Write-Status "  marketplace.windsurf.com -> $($dns[0].IPAddress)" 'Green'
    } catch {
        $results['dns'] = $false
        Write-Status "  DNS FAILED" 'Red'
    }

    Write-Status "Proxy check..."
    $settingsPath = "$env:APPDATA\Windsurf\User\settings.json"
    $proxyUrl = $null
    if (Test-Path $settingsPath) {
        $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
        if ($settings.'http.proxy') {
            $proxyUrl = $settings.'http.proxy'
            Write-Status "  Configured proxy: $proxyUrl"

            $uri = [System.Uri]$proxyUrl
            $test = Test-NetConnection -ComputerName $uri.Host -Port $uri.Port -WarningAction SilentlyContinue
            if ($test.TcpTestSucceeded) {
                $results['proxy_port'] = $true
                Write-Status "  Proxy port reachable" 'Green'
            } else {
                $results['proxy_port'] = $false
                Write-Status "  Proxy port UNREACHABLE - root cause of download failures" 'Red'
            }
        }
    }

    Write-Status "HTTP connectivity..."
    $urls = @(
        'https://marketplace.windsurf.com/vscode/gallery',
        'https://open-vsx.org/vscode/gallery'
    )
    foreach ($url in $urls) {
        try {
            $params = @{ Uri = $url; Method = 'HEAD'; TimeoutSec = 15; UseBasicParsing = $true }
            if ($proxyUrl) { $params['Proxy'] = $proxyUrl }
            $r = Invoke-WebRequest @params
            $results[$url] = $r.StatusCode
            Write-Status "  $url -> $($r.StatusCode)" 'Green'
        } catch {
            $results[$url] = "FAIL"
            Write-Status "  $url -> FAIL" 'Red'
        }
    }

    return $results
}

function Fix-ProductJson {
    param([string]$ProductPath = 'E:\Windsurf\resources\app\product.json')

    if (-not (Test-Path $ProductPath)) {
        Write-Status "product.json not found: $ProductPath" 'Red'
        return $false
    }

    $product = Get-Content $ProductPath -Raw | ConvertFrom-Json
    $gallery = $product.extensionsGallery

    $expectedUrl = 'https://marketplace.windsurf.com/vscode/gallery'
    $expectedItem = 'https://marketplace.windsurf.com/vscode/item'

    $needsFix = $false
    if (-not $gallery) {
        $needsFix = $true
        Write-Status "extensionsGallery MISSING" 'Red'
    } elseif ($gallery.serviceUrl -ne $expectedUrl) {
        $needsFix = $true
        Write-Status "serviceUrl wrong: $($gallery.serviceUrl)" 'Yellow'
    }

    if ($needsFix -and -not $DryRun) {
        Backup-File $ProductPath
        $product.extensionsGallery = @{ serviceUrl = $expectedUrl; itemUrl = $expectedItem }
        $json = $product | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($ProductPath, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Status "product.json FIXED" 'Green'
    } elseif (-not $needsFix) {
        Write-Status "product.json OK" 'Green'
    }

    return $true
}

# ===== MAIN =====

Write-Host ""
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "  Windsurf Extension Root-Cause Fix" -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host ""

# Step 1: Diagnose
Write-Status "=== Step 1: Diagnose ==="
$extDir = "$env:USERPROFILE\.windsurf\extensions"
$manifestPath = Join-Path $extDir 'extensions.json'

$diskDirs = Get-ChildItem $extDir -Directory | Where-Object { $_.Name -ne '.obsolete' }
$diskCount = $diskDirs.Count
$manifestCount = 0
if (Test-Path $manifestPath) {
    try {
        $current = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $manifestCount = @($current).Count
    } catch { $manifestCount = -1 }
}

Write-Status "Disk extension dirs: $diskCount"
Write-Status "Manifest entries: $manifestCount"
$delta = $diskCount - $manifestCount
if ($delta -eq 0) {
    Write-Status "Delta: 0 (OK)" 'Green'
} else {
    Write-Status "Delta: $delta extensions NOT registered" 'Red'
}

# Step 2: Rebuild extensions.json
if ($delta -ne 0 -or $Force) {
    Write-Status "=== Step 2: Rebuild extensions.json ==="
    if ($DryRun) {
        $result = Rebuild-ExtensionsJson -ExtDir $extDir -Preview
        Write-Status "Preview: would register $($result.Count) extensions"
    } else {
        $result = Rebuild-ExtensionsJson -ExtDir $extDir
        Write-Status "Done: $($result.Count) extensions registered"
    }
} else {
    Write-Status "extensions.json up to date, skipping rebuild" 'Green'
}

# Step 3: Verify product.json
Write-Status "=== Step 3: Verify product.json ==="
Fix-ProductJson

# Step 4: Network
Write-Status "=== Step 4: Network Connectivity ==="
$netResult = Test-MarketplaceConnectivity

# Step 5: Remote fix
if ($RemoteFix) {
    Write-Status "=== Step 5: Remote Fix laptop 192.168.31.179 ==="

    $secrets = @{}
    $envFile = 'E:\道\道生一\一生二\secrets.env'
    if (Test-Path $envFile) {
        Get-Content $envFile -Encoding UTF8 | ForEach-Object {
            if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
                $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
            }
        }
    }

    $ip = '192.168.31.179'
    $user = $secrets['LAPTOP_MAIN_USER']
    $pass = $secrets['LAPTOP_MAIN_PASSWORD']

    if ($user -and $pass) {
        $cred = New-Object PSCredential($user, (ConvertTo-SecureString $pass -AsPlainText -Force))

        try {
            $remoteResult = Invoke-Command -ComputerName $ip -Credential $cred -ScriptBlock {
                $ErrorActionPreference = 'Continue'
                $out = @()

                $extDir = "$env:USERPROFILE\.windsurf\extensions"
                $manifestPath = Join-Path $extDir 'extensions.json'

                $dirs = Get-ChildItem $extDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne '.obsolete' }
                $diskCount = if ($dirs) { $dirs.Count } else { 0 }

                $manifestCount = 0
                if (Test-Path $manifestPath) {
                    try {
                        $m = Get-Content $manifestPath -Raw | ConvertFrom-Json
                        $manifestCount = @($m).Count
                    } catch {}
                }

                $out += "REMOTE_DISK=$diskCount"
                $out += "REMOTE_MANIFEST=$manifestCount"

                if ($diskCount -ne $manifestCount -or $diskCount -eq 0) {
                    $obsolete = @{}
                    $obsPath = Join-Path $extDir '.obsolete'
                    if (Test-Path $obsPath) {
                        try {
                            $obs = Get-Content $obsPath -Raw | ConvertFrom-Json
                            $obs.PSObject.Properties | ForEach-Object { $obsolete[$_.Name] = $true }
                        } catch {}
                    }

                    $entries = @()
                    foreach ($dir in $dirs) {
                        if ($obsolete.ContainsKey($dir.Name)) { continue }
                        $pkgPath = Join-Path $dir.FullName 'package.json'
                        if (-not (Test-Path $pkgPath)) { continue }
                        try {
                            $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
                            if (-not $pkg.publisher -or -not $pkg.name -or -not $pkg.version) { continue }
                            $id = "$($pkg.publisher).$($pkg.name)"
                            $meta = $pkg.__metadata
                            $tp = if ($meta -and $meta.targetPlatform) { $meta.targetPlatform } else { 'undefined' }
                            $sz = if ($meta -and $meta.size) { $meta.size } else { 0 }
                            $ts = if ($meta -and $meta.installedTimestamp) { $meta.installedTimestamp } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
                            $canonPath = $dir.FullName -replace '\\','/'
                            $entries += [ordered]@{
                                relativeLocation = $dir.Name
                                metadata = [ordered]@{ size = $sz; installedTimestamp = $ts; targetPlatform = $tp }
                                version = $pkg.version
                                identifier = [ordered]@{ id = $id; uuid = $id }
                                location = [ordered]@{ '$mid' = 1; scheme = 'file'; path = $canonPath }
                            }
                        } catch {}
                    }

                    if ($entries.Count -gt 0) {
                        if (Test-Path $manifestPath) {
                            Copy-Item $manifestPath "$manifestPath.$(Get-Date -Format 'yyyyMMdd_HHmmss').bak" -Force
                        }
                        $json = $entries | ConvertTo-Json -Depth 10 -Compress
                        if ($entries.Count -eq 1) { $json = "[$json]" }
                        [System.IO.File]::WriteAllText($manifestPath, $json, [System.Text.UTF8Encoding]::new($false))
                        $out += "REMOTE_FIXED=$($entries.Count)"
                    } else {
                        $out += "REMOTE_FIXED=0"
                    }
                } else {
                    $out += "REMOTE_OK=true"
                }

                $out -join "`n"
            }

            Write-Status "Remote result:" 'Cyan'
            $remoteResult -split "`n" | ForEach-Object { Write-Status "  $_" 'DarkCyan' }

        } catch {
            Write-Status "Remote connection failed: $($_.Exception.Message)" 'Red'
        }
    } else {
        Write-Status "No remote credentials found in secrets.env" 'Yellow'
    }
}

# Summary
Write-Host ""
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "  Fix complete - RESTART Windsurf to apply" -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host ""

if (-not $DryRun) {
    Write-Status "Next: Close and reopen Windsurf, extensions will load automatically" 'Yellow'
}
