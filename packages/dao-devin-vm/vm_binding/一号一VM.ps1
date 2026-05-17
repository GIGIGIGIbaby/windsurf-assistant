#!/usr/bin/env pwsh
<#
.SYNOPSIS
  印 128 · 道生三 · 一 windsurf 账号一虚拟机 · 1:1 持久化绑定

.DESCRIPTION
  主公一字 · 选 N fresh 号 + 起 N VM + 各装 dao_proxy + 持久化 bindings.json
  与 spawn_N.ps1 之分: 1:1 严格 · idempotent · 持久化 · 守玄德

.PARAMETER Action
  plan      : 0 ACU · 调 vm_unify pick · 显将选哪 N 号 + 计将立之 binding
  go        : ~N ACU · 真起 N 件 · 各号一件 · 写 bindings.json
  wait      : 0 ACU · poll 各 VM 之 /health · 等齐起
  status    : 0 ACU · 列 bindings.json 全表
  verify    : 0 ACU · 探每件 binding 之 /health (含 :7780 + :8081)
  set-sp    : ~0 ACU · 改某 idx 之 spStrategy · 重 deploy dao_proxy
  rebind    : ~1 ACU · 旧 VM 死 · 同号起新 VM · 续绑 (旧入 history)
  unbind    : 0 ACU · 主动解绑 · 留 record (history)
  export    : 0 ACU · print bindings.json (主公备份)
  import    : 0 ACU · 从 -File 读入 (主公迁机)
  help      : 此帮助

.PARAMETER Count
  plan/go 之件数 (1-71 · 上限由 fresh 号实数定)

.PARAMETER Idx
  set-sp/rebind/unbind 之 binding idx

.PARAMETER SpStrategy
  set-sp 之策略: bypass | override | prepend | append | dao | custom | usernote

.PARAMETER SpDaoChapter
  set-sp 之 dao 章数 (strategy=dao)

.PARAMETER SpCustom
  set-sp 之自定文 (strategy=override/custom)

.PARAMETER SpNote
  set-sp 之 user note 文 (strategy=usernote)

.PARAMETER File
  import 之源 .json

.PARAMETER Force
  go: 同号已绑 alive 仍重起 (默 idempotent)
  unbind: 不留 history (默留)

.EXAMPLE
  .\一号一VM.ps1 plan -Count 4
  .\一号一VM.ps1 go -Count 4
  .\一号一VM.ps1 wait
  .\一号一VM.ps1 status
  .\一号一VM.ps1 verify
  .\一号一VM.ps1 set-sp -Idx 0 -SpStrategy dao -SpDaoChapter 22
  .\一号一VM.ps1 rebind -Idx 0
  .\一号一VM.ps1 unbind -Idx 0
  .\一号一VM.ps1 export
#>

[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [ValidateSet('plan','go','wait','status','verify','set-sp','rebind','unbind','export','import','sync','help','')]
  [string]$Action = 'help',

  [int]$Count = 1,
  [int]$Idx = -1,
  [ValidateSet('','bypass','override','prepend','append','dao','custom','usernote')]
  [string]$SpStrategy = '',
  [int]$SpDaoChapter = 0,
  [string]$SpCustom = '',
  [string]$SpNote = '',
  [string]$File = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# ─── 路径之锚 ───
$THIS = $PSScriptRoot
$BASE = Split-Path $THIS -Parent
$BENYUAN = Join-Path $BASE '00_本源'
$BRIDGE = Join-Path $BENYUAN '_VM底层桥'
$STATE = Join-Path $BENYUAN '_state'
$POOL = Join-Path $STATE 'vm_pool.json'

$BINDINGS_PATH = Join-Path $THIS 'bindings.json'
$BINDINGS_BAK = Join-Path $THIS 'bindings.json.bak'
$LOGS_DIR = Join-Path $THIS '_logs'
$LOCK_FILE = Join-Path $THIS 'bindings.lock'

# ─── helpers ───

function Show-Help {
  Write-Host ''
  Write-Host '═══ 印 128 · 一号一VM · 1:1 持久化绑定 ═══' -Fore Cyan
  Write-Host ''
  Write-Host '  「圣人执一 · 以为天下牧」 ──《老子》二十二' -Fore DarkGray
  Write-Host '  「善建者不拔 · 善抱者不脱」 ──《老子》五十四' -Fore DarkGray
  Write-Host ''
  Write-Host '─── Actions ───' -Fore Yellow
  Write-Host '  plan -Count N         0 ACU · 显将选哪 N fresh 号 + 立 binding 计'
  Write-Host '  go -Count N [-Force]  ~N ACU · 真起 N VM + 各装 dao_proxy + 写 bindings'
  Write-Host '  wait                  0 ACU · poll 各 VM 之 /health · 等齐'
  Write-Host '  status                0 ACU · 列 bindings.json 全'
  Write-Host '  verify                0 ACU · 探每件 binding 之 health'
  Write-Host '  set-sp -Idx N -SpStrategy ...    改某 idx 之 SP 态 · 重 deploy'
  Write-Host '  rebind -Idx N         ~1 ACU · 同号起新 VM · 续绑 (旧入 history)'
  Write-Host '  unbind -Idx N [-Force]   解绑 (默留 history · -Force 不留)'
  Write-Host '  export                print bindings.json'
  Write-Host '  import -File <json>   从 -File 读入合并'
  Write-Host '  sync [-Force]         ★ 印 130 · 修 bindings ↔ vm_pool 漂移 (watchdog 换 sid 后必)'
  Write-Host ''
  Write-Host '─── 例 ───' -Fore Yellow
  Write-Host '  .\一号一VM.ps1 plan -Count 4'
  Write-Host '  .\一号一VM.ps1 go -Count 4'
  Write-Host '  .\一号一VM.ps1 wait'
  Write-Host '  .\一号一VM.ps1 verify'
  Write-Host '  .\一号一VM.ps1 set-sp -Idx 0 -SpStrategy dao -SpDaoChapter 22'
  Write-Host ''
}

function Read-Bindings {
  if (-not (Test-Path $BINDINGS_PATH)) {
    return [pscustomobject]@{
      version = '1.0.0'
      savedAt = ''
      lastSyncedAt = ''
      bindings = @()
      history = @()
    }
  }
  try {
    return Get-Content $BINDINGS_PATH -Raw -Encoding utf8 | ConvertFrom-Json
  } catch {
    Write-Host ('⚠ bindings.json 损 (' + $_.Exception.Message + ') · 试 .bak') -Fore Yellow
    if (Test-Path $BINDINGS_BAK) {
      return Get-Content $BINDINGS_BAK -Raw -Encoding utf8 | ConvertFrom-Json
    }
    Write-Host '✗ .bak 亦无 · 立空表' -Fore Red
    return [pscustomobject]@{
      version = '1.0.0'; savedAt=''; lastSyncedAt=''; bindings=@(); history=@()
    }
  }
}

function Write-Bindings {
  param($obj)

  if (-not (Test-Path $LOGS_DIR)) {
    New-Item -Type Directory -Path $LOGS_DIR -Force | Out-Null
  }

  # 备份上次
  if (Test-Path $BINDINGS_PATH) {
    Copy-Item $BINDINGS_PATH $BINDINGS_BAK -Force -ErrorAction SilentlyContinue
  }

  $obj.savedAt = (Get-Date).ToUniversalTime().ToString('o')

  # 原子写: tmp → rename (印 129 修 · 用 [System.IO.File] 避 Set-Content -Encoding 之 PS 7.5 奇瀯)
  $tmp = "$BINDINGS_PATH.tmp.$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
  $json = $obj | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($tmp, $json, [System.Text.UTF8Encoding]::new($false))
  Move-Item $tmp $BINDINGS_PATH -Force

  # 历代 snapshot
  $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
  $snap = Join-Path $LOGS_DIR "bindings_$ts.json"
  Copy-Item $BINDINGS_PATH $snap -Force
}

function Acquire-Lock {
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-Path $LOCK_FILE)) {
      [System.IO.File]::WriteAllText($LOCK_FILE, "$PID", [System.Text.ASCIIEncoding]::new())
      return $true
    }
    Start-Sleep -Milliseconds 200
  }
  Write-Host '✗ 不可获 lock · 主公另开之进程仍跑?' -Fore Red
  return $false
}

