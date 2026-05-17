#!/usr/bin/env pwsh
<#
.SYNOPSIS
  印 123 + 印 128 · 道生二之阴 + 道生三之桥 · 本地轻管 · 一笔便活

.DESCRIPTION
  本地端整合脚本 · 0 daemon · 0 端口 · 仅消费 VM 端真活 API
  「邻邦相望，鸡狗之声相闻，民至老死不相往来」

  印 128 加 6 借桥 actions · 调 ../00_本源/_VM底层桥/ 之 8 件 wrapper
  彻底利用 devin cloud 虚拟机一切之资 (印 124-127 之新功)

.PARAMETER Action
  ─ 印 123 之 8 actions ─
  probe       : 探每件 VM 之 /health (read-only · 0 副作用)
  status      : 看 vm_pool.json + watchdog 状 (read-only)
  logs        : 看 watchdog.log 之 tail 50 (read-only)
  spawn       : 起新 VM (1 ACU · ~10min · 调 vm_omni + vm_proxy_deploy)
  set-pat     : 注 GitHub PAT (启 35 模 BYOK · 调 vm_meta_deploy --restart)
  emit-env    : 写本地 .env.local (供主公 SDK 客端读)
  watchdog-bg : 起 watchdog 后台 daemon (5min poll · 自换死之 tunnel)
  watchdog-stop: 停 watchdog 后台

  ─ 印 128 之 6 借桥 actions (调 _VM底层桥/) ─
  unify-list       : 印 127 道一 · 71 号大同盟一表 (fresh/used/dead)
  overview         : 印 127 道四 · 一笔总观 10 节 (accounts/pool/...)
  doctor           : 印 126 三 · 健诊全件 (38+ 件 syntax + state)
  mesh-status      : 印 127 道三 · 跨 VM 联通态
  tunnel-up        : 印 125 反一 · 各 VM 暴公网 (cloudflared)
  anycast-publish  : 印 125 反五 · 池态推 N alive (主公任设备 GET)

  help        : 此帮助

.EXAMPLE
  .\一笔便活.ps1 -Action probe
  .\一笔便活.ps1 -Action status
  .\一笔便活.ps1 -Action set-pat -Pat 'ghp_xxxx'
  .\一笔便活.ps1 -Action emit-env
  .\一笔便活.ps1 -Action watchdog-bg
  .\一笔便活.ps1 -Action unify-list      # 印 128 · 借桥
  .\一笔便活.ps1 -Action overview        # 印 128 · 一笔总观
  .\一笔便活.ps1 -Action doctor          # 印 128 · 全件健诊
#>

[CmdletBinding()]
param(
  [Parameter(Position=0)]
  [ValidateSet(
    'probe','status','logs','spawn','set-pat','emit-env','watchdog-bg','watchdog-stop',
    'unify-list','overview','doctor','mesh-status','tunnel-up','anycast-publish',
    'help',''
  )]
  [string]$Action = 'help',

  [string]$Pat = '',
  [int]$LogsTail = 50,
  [string[]]$BridgeArgs = @(),  # 印 128 · 借桥额外参 (e.g. -BridgeArgs '--status','fresh')
  [switch]$All,
  [int]$VmIndex = -1
)

$ErrorActionPreference = 'Stop'
$BASE = Split-Path $PSScriptRoot -Parent
$BENYUAN = Join-Path $BASE '00_本源'
$BRIDGE = Join-Path $BENYUAN '_VM底层桥'    # 印 128 · 借桥
$GH = Join-Path $BASE '01_GH编排'
$STATE = Join-Path $BENYUAN '_state'
$POOL = Join-Path $STATE 'vm_pool.json'
$WATCHDOG_LOG = Join-Path $STATE 'watchdog.log'
$WATCHDOG_OUT = Join-Path $STATE 'watchdog.out'
$WATCHDOG_ERR = Join-Path $STATE 'watchdog.err'
$WATCHDOG_PID = Join-Path $STATE 'watchdog.pid'

function Read-Auth {
  $authFile = Join-Path $BENYUAN '.dao_auth_token'
  if (Test-Path $authFile) { return (Get-Content $authFile -Raw).Trim() }
  return ''
}
function Read-MetaAuth {
  $f = Join-Path $GH '.dao_meta_auth_token'
  if (Test-Path $f) { return (Get-Content $f -Raw).Trim() }
  return ''
}
function Read-Pool {
  if (Test-Path $POOL) {
    return (Get-Content $POOL -Raw | ConvertFrom-Json)
  }
  return @()
}

