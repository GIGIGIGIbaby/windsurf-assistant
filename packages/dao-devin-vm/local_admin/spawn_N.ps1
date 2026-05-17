#!/usr/bin/env pwsh
<#
.SYNOPSIS
  印 125 · 锚定本源 · 任 N 并发 spawn (一 windsurf 账号一 VM · 推到极)

.DESCRIPTION
  任 N 并发起 Devin VM · 一一对一 N 个 token (主公 64 池可一字 -Count 64)
  每件 VM 独立 SP 配置 (per-VM SP 隔离 · 印 125)

  默 -Action preview · 0 ACU · 不真起
  -Action go · ~N ACU · 真起 N 件 · 主公真金真银承

.PARAMETER Count
  N · VM 起件数 (1-178 · 默 1)

.PARAMETER Action
  preview : 0 ACU · 展执之计 (默)
  go      : ~N ACU · 真起 N 件
  status  : 0 ACU · 看 spawn jobs 状
  wait    : 0 ACU · 等齐 (~10min/件)
  stop    : 0 ACU · 停 jobs (但 VM 已起的不可撤)
  deploy  : 0 ACU · 对已起的 VM 跑 vm_proxy_deploy (含 SP 注)

.PARAMETER SpConfigDir
  per-VM SP 配置仓 (默 ../00_本源/_sp_configs)
  自动按 VM index 之序选: i=0→bypass · i=1→override · ... 循环 7 sample
  (主公也可自定 vm-甲.json/vm-乙.json/... 入此目)

.PARAMETER SpConfig
  单件 SP 配置 (覆盖 SpConfigDir · 全件用同一态)

.PARAMETER SpStrategy
  单件 SP 策略 (覆盖 SpConfig · 全件用同一态)
  bypass | override | prepend | append | dao | custom | usernote

.PARAMETER TokenFile
  token 池 (默 ../00_本源/tokens_dao_123.txt)
  每行一 devin-session-token$xxx · # 注释和空行自跳

.PARAMETER WamMode
  off (默): 用 -TokenFile 之 token (一一对一 N 账号)
  on: 用 WAM 之 activeApiKey (单账 N 件 · 主公 spawn 间手切 WAM 来分账)

.PARAMETER StartIdx
  从 token 池之第 N 行起 (默 0 · 主公分批用时定)

.PARAMETER StaggerSec
  并发起件之 stagger (默 5 秒 · 避 wss 风暴)

.PARAMETER DeployProxy
  spawn 后是否自动跑 vm_proxy_deploy (默 true · 一字立反代)

.EXAMPLE
  .\spawn_N.ps1 -Count 1                      # preview · 0 ACU
  .\spawn_N.ps1 -Count 3 -Action go           # 3 ACU 真起 · 一 token 一件
  .\spawn_N.ps1 -Count 64 -Action go          # 64 ACU 真起 · 极致 (主公真金)
  .\spawn_N.ps1 -Count 5 -SpStrategy dao -Action go    # 5 件全 dao 态
  .\spawn_N.ps1 -Count 7 -SpConfigDir ../00_本源/_sp_configs -Action go  # 7 件循环 7 态
#>

[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [int]$Count = 1,

  [Parameter(Position=1)]
  [ValidateSet('preview','go','status','wait','stop','deploy','')]
  [string]$Action = 'preview',

  [string]$SpConfigDir = '',
  [string]$SpConfig = '',
  [ValidateSet('','bypass','override','prepend','append','dao','custom','usernote')]
  [string]$SpStrategy = '',

  [string]$TokenFile = '',
  [ValidateSet('off','on')]
  [string]$WamMode = 'off',
  [int]$StartIdx = 0,
  [int]$StaggerSec = 5,
  [bool]$DeployProxy = $true
)

$ErrorActionPreference = 'Stop'
$BASE = Split-Path $PSScriptRoot -Parent
$BENYUAN = Join-Path $BASE '00_本源'
$STATE = Join-Path $BENYUAN '_state'
$LOG_DIR = Join-Path $STATE 'spawn_N_logs'
$STATE_FILE = Join-Path $STATE 'spawn_N_state.json'

# 默参之解
if (-not $SpConfigDir) { $SpConfigDir = Join-Path $BENYUAN '_sp_configs' }
if (-not $TokenFile)   { $TokenFile   = Join-Path $BENYUAN 'tokens_dao_123.txt' }

# 7 征章序 (用于 -SpConfigDir 之 round-robin)
$SP_RING = @('bypass', 'override', 'prepend', 'append', 'dao', 'custom', 'usernote')