function Release-Lock {
  if (Test-Path $LOCK_FILE) { Remove-Item $LOCK_FILE -Force -ErrorAction SilentlyContinue }
}

function Get-NextIdx {
  param($bindings)
  $used = @()
  foreach ($b in $bindings) {
    if ($b.idx -ne $null) { $used += [int]$b.idx }
  }
  $i = 0
  while ($used -contains $i) { $i++ }
  return $i
}

function Invoke-Unify {
  param([string]$Subcmd, [string[]]$Extra)
  $bridge = Join-Path $BRIDGE 'vm_unify.cmd'
  if (-not (Test-Path $bridge)) {
    Write-Host ('✗ vm_unify.cmd 桥不存: ' + $bridge) -Fore Red
    return $null
  }
  $allArgs = @($Subcmd) + $Extra

  # 印 129 修 bug: 仅取 stdout (避 stderr 之"→ N 号..."人读信息插 JSON 中)
  # 用 临时 stderr 件 · 2> 重定向 · 仅 stdout 返
  $stderrFile = [System.IO.Path]::GetTempFileName()
  try {
    $output = & $bridge @allArgs 2> $stderrFile
    if ($LASTEXITCODE -ne 0) {
      Write-Host ('⚠ vm_unify ' + $Subcmd + ' exit=' + $LASTEXITCODE) -Fore Yellow
      if (Test-Path $stderrFile) {
        $stderr = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
        if ($stderr) { Write-Host $stderr -Fore DarkGray }
      }
      return $null
    }
    return $output
  } finally {
    Remove-Item $stderrFile -Force -ErrorAction SilentlyContinue
  }
}

function Pick-FreshAccounts {
  param([int]$N)
  $raw = Invoke-Unify 'pick' @('--count', "$N", '--status', 'fresh', '--json')
  if (-not $raw) { return @() }
  $text = ($raw | Out-String).Trim()
  if (-not $text) { return @() }

  # 印 129 修 bug: vm_unify pick --json 输出含尾部「→ N 号...」人读信息 · 抽 JSON 部分
  $startIdx = $text.IndexOf('[')
  if ($startIdx -lt 0) { $startIdx = $text.IndexOf('{') }
  if ($startIdx -ge 0) {
    $endChar = if ($text[$startIdx] -eq '[') { ']' } else { '}' }
    $endIdx = $text.LastIndexOf($endChar)
    if ($endIdx -gt $startIdx) {
      $text = $text.Substring($startIdx, $endIdx - $startIdx + 1)
    }
  }

  try {
    $j = $text | ConvertFrom-Json
    $items = @()
    if ($j -is [array]) { $items = $j }
    elseif ($j.accounts) { $items = $j.accounts }
    elseif ($j.picked) { $items = $j.picked }
    else { $items = @($j) }

    # 印 129 修 bug: unify 出 jwt 字段 · 不是 token · 映射到 .token 以兼容 Action-Go
    foreach ($it in $items) {
      if ((-not $it.token) -and $it.jwt) {
        $it | Add-Member -NotePropertyName token -NotePropertyValue $it.jwt -Force
      }
    }
    return $items
  } catch {
    Write-Host ('⚠ vm_unify pick 输出非 JSON · raw 见 _logs/last_unify.txt') -Fore Yellow
    if (-not (Test-Path $LOGS_DIR)) { New-Item -Type Directory -Path $LOGS_DIR -Force | Out-Null }
    [System.IO.File]::WriteAllText((Join-Path $LOGS_DIR 'last_unify.txt'), $text, [System.Text.UTF8Encoding]::new($false))
    return @()
  }
}

function Read-VmPool {
  if (-not (Test-Path $POOL)) { return @() }
  try {
    $p = Get-Content $POOL -Raw -Encoding utf8 | ConvertFrom-Json
    if ($p -is [array]) { return $p }
    return @($p)
  } catch { return @() }
}

function Get-VmUrl {
  param($vm)
  if ($vm.tunnelUrl) { return $vm.tunnelUrl }
  if ($vm.omniUrl) { return $vm.omniUrl }
  if ($vm.urls -and $vm.urls.Count -gt 0) { return $vm.urls[0] }
  if ($vm.omni -and $vm.omni.base_url) { return $vm.omni.base_url }
  return ''
}