function Show-Help {
  Write-Host ''
  Write-Host '═══ 印 123 + 印 128 · 道生二之阴 + 道生三之桥 · 一笔便活 ═══' -Fore Cyan
  Write-Host ''
  Write-Host '  「邻邦相望 · 鸡狗之声相闻 · 民至老死不相往来」 ──《老子》八十' -Fore DarkGray
  Write-Host '  「圣人执一 · 以为天下牧」 ──《老子》二十二' -Fore DarkGray
  Write-Host ''
  Write-Host '─── 印 123 · 本地轻管 8 命 ───' -Fore Yellow
  Write-Host '  probe         探每件 VM 之 /health (read-only · 0 副作用)'
  Write-Host '  status        看 vm_pool.json + watchdog 状 (read-only)'
  Write-Host '  logs          看 watchdog.log 之 tail 50 (read-only)'
  Write-Host ''
  Write-Host '  spawn         起新 VM (1 ACU · ~10min)'
  Write-Host '  set-pat       注 GitHub PAT (启 35 模 BYOK)'
  Write-Host '  emit-env      写本地 .env.local (供主公 SDK 读)'
  Write-Host ''
  Write-Host '  watchdog-bg   起 watchdog 后台 daemon (5min poll · 自换)'
  Write-Host '  watchdog-stop 停 watchdog 后台'
  Write-Host ''
  Write-Host '─── 印 128 · 借桥 6 命 (调 ../00_本源/_VM底层桥/) ───' -Fore Yellow
  Write-Host '  unify-list       71 号大同盟一表 (印 127 道一 · vm_unify)'
  Write-Host '  overview         一笔总观 10 节 (印 127 道四 · vm_overview)'
  Write-Host '  doctor           健诊全件 38+ (印 126 · vm_doctor)'
  Write-Host '  mesh-status      跨 VM 联通态 (印 127 道三 · vm_mesh)'
  Write-Host '  tunnel-up        各 VM 暴公网 (印 125 反一 · vm_tunnel)'
  Write-Host '  anycast-publish  池态推 N alive (印 125 反五 · vm_anycast)'
  Write-Host ''
  Write-Host '─── 例 ───' -Fore Yellow
  Write-Host '  .\一笔便活.ps1 probe'
  Write-Host '  .\一笔便活.ps1 set-pat -Pat ''ghp_xxxx'''
  Write-Host '  .\一笔便活.ps1 emit-env'
  Write-Host '  .\一笔便活.ps1 watchdog-bg'
  Write-Host ''
  Write-Host '─── 印 125 · 任 N 并发 spawn (推) ───' -Fore Magenta
  Write-Host '  .\spawn_N.ps1 -Count 7 -Action go   # 7 件一一对一 7 SP 态'
  Write-Host '  .\spawn_N.ps1 -Action deploy        # 等齐起后自动 vm_proxy_deploy --sp-config'
  Write-Host ''
}

# 印 123 续修 · vm_pool.json schema 兼容
# 现有 schema: { urls: [...], omni: { base_url: ... } }
# 新 schema:  { tunnelUrl: ..., omniUrl: ... }
function Get-VmUrl {
  param($vm)
  if ($vm.tunnelUrl)         { return $vm.tunnelUrl }
  if ($vm.omniUrl)           { return $vm.omniUrl }
  if ($vm.urls -and $vm.urls.Count -gt 0) { return $vm.urls[0] }
  if ($vm.omni -and $vm.omni.base_url)    { return $vm.omni.base_url }
  return ''
}

# 印 130 · 抽 user:pass@ 为显式 Basic auth header (PS 7.5 不自动解 url 内 Basic)
function Split-VmUrl {
  param([string]$url)
  if ($url -match '^(https?://)([^:/@]+):([^@]+)@(.+)$') {
    return [pscustomobject]@{
      base = $matches[1] + $matches[4]
      auth = 'Basic ' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($matches[2] + ':' + $matches[3]))
    }
  }
  return [pscustomobject]@{ base = $url; auth = '' }
}

