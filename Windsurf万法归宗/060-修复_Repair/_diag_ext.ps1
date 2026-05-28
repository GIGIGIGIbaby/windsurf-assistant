# Diagnostic: check extensions + marketplace config on remote 179
$ErrorActionPreference = 'Continue'

# Load credentials
$secrets = @{}
$envFile = Join-Path $PSScriptRoot 'secrets.env'
if (-not (Test-Path $envFile)) { $envFile = 'E:\道\道生一\一生二\secrets.env' }
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') { $secrets[$Matches[1].Trim()] = $Matches[2].Trim() }
}

$user = $secrets['LAPTOP_MAIN_USER']
$pass = $secrets['LAPTOP_MAIN_PASSWORD']
$ip = '192.168.31.179'
$cred = New-Object PSCredential($user, (ConvertTo-SecureString $pass -AsPlainText -Force))

$result = Invoke-Command -ComputerName $ip -Credential $cred -ScriptBlock {
    $out = @()
    
    # 1. Extensions directory
    $extDir = "$env:USERPROFILE\.windsurf\extensions"
    $out += "EXT_DIR=$extDir"
    $out += "EXT_DIR_EXISTS=$(Test-Path $extDir)"
    if (Test-Path $extDir) {
        $dirs = Get-ChildItem $extDir -Directory
        $out += "EXT_COUNT=$($dirs.Count)"
        foreach ($d in $dirs | Select-Object -First 30) {
            $out += "EXT=$($d.Name)"
        }
    }
    
    # 2. Settings.json
    $settingsPath = "$env:APPDATA\Windsurf\User\settings.json"
    $out += "SETTINGS_EXISTS=$(Test-Path $settingsPath)"
    if (Test-Path $settingsPath) {
        $s = Get-Content $settingsPath -Raw
        $out += "SETTINGS_SIZE=$($s.Length)"
        # Check for gallery/marketplace settings
        if ($s -match 'gallery') { $out += "SETTINGS_HAS_GALLERY=true" }
        if ($s -match 'extensions\.gallery') { $out += "SETTINGS_HAS_EXT_GALLERY=true" }
    }
    
    # 3. Product.json (marketplace config)
    $productPath = 'E:\Windsurf\resources\app\product.json'
    $out += "PRODUCT_EXISTS=$(Test-Path $productPath)"
    if (Test-Path $productPath) {
        $p = Get-Content $productPath -Raw
        if ($p -match 'extensionsGallery') { $out += "PRODUCT_HAS_GALLERY=true" }
        else { $out += "PRODUCT_HAS_GALLERY=false" }
        # Extract gallery URL
        try {
            $pj = $p | ConvertFrom-Json
            if ($pj.extensionsGallery) {
                $out += "GALLERY_URL=$($pj.extensionsGallery.serviceUrl)"
            }
        } catch {}
    }
    
    # 4. Check for WAM extension
    $wamExt = Get-ChildItem "$env:USERPROFILE\.windsurf\extensions" -Directory -Filter 'wam*' -ErrorAction SilentlyContinue
    $out += "WAM_INSTALLED=$(if($wamExt){'true'}else{'false'})"
    
    # 5. Windsurf processes
    $procs = Get-Process -Name 'Windsurf' -ErrorAction SilentlyContinue
    $out += "WS_PROCS=$(if($procs){$procs.Count}else{0})"
    
    # 6. Check auth state detail
    $authFile = "$env:USERPROFILE\.codeium\windsurf\user_settings.pb"
    $out += "AUTH_EXISTS=$(Test-Path $authFile)"
    if (Test-Path $authFile) {
        $out += "AUTH_SIZE=$((Get-Item $authFile).Length)"
    }
    
    # 7. Storage.json - check gallery service URL override
    $storagePath = "$env:APPDATA\Windsurf\User\globalStorage\storage.json"
    if (Test-Path $storagePath) {
        $st = Get-Content $storagePath -Raw
        if ($st -match 'gallery') { $out += "STORAGE_HAS_GALLERY=true" }
    }
    
    $out -join "`n"
}

Write-Output $result