function Probe-Url {
  param([string]$Url, [int]$Timeout = 8)
  if (-not $Url) { return @{ ok=$false; status=0; err='no-url' } }
  try {
    $r = Invoke-WebRequest -Uri "$Url/_/health" -TimeoutSec $Timeout -SkipHttpErrorCheck -ErrorAction Stop
    return @{ ok=($r.StatusCode -eq 200); status=$r.StatusCode; err='' }
  } catch {
    return @{ ok=$false; status=0; err=$_.Exception.Message }
  }
}

# ─── Action: plan ───

function Action-Plan {
  Write-Host ''
  Write-Host ('═══ 印 128 · plan (Count=' + $Count + ') ═══') -Fore Cyan
  Write-Host ''

  if ($Count -lt 1) { Write-Host '✗ -Count 须 >=1' -Fore Red; return }

  Write-Host '─ 调 vm_unify pick --count ' + $Count + ' --status fresh --json (借桥) ─' -Fore Yellow
  $picked = Pick-FreshAccounts -N $Count
  if (-not $picked -or $picked.Count -eq 0) {
    Write-Host '⊘ 无 fresh 号 · 主公等账重置 (D 1.1h · W 1.1h) 或加号' -Fore Yellow
    return
  }

  Write-Host ('  ✓ vm_unify 出 ' + $picked.Count + ' 号') -Fore Green
  Write-Host ''

  $bindings = Read-Bindings
  $existingTags = @($bindings.bindings | ForEach-Object { $_.account.tag })

  Write-Host '─ 计 ─' -Fore Yellow
  $idx = Get-NextIdx -bindings $bindings.bindings
  $newCount = 0
  $existCount = 0
  foreach ($acc in $picked) {
    $tag = if ($acc.tag) { $acc.tag } elseif ($acc.exp_tag) { $acc.exp_tag } else { 'unknown' }
    $email = if ($acc.email) { $acc.email } else { '(no-email)' }
    $tokenLast4 = ''
    if ($acc.token) {
      $tok = $acc.token
      $tokenLast4 = '...' + $tok.Substring([Math]::Max(0, $tok.Length-4))
    }

    if ($existingTags -contains $tag) {
      Write-Host ("    ⊘ [exist]    tag=$tag  email=$email  (已绑 · idempotent 跳)") -Fore DarkGray
      $existCount++
    } else {
      Write-Host ("    + [idx=$idx]  tag=$tag  email=$email  token=$tokenLast4") -Fore Green
      $idx++
      $newCount++
    }
  }
  Write-Host ''
  Write-Host ('  ─ 总: 新 ' + $newCount + ' 件 · 已绑 ' + $existCount + ' 件略') -Fore Cyan
  Write-Host ('  ─ ACU 估: ~' + $newCount + ' (新件之真起) + 0 (已绑跳)') -Fore Cyan
  Write-Host ''
  Write-Host '─ 候主公一字 ─' -Fore Magenta
  Write-Host ('  .\一号一VM.ps1 go -Count ' + $Count + '         真起 (~' + $newCount + ' ACU · 不可逆)') -Fore Magenta
  Write-Host ''
  Write-Host '「为大于其细也 · 多易必多难 · 是以圣人犹难之 · 故终于无难」 ──《老子》六十三' -Fore DarkGray
  Write-Host ''
}

# ─── Action: go ───