function Action-Probe {
  Write-Host ''
  Write-Host '═══ probe · 探每件 VM ═══' -Fore Cyan
  Write-Host ''
  $auth = Read-Auth
  $metaAuth = Read-MetaAuth
  $pool = Read-Pool
  if ($pool.Count -eq 0) {
    Write-Host '⊘ vm_pool.json 空 · 主公先 spawn' -Fore Yellow
    return
  }
  # 印 125 · -VmIndex 单选 · -All 全巡 · 默仅第 0 件 alive
  $aliveVms = @($pool | Where-Object { $_.status -ne 'dead' })
  if ($VmIndex -ge 0) {
    if ($VmIndex -ge $pool.Count) {
      Write-Host ("✗ -VmIndex {0} 出界 (pool {1} 件)" -f $VmIndex, $pool.Count) -Fore Red
      return
    }
    $aliveVms = @($pool[$VmIndex])
    Write-Host ("印 125 · 仅探 pool[{0}]" -f $VmIndex) -Fore Gray
  } elseif (-not $All) {
    $aliveVms = @($aliveVms | Select-Object -First 1)
    Write-Host '印 125 · 默仅第 0 件 alive · -All 巡全 · -VmIndex N 单选' -Fore DarkGray
  } else {
    Write-Host ("印 125 · -All · 巡全 {0} 件 alive" -f $aliveVms.Count) -Fore Gray
  }
  $aliveVms = @($aliveVms)
  if ($aliveVms.Count -eq 0) {
    Write-Host ('⊘ 池 {0} 件全 dead · 主公先 spawn' -f $pool.Count) -Fore Yellow
    Write-Host ''
    Write-Host '─── 死池详 (read-only) ───' -Fore DarkGray
    $i = 0
    foreach ($vm in $pool) {
      $url = Get-VmUrl $vm
      Write-Host ('  [{0}] {1} · dead since {2}' -f $i, $vm.sessionId, $vm.lastDeadAt) -Fore DarkGray
      if ($url) { Write-Host ('       ' + $url) -Fore DarkGray }
      $i++
    }
    return
  }
  $i = 0
  foreach ($vm in $aliveVms) {
    $url = Get-VmUrl $vm
    Write-Host ("[{0}] {1}" -f $i, $vm.sessionId) -Fore Gray
    Write-Host ("    tunnel: {0}" -f $url)
    Write-Host ("    status: {0}" -f $vm.status)

    if ($url) {
      # 印 130 · 抽 user:pass@ 为显式 Basic auth header (PS 7.5 修)
      $su = Split-VmUrl $url
      $hdrBase = @{}
      if ($su.auth) { $hdrBase['Authorization'] = $su.auth }
      # 探 /_/health (omni)
      try {
        $r1 = Invoke-WebRequest -Uri "$($su.base)/_/health" -Headers $hdrBase -TimeoutSec 8 -SkipHttpErrorCheck -ErrorAction Stop
        Write-Host ("    /_/health         → {0}" -f $r1.StatusCode) -Fore $(if ($r1.StatusCode -eq 200) {'Green'} else {'Red'})
      } catch {
        Write-Host ("    /_/health         → ERR " + $_.Exception.Message) -Fore Red
      }
      # 探 /port/7780/health (dao_proxy)
      if ($auth) {
        try {
          $hdrDao = @{} + $hdrBase
          $hdrDao['X-Dao-Auth'] = $auth
          $r2 = Invoke-WebRequest -Uri "$($su.base)/port/7780/health" -Headers $hdrDao -TimeoutSec 8 -SkipHttpErrorCheck -ErrorAction Stop
          Write-Host ("    /port/7780/health → {0}" -f $r2.StatusCode) -Fore $(if ($r2.StatusCode -eq 200) {'Green'} else {'Red'})
        } catch {
          Write-Host ("    /port/7780/health → ERR " + $_.Exception.Message) -Fore Red
        }
      }
      # 探 /port/8081/health (meta_router)
      if ($metaAuth) {
        try {
          $hdrMeta = @{} + $hdrBase
          $hdrMeta['X-Dao-Auth'] = $metaAuth
          $r3 = Invoke-WebRequest -Uri "$($su.base)/port/8081/health" -Headers $hdrMeta -TimeoutSec 8 -SkipHttpErrorCheck -ErrorAction Stop
          Write-Host ("    /port/8081/health → {0}" -f $r3.StatusCode) -Fore $(if ($r3.StatusCode -eq 200) {'Green'} else {'Red'})
        } catch {
          Write-Host ("    /port/8081/health → ERR " + $_.Exception.Message) -Fore Red
        }
      }
    }
    $i++
  }
  Write-Host ''
}