# ─ 上限守 ─
if ($Count -lt 1) { Write-Host "✗ -Count 须 >=1" -Fore Red; exit 1 }
if ($Count -gt 178) { Write-Host "✗ -Count 上限 178 (主公诏极)" -Fore Red; exit 1 }

# ─ 解 N 件之 spec ─
function Resolve-VmSpecs {
  $specs = @()

  # token 之源 (WAM 单账 或 token 池 N 账)
  $tokens = @()
  if ($WamMode -eq 'off') {
    if (-not (Test-Path $TokenFile)) {
      throw "TokenFile 不存: $TokenFile · 主公 -WamMode on 或备 $TokenFile"
    }
    $tokens = Get-Content $TokenFile | Where-Object { $_ -and $_ -notmatch '^\s*#' -and $_ -notmatch '^\s*$' }
    if ($tokens.Count -lt ($StartIdx + $Count)) {
      throw ("TokenFile 仅 {0} token · 不足主公 -Count {1} -StartIdx {2}" -f $tokens.Count, $Count, $StartIdx)
    }
  }

  # SP 之源解
  $spSource = ''
  if ($SpStrategy) {
    $spSource = "cli:strategy=$SpStrategy"
  } elseif ($SpConfig) {
    if (-not (Test-Path $SpConfig)) { throw "SpConfig 不存: $SpConfig" }
    $spSource = "cli:config=$(Split-Path $SpConfig -Leaf)"
  } elseif (Test-Path $SpConfigDir) {
    $spSource = "configdir:$(Split-Path $SpConfigDir -Leaf)"
  } else {
    $spSource = 'default:bypass'
  }

  for ($i = 0; $i -lt $Count; $i++) {
    $vmName = ("vm{0:D3}-{1}" -f ($StartIdx + $i), $SP_RING[$i % $SP_RING.Length])
    $spec = @{
      idx      = $i
      name     = $vmName
      tokenIdx = $StartIdx + $i
      token    = if ($WamMode -eq 'on') { '(wam-activeApiKey)' } else { $tokens[$StartIdx + $i] }
      spSource = $spSource
    }
    # SP 优先级: -SpStrategy > -SpConfig > -SpConfigDir/[i%7].sample.json
    if ($SpStrategy) {
      $spec.spStrategy = $SpStrategy
      $spec.spConfig = ''
    } elseif ($SpConfig) {
      $spec.spStrategy = ''
      $spec.spConfig = $SpConfig
    } elseif (Test-Path $SpConfigDir) {
      $ringName = $SP_RING[$i % $SP_RING.Length]
      $ringFile = Join-Path $SpConfigDir ("$ringName.sample.json")
      $spec.spStrategy = ''
      $spec.spConfig = if (Test-Path $ringFile) { $ringFile } else { '' }
      if (-not $spec.spConfig) { $spec.spStrategy = 'bypass' }
    } else {
      $spec.spStrategy = 'bypass'
      $spec.spConfig = ''
    }
    $specs += $spec
  }
  return ,$specs  # 强制返 array (PowerShell 单元素之坑)
}