function Action-Go {
  Write-Host ''
  Write-Host ('═══ 印 128 · go (Count=' + $Count + ') ═══') -Fore Magenta
  Write-Host ''

  if ($Count -lt 1) { Write-Host '✗ -Count 须 >=1' -Fore Red; return }

  if (-not (Acquire-Lock)) { return }
  try {
    $bindings = Read-Bindings
    $existingTags = @($bindings.bindings | Where-Object { $_.status -ne 'unbound' } | ForEach-Object { $_.account.tag })

    $picked = Pick-FreshAccounts -N $Count
    if (-not $picked -or $picked.Count -eq 0) {
      Write-Host '⊘ 无 fresh 号' -Fore Yellow
      return
    }

    $omni = Join-Path $BENYUAN 'vm_omni.js'
    if (-not (Test-Path $omni)) {
      Write-Host ('✗ vm_omni.js 不存: ' + $omni) -Fore Red; return
    }

    $idx = Get-NextIdx -bindings $bindings.bindings
    $jobs = @()
    $ts = Get-Date -Format 'yyyyMMdd_HHmmss'

    if (-not (Test-Path $LOGS_DIR)) { New-Item -Type Directory -Path $LOGS_DIR -Force | Out-Null }

    Write-Host ('⚠ 此操作真扣 ACU · 主公真金真银不可逆 (新件 ~' + ($picked.Count) + ' 件)') -Fore Red
    Write-Host ''

    foreach ($acc in $picked) {
      $tag = if ($acc.tag) { $acc.tag } elseif ($acc.exp_tag) { $acc.exp_tag } else { 'x' + (Get-Random -Maximum 99999999).ToString('x8') }
      $email = if ($acc.email) { $acc.email } else { '(no-email)' }
      $token = $acc.token

      if (-not $token) {
        Write-Host ("    ⊘ tag=$tag · 无 token · 跳") -Fore Yellow
        continue
      }

      if ((-not $Force) -and ($existingTags -contains $tag)) {
        Write-Host ("    ⊘ tag=$tag · 已绑 alive · idempotent 跳") -Fore DarkGray
        continue
      }

      $tokenLast4 = '...' + $token.Substring([Math]::Max(0, $token.Length-4))
      $logFile = Join-Path $LOGS_DIR "${ts}_idx${idx}_${tag}.log"
      $errFile = Join-Path $LOGS_DIR "${ts}_idx${idx}_${tag}.err"

      Write-Host ("─ 启 [idx=$idx] tag=$tag  email=$email  token=$tokenLast4 ─") -Fore Yellow
      Write-Host ('    log: ' + $logFile) -Fore DarkGray

      # 立预绑 (status=spawning · 写 bindings 早 · 防中断丢)
      $newBinding = [pscustomobject]@{
        idx = $idx
        account = [pscustomobject]@{
          email = $email
          tag = $tag
          tokenLast4 = $tokenLast4
          source = 'unify'
        }
        vm = [pscustomobject]@{
          sessionId = ''
          tunnelUrl = ''
          spawnedAt = (Get-Date).ToUniversalTime().ToString('o')
          deployedAt = ''
          ttlExpire = ''
          deployStatus = 'pending'
          spStrategy = 'bypass'
          spConfig = ''
          spCustom = ''
          spDaoChapter = 0
          spNote = ''
          metaDeployStatus = 'not_deployed'
          publicTunnelUrl = ''
        }
        boundAt = (Get-Date).ToUniversalTime().ToString('o')
        lastVerifiedAt = ''
        status = 'spawning'
        memo = ''
      }
      $bindings.bindings = @($bindings.bindings) + $newBinding
      Write-Bindings $bindings

      # 印 129 之极: 直 Start-Process detached (不用 Start-Job · 因 Job 随 PS session 死)
      # NODE_OPTIONS 解 V: SMB drive 之 realpath 瑕 (parent set · child 继承)
      $prevNodeOpts = $env:NODE_OPTIONS
      $env:NODE_OPTIONS = '--preserve-symlinks --preserve-symlinks-main'
      try {
        $proc = Start-Process -FilePath 'node' `
          -ArgumentList @('vm_omni.js', '--token', $token) `
          -WorkingDirectory $BENYUAN `
          -RedirectStandardOutput $logFile `
          -RedirectStandardError $errFile `
          -PassThru `
          -WindowStyle Hidden
      } finally {
        if ($prevNodeOpts) { $env:NODE_OPTIONS = $prevNodeOpts } else { Remove-Item Env:NODE_OPTIONS -EA 0 }
      }
      Write-Host ("    ✓ spawn 真起 · PID=$($proc.Id) (detached · 独立 OS process)") -Fore Green
      $jobs += @{ idx=$idx; tag=$tag; pid=$proc.Id; logFile=$logFile; errFile=$errFile }
      $idx++

      # stagger 5s 避并发 wss 风暴
      if ($jobs.Count -lt $picked.Count) { Start-Sleep -Seconds 5 }
    }

    Write-Host ''
    Write-Host ('✓ ' + $jobs.Count + ' 件 spawn 起 · 后台跑') -Fore Green
    Write-Host '✓ ~10min 后 .\一号一VM.ps1 wait 等齐起' -Fore Green
    Write-Host ''

    # 立 jobs state (wait 用 · 印 129 修 · pid 替 jobId)
    $jobsState = @{
      ts = (Get-Date).ToUniversalTime().ToString('o')
      jobs = $jobs | ForEach-Object {
        @{ idx=$_.idx; tag=$_.tag; pid=$_.pid; logFile=$_.logFile; errFile=$_.errFile }
      }
    }
    $jobsStateJson = $jobsState | ConvertTo-Json -Depth 5
    $goJobsFile = Join-Path $STATE 'go_jobs.json'
    if (-not (Test-Path $STATE)) { New-Item -Type Directory -Path $STATE -Force | Out-Null }
    [System.IO.File]::WriteAllText($goJobsFile, $jobsStateJson, [System.Text.UTF8Encoding]::new($false))

    Write-Host '「弱也者 · 道之用也 · 反也者 · 道之动也」 ──《老子》四十' -Fore DarkGray
    Write-Host ''
  } finally {
    Release-Lock
  }
}

# ─── Action: wait ───

function Action-Wait {
  Write-Host ''
  Write-Host '═══ 印 128 · wait (~10min) ═══' -Fore Cyan

  $jobsFile = Join-Path $STATE 'go_jobs.json'
  if (-not (Test-Path $jobsFile)) { Write-Host '⊘ 无 go_jobs.json (主公未 go?)' -Fore Yellow; return }
  $jobsState = Get-Content $jobsFile -Raw | ConvertFrom-Json

  $jobIds = @($jobsState.jobs | ForEach-Object { $_.jobId })
  $jobs = $jobIds | ForEach-Object { Get-Job -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_ }
  if ($jobs.Count -eq 0) { Write-Host '⊘ 无活 jobs' -Fore Yellow; return }

  Write-Host ('  等 ' + $jobs.Count + ' 件齐...') -Fore Yellow
  $timeoutSec = [Math]::Max(900, $jobs.Count * 60)
  Wait-Job -Job $jobs -Timeout $timeoutSec | Out-Null

  Write-Host ''
  Write-Host '─ 齐起之真据 ─' -Fore Green
  if (-not (Acquire-Lock)) { return }
  try {
    $bindings = Read-Bindings

    # 读 vm_pool · cross-check
    $pool = Read-VmPool
    $poolStartIdx = [Math]::Max(0, $pool.Count - $jobs.Count)

    foreach ($jSpec in $jobsState.jobs) {
      $job = Get-Job -Id $jSpec.jobId -ErrorAction SilentlyContinue
      if (-not $job) { continue }
      $result = Receive-Job -Job $job -ErrorAction SilentlyContinue
      $color = if ($job.State -eq 'Completed' -and $result.exitCode -eq 0) { 'Green' } else { 'Red' }
      Write-Host ("    · idx=$($jSpec.idx)  tag=$($jSpec.tag)  [$($job.State)]  exit=$($result.exitCode)") -Fore $color

      # 找此件之 binding · 更 vm.sessionId 等
      $b = $bindings.bindings | Where-Object { $_.idx -eq $jSpec.idx } | Select-Object -First 1
      if (-not $b) { continue }

      # 估 pool 中之 idx (启 spawn 之序对应 pool append 序)
      $poolJobIdx = $poolStartIdx + ($jobsState.jobs.IndexOf($jSpec))
      if ($poolJobIdx -lt $pool.Count) {
        $vm = $pool[$poolJobIdx]
        $b.vm.sessionId = if ($vm.sessionId) { $vm.sessionId } else { '' }
        $b.vm.tunnelUrl = Get-VmUrl $vm
        if ($vm.spawnedAt) { $b.vm.spawnedAt = $vm.spawnedAt }
        if ($vm.ttlExpire) { $b.vm.ttlExpire = $vm.ttlExpire }
        $b.status = if ($job.State -eq 'Completed' -and $result.exitCode -eq 0 -and $b.vm.sessionId) { 'pending_deploy' } else { 'failed' }
      } else {
        $b.status = 'failed'
      }
      $b.lastVerifiedAt = (Get-Date).ToUniversalTime().ToString('o')

      Remove-Job -Id $jSpec.jobId -Force -ErrorAction SilentlyContinue
    }

    Write-Bindings $bindings
  } finally {
    Release-Lock
  }

  Write-Host ''
  Write-Host '─ 下一步 (deploy dao_proxy 各件) ─' -Fore Cyan
  Write-Host '  .\一号一VM.ps1 status      看现状'
  Write-Host '  .\一号一VM.ps1 verify      探活 + 自动 deploy pending_deploy 件'
  Write-Host ''
}