function Action-Status {
  Write-Host ''
  Write-Host '═══ status · vm_pool + watchdog ═══' -Fore Cyan
  Write-Host ''
  Write-Host ("BASE:    {0}" -f $BASE)
  Write-Host ("POOL:    {0}" -f $POOL)
  Write-Host ''
  $pool = Read-Pool
  if ($pool.Count -eq 0) {
    Write-Host '⊘ vm_pool 空' -Fore Yellow
  } else {
    $aliveCount = @($pool | Where-Object { $_.status -eq 'alive' }).Count
    $deadCount = @($pool | Where-Object { $_.status -eq 'dead' }).Count
    $otherCount = $pool.Count - $aliveCount - $deadCount
    Write-Host ("pool: {0} 件 (alive {1} · dead {2} · other {3})" -f $pool.Count, $aliveCount, $deadCount, $otherCount) -Fore $(if ($aliveCount -gt 0) {'Green'} else {'Yellow'})
    $pool | ForEach-Object {
      $color = if ($_.status -eq 'alive') { 'Green' } else { 'DarkGray' }
      Write-Host ("  · [{0}] {1}" -f $_.status, $_.sessionId) -Fore $color
    }
  }
  Write-Host ''
  if (Test-Path $WATCHDOG_PID) {
    $wpid = (Get-Content $WATCHDOG_PID -Raw).Trim()
    $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host ("watchdog: ALIVE (pid {0} · started {1})" -f $wpid, $proc.StartTime) -Fore Green
    } else {
      Write-Host ("watchdog: DEAD (pid {0} not found · stale .pid)" -f $wpid) -Fore Yellow
    }
  } else {
    Write-Host 'watchdog: 未起 (主公: -Action watchdog-bg)' -Fore DarkGray
  }
  Write-Host ''
  $auth = Read-Auth
  $metaAuth = Read-MetaAuth
  Write-Host ("auth (dao_proxy):    {0}" -f $(if ($auth) {'已配 ' + $auth.Substring(0,8) + '...'} else {'未配'}))
  Write-Host ("auth (meta_router):  {0}" -f $(if ($metaAuth) {'已配 ' + $metaAuth.Substring(0,8) + '...'} else {'未配'}))
  Write-Host ''
}

function Action-Logs {
  if (Test-Path $WATCHDOG_LOG) {
    Write-Host ''
    Write-Host ("═══ watchdog.log · tail {0} ═══" -f $LogsTail) -Fore Cyan
    Write-Host ''
    Get-Content $WATCHDOG_LOG -Tail $LogsTail
  } else {
    Write-Host '⊘ watchdog.log 不存 (watchdog 未起过)' -Fore Yellow
  }
}

function Action-Spawn {
  Write-Host ''
  Write-Host '═══ spawn · 起新 VM (1 ACU · ~10min) ═══' -Fore Cyan
  Write-Host ''
  if (-not (Test-Path "$BENYUAN\vm_omni.js")) {
    Write-Host "✗ vm_omni.js 不存 at $BENYUAN" -Fore Red
    return
  }
  Push-Location $BENYUAN
  try {
    Write-Host '─ step 1/2 · vm_omni · spawn Devin VM ─' -Fore Yellow
    node vm_omni.js
    if ($LASTEXITCODE -ne 0) {
      Write-Host '✗ vm_omni 失败' -Fore Red
      return
    }
    Write-Host ''
    Write-Host '─ step 2/2 · vm_proxy_deploy · 装 dao_proxy ─' -Fore Yellow
    node vm_proxy_deploy.js --idx 0
  } finally {
    Pop-Location
  }
  Write-Host ''
  Write-Host '✓ spawn 完 · 主公 -Action probe 验真活' -Fore Green
}