function Show-Preview {
  Write-Host ''
  Write-Host ('═══ 印 125 · 任 N 并发 spawn · preview (Count={0}) ═══' -f $Count) -Fore Cyan
  Write-Host ''
  Write-Host ('  ACU 损估: ~{0} ACU (1/件 启动 + 真测时段)' -f $Count)
  Write-Host ('  时段:    ~10min 齐起 + 主公定真测时长')
  Write-Host ('  仓:      e:\道\道生一\一生二 · main (本地)')
  Write-Host ('  token 源: {0}' -f $(if ($WamMode -eq 'on') { 'WAM activeApiKey (单账 N 件)' } else { ("$TokenFile (StartIdx=$StartIdx)") }))
  Write-Host ''

  $specs = Resolve-VmSpecs
  Write-Host ('─ {0} 件 VM 之 spec ─' -f $specs.Count) -Fore Yellow
  $maxShow = [Math]::Min($specs.Count, 16)
  for ($i = 0; $i -lt $maxShow; $i++) {
    $vm = $specs[$i]
    $spDesc = if ($vm.spStrategy) { "SP=$($vm.spStrategy)" } else { "SP-config=$(Split-Path $vm.spConfig -Leaf)" }
    $tokenMask = if ($WamMode -eq 'on') { 'wam' } else { '...' + $vm.token.Substring([math]::Max(0, $vm.token.Length-6)) }
    Write-Host ("    [{0,3}] {1,-20} {2,-32} token={3}" -f $i, $vm.name, $spDesc, $tokenMask) -Fore Green
  }
  if ($specs.Count -gt $maxShow) {
    Write-Host ("    ... 余 {0} 件略 (-Count={1})" -f ($specs.Count - $maxShow), $Count) -Fore DarkGray
  }
  Write-Host ''

  Write-Host '─ 操作步 (per VM) ─' -Fore Yellow
  Write-Host '  1. node vm_omni.js --token <devin-session-token>  (真扣 1 ACU)'
  Write-Host '       · 调 wss://app.devin.ai/api/acp/live (真起 VM)'
  Write-Host '       · prompt 17.5K 字 (印 96 极简)'
  Write-Host '       · keepalive 25s 心跳'
  Write-Host '       · appendPool({name, url, ts, ...}) 至 vm_pool.json'
  Write-Host '  2. (-DeployProxy:$true) 等 VM 起后跑 vm_proxy_deploy --sp-config'
  Write-Host '       · 注入 7 SP 征 ENV 至 VM 之 .env'
  Write-Host '       · 起 dao_proxy + keeper.sh'
  Write-Host '       · 验 /port/7780/health'
  Write-Host ''

  Write-Host '─ 候主公一字 ─' -Fore Magenta
  Write-Host ('  .\spawn_N.ps1 -Count {0} -Action go       真起 (~{0} ACU · 不可逆)' -f $Count) -Fore Magenta
  Write-Host ''
  Write-Host '「为大于其细也 · 多易必多难 · 是以圣人犹难之 · 故终于无难」 ── 帛书印 63' -Fore DarkGray
  Write-Host ''
}