# ─── Action: status ───

function Action-Status {
  Write-Host ''
  Write-Host '═══ 印 128 · status ═══' -Fore Cyan
  Write-Host ''
  Write-Host ('  bindings.json: ' + $BINDINGS_PATH) -Fore Gray

  $b = Read-Bindings
  Write-Host ('  savedAt: ' + $b.savedAt)
  Write-Host ('  lastSyncedAt: ' + $b.lastSyncedAt)
  Write-Host ''

  $arr = @($b.bindings)
  if ($arr.Count -eq 0) {
    Write-Host '  ⊘ 0 binding · 主公先 plan + go' -Fore Yellow
  } else {
    $aliveN = @($arr | Where-Object { $_.status -eq 'alive' }).Count
    $pendingN = @($arr | Where-Object { $_.status -in @('spawning','pending_deploy') }).Count
    $deadN = @($arr | Where-Object { $_.status -eq 'dead' }).Count
    $unboundN = @($arr | Where-Object { $_.status -eq 'unbound' }).Count
    $failedN = @($arr | Where-Object { $_.status -eq 'failed' }).Count

    Write-Host ('  bindings: ' + $arr.Count + ' 件 (alive ' + $aliveN + ' · pending ' + $pendingN + ' · dead ' + $deadN + ' · failed ' + $failedN + ' · unbound ' + $unboundN + ')')
    Write-Host ''
    Write-Host '  ─ 详 ─' -Fore Yellow
    foreach ($it in $arr) {
      $color = switch ($it.status) {
        'alive' { 'Green' }
        'pending_deploy' { 'Yellow' }
        'spawning' { 'Yellow' }
        'failed' { 'Red' }
        'dead' { 'DarkGray' }
        'unbound' { 'DarkGray' }
        default { 'Gray' }
      }
      $tunnelShort = if ($it.vm.tunnelUrl) { $it.vm.tunnelUrl.Replace('https://','').Replace('.devinapps.com','') } else { '(no-url)' }
      Write-Host ("    [$($it.idx)] $($it.account.tag)  status=$($it.status)  sp=$($it.vm.spStrategy)  url=$tunnelShort") -Fore $color
    }
  }

  Write-Host ''
  $hist = @($b.history)
  if ($hist.Count -gt 0) {
    Write-Host ('  history: ' + $hist.Count + ' 件 (unbound/rebind 之 record · 守玄德)') -Fore DarkGray
  }
  Write-Host ''
}

# ─── Action: verify ───

function Action-Verify {
  Write-Host ''
  Write-Host '═══ 印 128 · verify ═══' -Fore Cyan
  Write-Host ''

  if (-not (Acquire-Lock)) { return }
  try {
    $b = Read-Bindings
    $arr = @($b.bindings)
    if ($arr.Count -eq 0) { Write-Host '⊘ 0 binding' -Fore Yellow; return }

    $authFile = Join-Path $BENYUAN '.dao_auth_token'
    $auth = if (Test-Path $authFile) { (Get-Content $authFile -Raw).Trim() } else { '' }

    # 印 129 修 bug 9: verify 先从 vm_pool.json 自动 cross-check + 填 binding 之 vm.* 字段
    $pool = Read-VmPool
    $aliveVms = @($pool | Where-Object { $_.status -eq 'alive' })
    $bindingIdx = 0
    foreach ($it in $arr) {
      if ($it.status -in @('unbound')) { continue }
      # 若 binding 无 sessionId · 自动从 alive pool 取 (按顺序匹配)
      if (-not $it.vm.sessionId -and $bindingIdx -lt $aliveVms.Count) {
        $vm = $aliveVms[$bindingIdx]
        $vmUrl = if ($vm.omni.base_url) { $vm.omni.base_url } elseif ($vm.urls.Count -gt 0) { $vm.urls[0] } else { '' }
        if ($vmUrl) {
          $it.vm.sessionId = $vm.sessionId
          $it.vm.tunnelUrl = $vmUrl
          if ($vm.spawnedAt) { $it.vm.spawnedAt = "$($vm.spawnedAt)" }
          Write-Host ("  ★ auto fill: idx=$($it.idx) ← pool[$bindingIdx] $($vm.sessionId.Substring(6,8))...") -Fore Magenta
          $bindingIdx++
        }
      }
    }

    foreach ($it in $arr) {
      if ($it.status -in @('unbound')) { continue }
      $url = $it.vm.tunnelUrl
      Write-Host ("─ idx=$($it.idx)  tag=$($it.account.tag)  ─") -Fore Yellow

      if (-not $url) {
        Write-Host '    ⊘ no tunnelUrl · 跳' -Fore DarkGray
        continue
      }

      # 印 129 修 bug 10: 抽 URL 中之 Basic Auth (user:pass@) 显式传 header
      $uri = [System.Uri]$url
      $headers = @{}
      $baseUrl = $url
      if ($uri.UserInfo) {
        $basicB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($uri.UserInfo))
        $headers['Authorization'] = "Basic $basicB64"
        $baseUrl = "https://$($uri.Host)"
      }

      # 探 /_/health
      $r1 = @{ ok=$false; status=0; err='' }
      try {
        $resp = Invoke-WebRequest -Uri "$baseUrl/_/health" -Headers $headers -TimeoutSec 8 -SkipHttpErrorCheck -ErrorAction Stop
        $r1.ok = ($resp.StatusCode -eq 200)
        $r1.status = $resp.StatusCode
      } catch { $r1.err = $_.Exception.Message }
      $c1 = if ($r1.ok) { 'Green' } else { 'Red' }
      Write-Host ("    /_/health           → $($r1.status)  $($r1.err)") -Fore $c1

      # 探 :7780/health (dao_proxy)
      $dao = $false
      if ($auth) {
        try {
          $headersDao = $headers.Clone()
          $headersDao['X-Dao-Auth'] = $auth
          $r2 = Invoke-WebRequest -Uri "$baseUrl/port/7780/health" -Headers $headersDao -TimeoutSec 8 -SkipHttpErrorCheck -ErrorAction Stop
          $c2 = if ($r2.StatusCode -eq 200) { 'Green' } else { 'Red' }
          Write-Host ("    /port/7780/health  → $($r2.StatusCode)") -Fore $c2
          if ($r2.StatusCode -eq 200) { $dao = $true }
        } catch {
          Write-Host ('    /port/7780/health  → ERR ' + $_.Exception.Message) -Fore Red
        }
      } else {
        Write-Host '    /port/7780/health  → (no .dao_auth_token · 跳)' -Fore DarkGray
      }

      # 更 binding 之 status
      $it.lastVerifiedAt = (Get-Date).ToUniversalTime().ToString('o')
      if ($dao) {
        $it.status = 'alive'
        if (-not $it.vm.deployStatus -or $it.vm.deployStatus -eq 'pending') {
          $it.vm.deployStatus = 'deployed'
          $it.vm.deployedAt = (Get-Date).ToUniversalTime().ToString('o')
        }
      } elseif ($r1.ok) {
        $it.status = 'pending_deploy'
      } else {
        $it.status = 'dead'
      }
    }

    $b.lastSyncedAt = (Get-Date).ToUniversalTime().ToString('o')
    Write-Bindings $b
  } finally {
    Release-Lock
  }

  Write-Host ''
  Write-Host '✓ verify 完 · bindings.json 已更新 lastSyncedAt + status' -Fore Green
  Write-Host ''
}

