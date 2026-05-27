# Check zhou user's Windsurf state on 141
$secretsFile = Join-Path $PSScriptRoot '..\secrets.env'
$secrets = @{}
Get-Content $secretsFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.+)$') {
        $secrets[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}
$cred = New-Object PSCredential($secrets['DESKTOP_USER'], (ConvertTo-SecureString $secrets['DESKTOP_PASSWORD'] -AsPlainText -Force))

Write-Host "`n=== Check zhou user Windsurf on 141 ===" -ForegroundColor Cyan

$result = Invoke-Command -ComputerName 192.168.31.141 -Credential $cred -ScriptBlock {
    $out = @()
    
    # Find zhou's profile
    $zhouProfile = 'C:\Users\zhou'
    $out += "=== Zhou Profile ==="
    $out += "Exists: $(Test-Path $zhouProfile)"
    
    if (Test-Path $zhouProfile) {
        # Zhou's Windsurf data
        $zhouData = "$zhouProfile\AppData\Roaming\Windsurf"
        $out += "`n=== Zhou Windsurf Data ==="
        if (Test-Path $zhouData) {
            Get-ChildItem $zhouData -Directory -ErrorAction SilentlyContinue | ForEach-Object { $out += "  DIR: $($_.Name)" }
        } else { $out += "  NOT FOUND" }
        
        # Zhou's auth
        $zhouCodeium = "$zhouProfile\.codeium\windsurf"
        $zhouAuth = "$zhouCodeium\user_settings.pb"
        $out += "`n=== Zhou Auth ==="
        $out += "user_settings.pb: $(if(Test-Path $zhouAuth) { 'EXISTS (' + (Get-Item $zhouAuth).Length + 'B, ' + [math]::Round(((Get-Date)-(Get-Item $zhouAuth).LastWriteTime).TotalHours,1) + 'h ago)' } else { 'MISSING' })"
        
        # Zhou's extensions
        $zhouExt = "$zhouProfile\.windsurf\extensions"
        $out += "`n=== Zhou User Extensions ==="
        if (Test-Path $zhouExt) {
            $exts = Get-ChildItem $zhouExt -Directory -ErrorAction SilentlyContinue
            $out += "Count: $($exts.Count)"
            $exts | ForEach-Object { $out += "  $($_.Name)" }
        } else { $out += "  DIR NOT FOUND" }
        
        # Zhou's settings.json
        $zhouSettings = "$zhouData\User\settings.json"
        $out += "`n=== Zhou Settings ==="
        if (Test-Path $zhouSettings) {
            $content = Get-Content $zhouSettings -Raw -ErrorAction SilentlyContinue
            $out += "Size: $($content.Length) chars"
            $out += "Content: $($content.Substring(0, [math]::Min(500, $content.Length)))"
        } else { $out += "  NOT FOUND" }
        
        # Zhou's storage.json (telemetry)
        $zhouStorage = "$zhouData\User\globalStorage\storage.json"
        $out += "`n=== Zhou Storage.json ==="
        if (Test-Path $zhouStorage) {
            $storage = Get-Content $zhouStorage -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($storage.'telemetry.machineId') {
                $out += "machineId: $($storage.'telemetry.machineId'.Substring(0,16))..."
            }
        } else { $out += "  NOT FOUND" }
    }
    
    # Also check which user the running Windsurf belongs to
    $out += "`n=== Running Windsurf Owner ==="
    $procs = Get-Process -Name 'Windsurf' -IncludeUserName -ErrorAction SilentlyContinue
    if ($procs) {
        $byUser = $procs | Group-Object UserName
        foreach ($g in $byUser) {
            $mb = [math]::Round(($g.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB)
            $out += "  $($g.Name): $($g.Count) processes, ${mb}MB"
        }
    } else { $out += "  No Windsurf processes" }
    
    # Check sessions again
    $out += "`n=== Active Sessions ==="
    $quser = quser 2>&1
    $out += ($quser | Out-String)
    
    $out -join "`n"
}

Write-Host $result