function Action-SetPat {
  if (-not $Pat) {
    Write-Host '✗ -Pat 缺 · 用法: .\一笔便活.ps1 set-pat -Pat ''ghp_xxxx''' -Fore Red
    return
  }
  Write-Host ''
  Write-Host '═══ set-pat · 注 GitHub PAT · 启 35 模 BYOK ═══' -Fore Cyan
  Write-Host ''
  $env:GITHUB_TOKEN = $Pat
  Push-Location $BENYUAN
  try {
    Write-Host '─ vm_meta_deploy --idx 0 --restart ─' -Fore Yellow
    node vm_meta_deploy.js --idx 0 --restart
  } finally {
    Pop-Location
  }
  Write-Host ''
  Write-Host '✓ set-pat 完 · /v1/models 应返 51 件 (16 dao + 35 github)' -Fore Green
}

function Action-EmitEnv {
  Write-Host ''
  Write-Host '═══ emit-env · 写本地 .env.local ═══' -Fore Cyan
  Write-Host ''
  $auth = Read-Auth
  $metaAuth = Read-MetaAuth
  $pool = Read-Pool
  $aliveVms = @($pool | Where-Object { $_.status -eq 'alive' })

  # 印 125 · -All / -VmIndex 选取
  $targets = @()
  if ($VmIndex -ge 0) {
    if ($VmIndex -lt $pool.Count) {
      $targets = @($pool[$VmIndex])
    } else {
      Write-Host ("✗ -VmIndex {0} 出界 (pool {1} 件)" -f $VmIndex, $pool.Count) -Fore Red
      return
    }
  } elseif ($All) {
    $targets = $aliveVms
  } else {
    $targets = @($aliveVms | Select-Object -First 1)
  }

  if ($targets.Count -eq 0) {
    Write-Host '⚠ vm_pool 中无 alive · 主公先 spawn 后再 emit-env' -Fore Yellow
    return
  }

  $envFile = Join-Path $PSScriptRoot '.env.local'
  $lines = @()
  $lines += '# 印 125 · 锚定本源 · 本地 client SDK 之 .env (主公 source 之即可)'
  $lines += ('# 生成时: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  $lines += ('# VM 件数: ' + $targets.Count)
  $lines += ''
  $lines += '# ─ auth · 三选一即可 (X-Dao-Auth 推 · cloudfront tunnel 兼容) ─'
  $lines += ("DAO_AUTH_TOKEN=" + $auth)
  $lines += ("DAO_META_AUTH_TOKEN=" + $metaAuth)
  $lines += ''

  if ($targets.Count -eq 1) {
    # 单 VM 模式 (兼容老 .env.local · DAO_VM_URL 单字段)
    $url = Get-VmUrl $targets[0]
    $lines += '# ─ VM URL (单件 · 默第 0 件 alive) ─'
    $lines += ("DAO_VM_URL=" + $url)
    $lines += ''
    $lines += '# ─ OpenAI SDK 之 base_url (单层 · :7780 · dao_proxy · 16 模) ─'
    $lines += ("OPENAI_API_BASE=" + $url + "/port/7780/v1")
    $lines += 'OPENAI_API_KEY=placeholder'
    $lines += ''
    $lines += '# ─ OpenAI SDK 之 base_url (双层 · :8081 · meta_router · 51 模) ─'
    $lines += ("META_API_BASE=" + $url + "/port/8081/v1")
    $lines += 'META_API_KEY=placeholder'
    $lines += ''
    $lines += '# ─ Anthropic SDK ─'
    $lines += ("ANTHROPIC_API_BASE=" + $url + "/port/8081")
    $lines += 'ANTHROPIC_API_KEY=placeholder'
    $lines += ''
    $lines += '# ─ default headers (主公 SDK 自加) ─'
    $lines += ('DAO_HEADER=''{"X-Dao-Auth":"' + $auth + '"}''')
    $lines += ('META_HEADER=''{"X-Dao-Auth":"' + $metaAuth + '"}''')
  } else {
    # 印 125 · 多 VM 模式 (DAO_VM_URL_0..N + DAO_VM_COUNT)
    $lines += ('# ─ 印 125 · 多 VM URL (DAO_VM_URL_0..' + ($targets.Count - 1) + ') ─')
    $lines += ("DAO_VM_COUNT=" + $targets.Count)
    for ($i = 0; $i -lt $targets.Count; $i++) {
      $url = Get-VmUrl $targets[$i]
      $sid = $targets[$i].sessionId
      if (-not $sid) { $sid = ('vm-' + $i) }
      $lines += ("DAO_VM_URL_{0}={1}    # {2}" -f $i, $url, $sid)
    }
    $lines += ''
    $lines += '# ─ 第 0 件 (兼容老 client · 默) ─'
    $firstUrl = Get-VmUrl $targets[0]
    $lines += ("DAO_VM_URL=" + $firstUrl)
    $lines += ("OPENAI_API_BASE=" + $firstUrl + "/port/7780/v1")
    $lines += 'OPENAI_API_KEY=placeholder'
    $lines += ("META_API_BASE=" + $firstUrl + "/port/8081/v1")
    $lines += 'META_API_KEY=placeholder'
    $lines += ''
    $lines += '# ─ 主公 client 分流之样 (印 125 · multi-VM router) ─'
    $lines += '# import os, random'
    $lines += '# N = int(os.environ["DAO_VM_COUNT"])'
    $lines += '# urls = [os.environ[f"DAO_VM_URL_{i}"].split("#")[0].strip() for i in range(N)]'
    $lines += '# client = OpenAI(base_url=f"{random.choice(urls)}/port/8081/v1", ...)'
  }

  Set-Content -LiteralPath $envFile -Value ($lines -join "`n") -Encoding utf8
  Write-Host ("✓ 已写: {0} ({1} 件 VM)" -f $envFile, $targets.Count) -Fore Green
  Write-Host ''
  Write-Host '─ 主公一字 source ─' -Fore Yellow
  Write-Host '  Get-Content .\.env.local | ForEach-Object { if ($_ -match ''^([^#=]+)=(.*)$'') { Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Split(''#'')[0].Trim() } }'
  Write-Host ''
}

function Action-WatchdogBg {
  Write-Host ''
  Write-Host '═══ watchdog-bg · 起后台 daemon ═══' -Fore Cyan
  Write-Host ''
  if (-not (Test-Path "$BENYUAN\vm_pool_watchdog.js")) {
    Write-Host '✗ vm_pool_watchdog.js 不存' -Fore Red
    return
  }
  if (Test-Path $WATCHDOG_PID) {
    $wpid = (Get-Content $WATCHDOG_PID -Raw).Trim()
    $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host ("⊘ watchdog 已活 · pid {0}" -f $wpid) -Fore Yellow
      return
    }
    Remove-Item $WATCHDOG_PID -Force
  }
  if (-not (Test-Path $STATE)) { New-Item -Path $STATE -ItemType Directory -Force | Out-Null }
  # 印 130 修 · NODE_OPTIONS 解 V: SMB drive 之 realpath 瑕 (印 129 诊 · child 继承 parent env)
  $prevNodeOpts = $env:NODE_OPTIONS
  $env:NODE_OPTIONS = '--preserve-symlinks --preserve-symlinks-main'
  try {
    $proc = Start-Process -WindowStyle Hidden -PassThru `
      -FilePath 'node' `
      -ArgumentList 'vm_pool_watchdog.js' `
      -WorkingDirectory $BENYUAN `
      -RedirectStandardOutput $WATCHDOG_OUT `
      -RedirectStandardError $WATCHDOG_ERR
  } finally {
    if ($prevNodeOpts) { $env:NODE_OPTIONS = $prevNodeOpts } else { Remove-Item Env:NODE_OPTIONS -EA 0 }
  }
  Set-Content -LiteralPath $WATCHDOG_PID -Value $proc.Id -Encoding ascii
  Write-Host ("✓ watchdog 起 · pid {0}" -f $proc.Id) -Fore Green
  Write-Host ("  log: {0}" -f $WATCHDOG_LOG)
  Write-Host ("  out: {0}" -f $WATCHDOG_OUT)
  Write-Host ("  err: {0}" -f $WATCHDOG_ERR)
  Write-Host ''
  Write-Host '─ 主公一字停 ─' -Fore Yellow
  Write-Host '  .\一笔便活.ps1 watchdog-stop'
  Write-Host ''
}

function Action-WatchdogStop {
  Write-Host ''
  Write-Host '═══ watchdog-stop ═══' -Fore Cyan
  Write-Host ''
  if (-not (Test-Path $WATCHDOG_PID)) {
    Write-Host '⊘ watchdog 未起' -Fore Yellow
    return
  }
  $wpid = (Get-Content $WATCHDOG_PID -Raw).Trim()
  $proc = Get-Process -Id $wpid -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $wpid -Force
    Write-Host ("✓ watchdog 停 · pid {0}" -f $wpid) -Fore Green
  } else {
    Write-Host ("⊘ pid {0} 不存 · 清 stale .pid" -f $wpid) -Fore Yellow
  }
  Remove-Item $WATCHDOG_PID -Force
  Write-Host ''
}

# ─── 印 128 · 借桥 helpers ───

function Invoke-Bridge {
  param([string]$BridgeName, [string[]]$Extra)
  $cmd = Join-Path $BRIDGE "$BridgeName.cmd"
  if (-not (Test-Path $cmd)) {
    Write-Host ("✗ 桥不存: $cmd") -Fore Red
    Write-Host ("   主公确 ../00_本源/_VM底层桥/ 之 8 件 wrapper 已立 (印 128)") -Fore DarkGray
    return
  }
  & $cmd @Extra
}

function Action-UnifyList {
  Write-Host ''
  Write-Host '═══ 印 128 · unify-list (印 127 借桥) ═══' -Fore Cyan
  Write-Host '  「圣人执一 · 以为天下牧」 ──《老子》二十二' -Fore DarkGray
  Write-Host ''
  $extra = @('list') + $BridgeArgs
  Invoke-Bridge 'vm_unify' $extra
}

function Action-Overview {
  Write-Host ''
  Write-Host '═══ 印 128 · overview (印 127 借桥) ═══' -Fore Cyan
  Write-Host '  「万物归焉而弗为主」 ──《老子》三十四' -Fore DarkGray
  Write-Host ''
  Invoke-Bridge 'vm_overview' $BridgeArgs
}

function Action-Doctor {
  Write-Host ''
  Write-Host '═══ 印 128 · doctor (印 126 借桥) ═══' -Fore Cyan
  Write-Host '  「不知不知 · 病矣 · 圣人之不病 · 以其病病也」 ──《老子》七十一' -Fore DarkGray
  Write-Host ''
  Invoke-Bridge 'vm_doctor' $BridgeArgs
}

function Action-MeshStatus {
  Write-Host ''
  Write-Host '═══ 印 128 · mesh-status (印 127 借桥) ═══' -Fore Cyan
  Write-Host '  「邻邦相望 · 鸡狗之声相闻」 ──《老子》八十' -Fore DarkGray
  Write-Host ''
  $extra = @('status') + $BridgeArgs
  Invoke-Bridge 'vm_mesh' $extra
}

function Action-TunnelUp {
  Write-Host ''
  Write-Host '═══ 印 128 · tunnel-up (印 125 借桥) ═══' -Fore Cyan
  Write-Host '  「反者道之动 · 弱者道之用」 ──《老子》四十' -Fore DarkGray
  Write-Host ''
  Write-Host '  各 alive VM 暴 cloudflared 公网 URL · Devin 宕亦活' -Fore DarkGray
  Write-Host ''
  $extra = @('up','--all') + $BridgeArgs
  Invoke-Bridge 'vm_tunnel' $extra
}

function Action-AnycastPublish {
  Write-Host ''
  Write-Host '═══ 印 128 · anycast-publish (印 125 借桥) ═══' -Fore Cyan
  Write-Host '  「江海所以能为百谷王者 · 以其善下之」 ──《老子》六十六' -Fore DarkGray
  Write-Host ''
  Write-Host '  推池态至 N alive · 主公任设备 GET 即得全池真态' -Fore DarkGray
  Write-Host ''
  $extra = @('publish') + $BridgeArgs
  Invoke-Bridge 'vm_anycast' $extra
}

# ─── dispatch ───
switch ($Action) {
  # 印 123 之 8 命
  'probe'           { Action-Probe }
  'status'          { Action-Status }
  'logs'            { Action-Logs }
  'spawn'           { Action-Spawn }
  'set-pat'         { Action-SetPat }
  'emit-env'        { Action-EmitEnv }
  'watchdog-bg'     { Action-WatchdogBg }
  'watchdog-stop'   { Action-WatchdogStop }
  # 印 128 之 6 借桥命
  'unify-list'      { Action-UnifyList }
  'overview'        { Action-Overview }
  'doctor'          { Action-Doctor }
  'mesh-status'     { Action-MeshStatus }
  'tunnel-up'       { Action-TunnelUp }
  'anycast-publish' { Action-AnycastPublish }
  default           { Show-Help }
}