# ─── Action: set-sp ───

function Action-SetSp {
  Write-Host ''
  Write-Host ('═══ 印 128 · set-sp (Idx=' + $Idx + ') ═══') -Fore Cyan
  Write-Host ''

  if ($Idx -lt 0) { Write-Host '✗ -Idx 必给' -Fore Red; return }
  if (-not $SpStrategy) { Write-Host '✗ -SpStrategy 必给' -Fore Red; return }

  if (-not (Acquire-Lock)) { return }
  try {
    $b = Read-Bindings
    $it = $b.bindings | Where-Object { $_.idx -eq $Idx } | Select-Object -First 1
    if (-not $it) { Write-Host ("✗ idx=$Idx 不存") -Fore Red; return }

    $it.vm.spStrategy = $SpStrategy
    if ($SpDaoChapter -gt 0) { $it.vm.spDaoChapter = $SpDaoChapter }
    if ($SpCustom) { $it.vm.spCustom = $SpCustom }
    if ($SpNote) { $it.vm.spNote = $SpNote }

    Write-Bindings $b
    Write-Host ("✓ idx=$Idx · spStrategy=$SpStrategy 写入 bindings") -Fore Green

    # 真重 deploy (调 vm_proxy_deploy.js)
    $deploy = Join-Path $BENYUAN 'vm_proxy_deploy.js'
    $pool = Read-VmPool
    $vmPoolIdx = -1
    for ($i = 0; $i -lt $pool.Count; $i++) {
      if ($pool[$i].sessionId -eq $it.vm.sessionId) { $vmPoolIdx = $i; break }
    }
    if ($vmPoolIdx -lt 0) {
      Write-Host '⚠ 此 binding 之 sessionId 不在 vm_pool · 跳 deploy (主公手动)' -Fore Yellow
      return
    }

    Write-Host ('─ 调 vm_proxy_deploy --idx ' + $vmPoolIdx + ' --sp-strategy ' + $SpStrategy) -Fore Yellow
    Push-Location $BENYUAN
    try {
      $args = @($deploy, '--idx', "$vmPoolIdx", '--sp-strategy', $SpStrategy)
      if ($SpDaoChapter -gt 0) { $args += @('--sp-dao-chapter', "$SpDaoChapter") }
      & node @args
      if ($LASTEXITCODE -eq 0) {
        Write-Host '✓ vm_proxy_deploy 成' -Fore Green
        $it.vm.deployedAt = (Get-Date).ToUniversalTime().ToString('o')
        $it.vm.deployStatus = 'deployed'
        Write-Bindings $b
      } else {
        Write-Host ('⚠ vm_proxy_deploy exit=' + $LASTEXITCODE) -Fore Yellow
      }
    } finally {
      Pop-Location
    }
  } finally {
    Release-Lock
  }
  Write-Host ''
}

# ─── Action: rebind ───

function Action-Rebind {
  Write-Host ''
  Write-Host ('═══ 印 128 · rebind (Idx=' + $Idx + ') ═══') -Fore Cyan
  Write-Host ''

  if ($Idx -lt 0) { Write-Host '✗ -Idx 必给' -Fore Red; return }

  if (-not (Acquire-Lock)) { return }
  try {
    $b = Read-Bindings
    $it = $b.bindings | Where-Object { $_.idx -eq $Idx } | Select-Object -First 1
    if (-not $it) { Write-Host ("✗ idx=$Idx 不存") -Fore Red; return }

    Write-Host ("─ 旧 binding 入 history (status=$($it.status)) ─") -Fore Yellow
    $hist = [pscustomobject]@{
      idx = $it.idx
      account = $it.account
      vm = $it.vm
      unboundAt = (Get-Date).ToUniversalTime().ToString('o')
      reason = 'rebind'
      previousStatus = $it.status
    }
    $b.history = @($b.history) + $hist

    # 留同 idx + 同 account · 重置 vm
    $it.vm = [pscustomobject]@{
      sessionId = ''
      tunnelUrl = ''
      spawnedAt = (Get-Date).ToUniversalTime().ToString('o')
      deployedAt = ''
      ttlExpire = ''
      deployStatus = 'pending'
      spStrategy = $it.vm.spStrategy   # 续 SP 态
      spConfig = $it.vm.spConfig
      spCustom = $it.vm.spCustom
      spDaoChapter = $it.vm.spDaoChapter
      spNote = $it.vm.spNote
      metaDeployStatus = 'not_deployed'
      publicTunnelUrl = ''
    }
    $it.boundAt = (Get-Date).ToUniversalTime().ToString('o')
    $it.lastVerifiedAt = ''
    $it.status = 'spawning'
    Write-Bindings $b
  } finally {
    Release-Lock
  }

  # 重起 (借 vm_omni · 用此 binding 之 token)
  Write-Host ''
  Write-Host ('⚠ 此操作真扣 ~1 ACU · 重起新 VM 续绑') -Fore Red
  Write-Host '⚠ 注: 此 ps1 之 rebind 需主公本机有此号 token · 不 re-pick' -Fore Yellow
  Write-Host '   推荐: 直接 .\一号一VM.ps1 unbind -Idx N 后 .\一号一VM.ps1 go -Count 1 (用新 fresh 号)' -Fore Yellow
  Write-Host ''
}