function Start-Spawn {
  Write-Host ''
  Write-Host ('═══ 印 125 · 任 N 并发 spawn · GO (Count={0}) ═══' -f $Count) -Fore Magenta
  Write-Host ''
  Write-Host ('⚠ 此操作真扣 ~{0} ACU · 主公真金真银不可逆' -f $Count) -Fore Red
  Write-Host ''

  if (-not (Test-Path $LOG_DIR)) { New-Item -Type Directory -Path $LOG_DIR -Force | Out-Null }
  if (-not (Test-Path $STATE))    { New-Item -Type Directory -Path $STATE    -Force | Out-Null }

  $omni = Join-Path $BENYUAN 'vm_omni.js'
  if (-not (Test-Path $omni)) { Write-Host ("✗ vm_omni.js 不存 at {0}" -f $BENYUAN) -Fore Red; return }

  $specs = Resolve-VmSpecs
  $jobs = @()
  $ts = Get-Date -Format 'yyyyMMdd_HHmmss'

  foreach ($vm in $specs) {
    $logFile = Join-Path $LOG_DIR ("{0}_{1}.log" -f $ts, $vm.name)
    $errFile = Join-Path $LOG_DIR ("{0}_{1}.err" -f $ts, $vm.name)
    $spDesc = if ($vm.spStrategy) { "SP=$($vm.spStrategy)" } else { "SP-config=$(Split-Path $vm.spConfig -Leaf)" }
    Write-Host ("─ 启 [{0,3}] {1} ({2}) ─" -f $vm.idx, $vm.name, $spDesc) -Fore Yellow
    Write-Host ("    log: {0}" -f $logFile) -Fore DarkGray

    $job = Start-Job -Name ("spawn_" + $vm.name) -ArgumentList $BENYUAN, $logFile, $errFile, $vm.token, $WamMode -ScriptBlock {
      param($cwd, $log, $err, $tok, $mode)
      Set-Location $cwd
      $args = @('vm_omni.js')
      if ($mode -eq 'off' -and $tok) { $args += @('--token', $tok) }
      $proc = Start-Process -FilePath 'node' -ArgumentList $args -NoNewWindow -PassThru -Wait `
        -RedirectStandardOutput $log -RedirectStandardError $err
      return @{ exitCode = $proc.ExitCode; logFile = $log; errFile = $err }
    }
    $jobs += @{ vm = $vm; job = $job }

    # stagger · 避并发 wss 风暴
    if ($vm.idx -lt ($specs.Count - 1) -and $StaggerSec -gt 0) {
      Start-Sleep -Seconds $StaggerSec
    }
  }

  Write-Host ''
  Write-Host ("✓ {0} 件 spawn 起 · 后台跑 · 主公可 .\spawn_N.ps1 -Action status 看" -f $Count) -Fore Green
  Write-Host ("✓ ~{0}min 后 .\spawn_N.ps1 -Action wait 等齐起" -f [Math]::Max(10, [Math]::Ceiling($Count * 0.5))) -Fore Green
  Write-Host ''
  Write-Host '「弱也者 · 道之用也 · 反也者 · 道之动也」 ── 帛书印 40' -Fore DarkGray
  Write-Host ''

  # 立 state.json
  $stateObj = @{
    ts = (Get-Date -Format 'o')
    count = $Count
    startIdx = $StartIdx
    wamMode = $WamMode
    spConfigDir = $SpConfigDir
    spConfig = $SpConfig
    spStrategy = $SpStrategy
    deployProxy = $DeployProxy
    jobs = $jobs | ForEach-Object {
      @{
        idx = $_.vm.idx
        name = $_.vm.name
        jobId = $_.job.Id
        spStrategy = $_.vm.spStrategy
        spConfig = $_.vm.spConfig
        tokenIdx = $_.vm.tokenIdx
      }
    }
  }
  $stateObj | ConvertTo-Json -Depth 5 | Set-Content -Path $STATE_FILE -Encoding UTF8
  Write-Host ("  状: {0}" -f $STATE_FILE) -Fore DarkGray
  if ($DeployProxy) {
    Write-Host ''
    Write-Host '  下一步 (VM 齐起后):' -Fore Cyan
    Write-Host '    .\spawn_N.ps1 -Action wait    # 等齐起 (~10min)' -Fore Cyan
    Write-Host '    .\spawn_N.ps1 -Action deploy  # 自动 vm_proxy_deploy 每件 (含 SP 注)' -Fore Cyan
  }
}

function Show-Status {
  Write-Host ''
  Write-Host '═══ 任 N spawn · status ═══' -Fore Cyan
  if (-not (Test-Path $STATE_FILE)) {
    Write-Host '  ⊘ 无 spawn_N_state.json (主公未执 -Action go)' -Fore Yellow
    return
  }
  $st = Get-Content $STATE_FILE -Raw | ConvertFrom-Json
  Write-Host ("  启时: {0}" -f $st.ts) -Fore Gray
  Write-Host ("  Count: {0}  StartIdx: {1}  WamMode: {2}" -f $st.count, $st.startIdx, $st.wamMode) -Fore Gray
  Write-Host ''
  foreach ($j in $st.jobs) {
    $job = Get-Job -Id $j.jobId -ErrorAction SilentlyContinue
    if ($job) {
      $color = switch ($job.State) { 'Completed' { 'Green' } 'Running' { 'Yellow' } 'Failed' { 'Red' } default { 'Gray' } }
      $spDesc = if ($j.spStrategy) { "SP=$($j.spStrategy)" } else { "SP-config=$(Split-Path $j.spConfig -Leaf)" }
      Write-Host ("    [{0,3}] {1,-20} {2,-32} [{3}]" -f $j.idx, $j.name, $spDesc, $job.State) -Fore $color
    } else {
      Write-Host ("    [{0,3}] {1,-20} [Job 不存]" -f $j.idx, $j.name) -Fore Red
    }
  }
  Write-Host ''
  $pool = Join-Path $STATE 'vm_pool.json'
  if (Test-Path $pool) {
    $p = Get-Content $pool -Raw | ConvertFrom-Json
    $cnt = if ($p -is [Array]) { $p.Count } else { 1 }
    Write-Host ("  vm_pool.json: {0} 件入" -f $cnt) -Fore Green
  } else {
    Write-Host '  vm_pool.json: 尚无 (VM 起中)' -Fore Yellow
  }
  Write-Host ''
}

function Wait-Spawn {
  Write-Host ''
  Write-Host '═══ 任 N spawn · wait 齐起 ═══' -Fore Cyan
  if (-not (Test-Path $STATE_FILE)) { Write-Host '  ⊘ 无 state' -Fore Yellow; return }
  $st = Get-Content $STATE_FILE -Raw | ConvertFrom-Json
  $jobIds = $st.jobs.jobId
  Write-Host ("  等 {0} 件齐..." -f $jobIds.Count) -Fore Yellow

  $jobs = $jobIds | ForEach-Object { Get-Job -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_ }
  if ($jobs.Count -eq 0) { Write-Host '  ⊘ 无活 jobs' -Fore Yellow; return }
  $timeoutSec = [Math]::Max(900, $st.count * 60)
  Wait-Job -Job $jobs -Timeout $timeoutSec | Out-Null

  Write-Host ''
  Write-Host '─ 齐起之真据 ─' -Fore Green
  foreach ($job in $jobs) {
    $result = Receive-Job -Job $job -ErrorAction SilentlyContinue
    $color = if ($job.State -eq 'Completed') { 'Green' } else { 'Red' }
    Write-Host ("    · {0,-30} [{1}] exitCode={2}" -f $job.Name, $job.State, $result.exitCode) -Fore $color
  }
  Write-Host ''
  Show-Status
}

function Stop-Spawn {
  Write-Host ''
  Write-Host '═══ 任 N spawn · stop (停 jobs · 但 VM 不可撤) ═══' -Fore Cyan
  if (-not (Test-Path $STATE_FILE)) { Write-Host '  ⊘ 无 state' -Fore Yellow; return }
  $st = Get-Content $STATE_FILE -Raw | ConvertFrom-Json
  foreach ($j in $st.jobs) {
    $job = Get-Job -Id $j.jobId -ErrorAction SilentlyContinue
    if ($job) {
      Stop-Job -Id $j.jobId -ErrorAction SilentlyContinue
      Remove-Job -Id $j.jobId -Force -ErrorAction SilentlyContinue
      Write-Host ("    · {0} 停" -f $j.name) -Fore Yellow
    }
  }
  Write-Host ''
  Write-Host '  ⚠ 已起之 VM 仍在跑 (ACU 仍扣) · 主公看 vm_pool 后再停 VM' -Fore Red
}

function Deploy-Proxies {
  Write-Host ''
  Write-Host '═══ 任 N spawn · deploy (per-VM SP 注入) ═══' -Fore Cyan
  if (-not (Test-Path $STATE_FILE)) { Write-Host '  ⊘ 无 state' -Fore Yellow; return }
  $st = Get-Content $STATE_FILE -Raw | ConvertFrom-Json

  $pool = Join-Path $STATE 'vm_pool.json'
  if (-not (Test-Path $pool)) { Write-Host '  ⊘ vm_pool.json 无 (VM 未齐起?)' -Fore Yellow; return }
  $poolArr = Get-Content $pool -Raw | ConvertFrom-Json
  if (-not ($poolArr -is [Array])) { $poolArr = @($poolArr) }
  Write-Host ("  vm_pool.json: {0} 件入" -f $poolArr.Count) -Fore Gray
  Write-Host ''

  # 默对 state 中之 N 件 · 自 pool 末尾 N 件 (最新的)
  $startPoolIdx = [Math]::Max(0, $poolArr.Count - $st.count)
  $deploySteps = @()
  foreach ($j in $st.jobs) {
    $poolIdx = $startPoolIdx + $j.idx
    if ($poolIdx -ge $poolArr.Count) {
      Write-Host ("    [{0,3}] {1} ⊘ pool 不足 (poolIdx={2}/{3})" -f $j.idx, $j.name, $poolIdx, $poolArr.Count) -Fore Yellow
      continue
    }
    $deployArgs = @('vm_proxy_deploy.js', '--idx', $poolIdx.ToString())
    if ($j.spConfig) {
      $deployArgs += @('--sp-config', $j.spConfig)
    } elseif ($j.spStrategy) {
      $deployArgs += @('--sp-strategy', $j.spStrategy)
    }
    $deploySteps += @{ idx = $j.idx; name = $j.name; poolIdx = $poolIdx; args = $deployArgs }
    $spDesc = if ($j.spConfig) { "config=$(Split-Path $j.spConfig -Leaf)" } else { "strategy=$($j.spStrategy)" }
    Write-Host ("    [{0,3}] {1} → vm_proxy_deploy --idx {2} ({3})" -f $j.idx, $j.name, $poolIdx, $spDesc) -Fore Cyan
  }

  if ($deploySteps.Count -eq 0) { Write-Host '  ⊘ 0 deploy 步' -Fore Yellow; return }

  Write-Host ''
  Write-Host '  执此 N deploy (串行 · 避 cf 风暴)...' -Fore Yellow
  Write-Host ''
  foreach ($step in $deploySteps) {
    Write-Host ('─ deploy ' + $step.name + ' ─') -Fore Yellow
    & node $step.args
    Write-Host ''
  }
}

# ─ main ─
switch ($Action) {
  'preview' { Show-Preview }
  'go'      { Start-Spawn }
  'status'  { Show-Status }
  'wait'    { Wait-Spawn }
  'stop'    { Stop-Spawn }
  'deploy'  { Deploy-Proxies }
  default   { Show-Preview }
}