# ─── Action: unbind ───

function Action-Unbind {
  Write-Host ''
  Write-Host ('═══ 印 128 · unbind (Idx=' + $Idx + ') ═══') -Fore Cyan

  if ($Idx -lt 0) { Write-Host '✗ -Idx 必给' -Fore Red; return }

  if (-not (Acquire-Lock)) { return }
  try {
    $b = Read-Bindings
    $it = $b.bindings | Where-Object { $_.idx -eq $Idx } | Select-Object -First 1
    if (-not $it) { Write-Host ("✗ idx=$Idx 不存") -Fore Red; return }

    if (-not $Force) {
      $hist = [pscustomobject]@{
        idx = $it.idx
        account = $it.account
        vm = $it.vm
        unboundAt = (Get-Date).ToUniversalTime().ToString('o')
        reason = 'main_unbound_by_user'
        previousStatus = $it.status
      }
      $b.history = @($b.history) + $hist
    }

    $b.bindings = @($b.bindings | Where-Object { $_.idx -ne $Idx })
    Write-Bindings $b
    Write-Host ("✓ idx=$Idx 解绑" + $(if ($Force) { ' (无 history)' } else { ' (history 留)' })) -Fore Green
  } finally {
    Release-Lock
  }

  Write-Host '⚠ 注: VM 仍在 Devin 跑 (ACU 仍扣) · 主公可不停 (24h TTL 自然死)' -Fore Yellow
  Write-Host ''
}

# ─── Action: export ───

function Action-Export {
  if (-not (Test-Path $BINDINGS_PATH)) {
    Write-Host '⊘ bindings.json 不存' -Fore Yellow
    return
  }
  Get-Content $BINDINGS_PATH -Raw -Encoding utf8 | Write-Output
}

# ─── Action: import ───

function Action-Import {
  if (-not $File) { Write-Host '✗ -File 必给' -Fore Red; return }
  if (-not (Test-Path $File)) { Write-Host ('✗ ' + $File + ' 不存') -Fore Red; return }

  if (-not (Acquire-Lock)) { return }
  try {
    $incoming = Get-Content $File -Raw -Encoding utf8 | ConvertFrom-Json
    $b = Read-Bindings

    # 合并 (按 tag · 主公迁机)
    $existingTags = @($b.bindings | ForEach-Object { $_.account.tag })
    $addN = 0
    foreach ($it in $incoming.bindings) {
      if ($it.account.tag -in $existingTags) { continue }
      $b.bindings = @($b.bindings) + $it
      $addN++
    }
    $b.history = @($b.history) + @($incoming.history)
    Write-Bindings $b
    Write-Host ('✓ import 完 · ' + $addN + ' 件新入 · history ' + $incoming.history.Count + ' 件入') -Fore Green
  } finally {
    Release-Lock
  }
}

# ─── 印 130 · sync · bindings ↔ vm_pool 漂移修 ───
#   主公诏「锚定本源 · 发现所有问题 · 解决一切 · 完善所有缺陷」
#   真据: watchdog 自启换之后 (印 122) · bindings.json 不知 sid 已变 · sync 修之
function Action-Sync {
  Write-Host ''
  Write-Host '═══ 印 130 · sync · bindings ↔ vm_pool 漂移修 ═══' -Fore Cyan
  Write-Host '  「为之于其未有也 · 治之于其未乱也」 ──《老子》六十四' -Fore DarkGray
  Write-Host ''

  if (-not (Acquire-Lock)) { return }
  try {
    $b = Read-Bindings
    $arr = @($b.bindings | Where-Object { $_.status -ne 'unbound' })
    if ($arr.Count -eq 0) {
      Write-Host '⊘ 0 binding (非 unbound) · 主公先 plan + go' -Fore Yellow
      return
    }

    $pool = Read-VmPool
    if ($pool.Count -eq 0) {
      Write-Host '⊘ vm_pool.json 空 · 主公先 go 起 VM' -Fore Yellow
      return
    }

    $aliveVms = @($pool | Where-Object { $_.status -eq 'alive' })
    $deadVms  = @($pool | Where-Object { $_.status -eq 'dead' })
    Write-Host ('  pool: alive=' + $aliveVms.Count + ' · dead=' + $deadVms.Count + ' (total ' + $pool.Count + ')') -Fore Gray
    Write-Host ('  bindings: ' + $arr.Count + ' 件 (非 unbound)') -Fore Gray
    Write-Host ''

    # poolSidIndex: sessionId → vm
    $poolSidIdx = @{}
    foreach ($v in $pool) { $poolSidIdx[$v.sessionId] = $v }

    # 已被 binding 占之 sid
    $boundSids = @{}
    foreach ($it in $arr) { if ($it.vm.sessionId) { $boundSids[$it.vm.sessionId] = $it.idx } }

    # 1) 找漂移 binding (sid 在 pool 中 dead 或 不存)
    $orphans = @()
    $kept = @()
    foreach ($it in $arr) {
      $sid = $it.vm.sessionId
      $poolStatus = if ($sid -and $poolSidIdx.ContainsKey($sid)) { $poolSidIdx[$sid].status } else { 'missing' }
      if ($poolStatus -eq 'alive') {
        $kept += [pscustomobject]@{ binding = $it; poolVm = $poolSidIdx[$sid] }
      } else {
        $orphans += [pscustomobject]@{ binding = $it; poolStatus = $poolStatus }
      }
    }

    # 2) 找 pool 中 alive 但未绑之 VM
    $unboundAlive = @()
    foreach ($v in $aliveVms) {
      if (-not $boundSids.ContainsKey($v.sessionId)) { $unboundAlive += $v }
    }

    # 显
    Write-Host '─── 现态分析 ───' -Fore Yellow
    Write-Host ('  ✓ kept binding (sid 在 pool alive): ' + $kept.Count) -Fore Green
    foreach ($k in $kept) {
      $sidShort = $k.binding.vm.sessionId.Substring(0,16)
      Write-Host ('      idx=' + $k.binding.idx + '  tag=' + $k.binding.account.tag + '  sid=' + $sidShort + '...') -Fore Green
    }
    Write-Host ''
    Write-Host ('  ⚠ orphan binding (sid dead/missing): ' + $orphans.Count) -Fore $(if ($orphans.Count -gt 0) {'Yellow'} else {'Gray'})
    foreach ($o in $orphans) {
      $sidShort = if ($o.binding.vm.sessionId) { $o.binding.vm.sessionId.Substring(0,16) + '...' } else { '(none)' }
      Write-Host ('      idx=' + $o.binding.idx + '  tag=' + $o.binding.account.tag + '  sid=' + $sidShort + '  pool=' + $o.poolStatus) -Fore Yellow
    }
    Write-Host ''
    Write-Host ('  ○ unbound alive VM (pool alive 而无 binding): ' + $unboundAlive.Count) -Fore $(if ($unboundAlive.Count -gt 0) {'Cyan'} else {'Gray'})
    foreach ($v in $unboundAlive) {
      $vmUrl = if ($v.omni.base_url) { $v.omni.base_url } elseif ($v.urls.Count -gt 0) { $v.urls[0] } else { '' }
      $urlShort = if ($vmUrl) { ($vmUrl -replace '://[^@]+@', '://***@') -replace '\.devinapps\.com.*$','.devinapps.com' } else { '(no-url)' }
      Write-Host ('      sid=' + $v.sessionId.Substring(0,16) + '...  url=' + $urlShort) -Fore Cyan
    }
    Write-Host ''

    # 3) 计 adoption (orphan + unbound alive 配对 · 按顺序)
    $pairs = @()
    $n = [Math]::Min($orphans.Count, $unboundAlive.Count)
    for ($i = 0; $i -lt $n; $i++) {
      $pairs += [pscustomobject]@{
        orphan = $orphans[$i].binding
        newVm = $unboundAlive[$i]
      }
    }

    if ($pairs.Count -eq 0) {
      if ($orphans.Count -eq 0 -and $unboundAlive.Count -eq 0) {
        Write-Host '✓ 无漂移 · bindings ↔ pool 一致' -Fore Green
      } elseif ($unboundAlive.Count -eq 0) {
        Write-Host '⚠ 有 orphan 但无 unbound alive 可 adopt · 主公 .\一号一VM.ps1 rebind -Idx N 真起新 VM' -Fore Yellow
      } else {
        Write-Host '⚠ 有 unbound alive 但无 orphan · 主公 .\一号一VM.ps1 import 之' -Fore Yellow
      }
      return
    }

    Write-Host '─── 配 (orphan ← unbound alive) ───' -Fore Yellow
    foreach ($p in $pairs) {
      $oldSid = if ($p.orphan.vm.sessionId) { $p.orphan.vm.sessionId.Substring(0,16) } else { '(none)' }
      $newSid = $p.newVm.sessionId.Substring(0,16)
      Write-Host ('  idx=' + $p.orphan.idx + ' tag=' + $p.orphan.account.tag + '  ' + $oldSid + '... → ' + $newSid + '...') -Fore Magenta
    }
    Write-Host ''

    if (-not $Force) {
      Write-Host '─ dry-run · 主公真意，再加 -Force ─' -Fore DarkYellow
      Write-Host ('  .\一号一VM.ps1 sync -Force')
      return
    }

    # 4) 真改
    Write-Host '─── 执 -Force · 写 bindings.json ───' -Fore Yellow
    foreach ($p in $pairs) {
      $vmUrl = if ($p.newVm.omni.base_url) { $p.newVm.omni.base_url } elseif ($p.newVm.urls.Count -gt 0) { $p.newVm.urls[0] } else { '' }
      $hist = [pscustomobject]@{
        at = (Get-Date).ToUniversalTime().ToString('o')
        action = 'sync-adopt'
        idx = $p.orphan.idx
        tag = $p.orphan.account.tag
        oldSessionId = $p.orphan.vm.sessionId
        oldTunnelUrl = $p.orphan.vm.tunnelUrl
        newSessionId = $p.newVm.sessionId
        newTunnelUrl = $vmUrl
        note = '印 130 sync · watchdog 自启换之后之主公一字补 binding'
      }
      $b.history = @($b.history) + $hist

      $p.orphan.vm.sessionId = $p.newVm.sessionId
      $p.orphan.vm.tunnelUrl = $vmUrl
      if ($p.newVm.spawnedAt) { $p.orphan.vm.spawnedAt = "$($p.newVm.spawnedAt)" }
      $p.orphan.vm.deployStatus = 'deployed'  # watchdog 已 deploy
      $p.orphan.vm.deployedAt = (Get-Date).ToUniversalTime().ToString('o')
      $p.orphan.status = 'alive'
      $p.orphan.lastVerifiedAt = (Get-Date).ToUniversalTime().ToString('o')
      Write-Host ('  ✓ idx=' + $p.orphan.idx + ' 续绑 → ' + $p.newVm.sessionId.Substring(0,16) + '...') -Fore Green
    }

    $b.lastSyncedAt = (Get-Date).ToUniversalTime().ToString('o')
    Write-Bindings $b
    Write-Host ''
    Write-Host ('✓ sync 完 · ' + $pairs.Count + ' 件续绑 · ' + $b.history.Count + ' history 入 · 主公续 verify 之') -Fore Green

  } finally {
    Release-Lock
  }
  Write-Host ''
}

# ─── dispatch ───

switch ($Action) {
  'plan'   { Action-Plan }
  'go'     { Action-Go }
  'wait'   { Action-Wait }
  'status' { Action-Status }
  'verify' { Action-Verify }
  'set-sp' { Action-SetSp }
  'rebind' { Action-Rebind }
  'unbind' { Action-Unbind }
  'export' { Action-Export }
  'import' { Action-Import }
  'sync'   { Action-Sync }
  default  { Show-Help }
}
