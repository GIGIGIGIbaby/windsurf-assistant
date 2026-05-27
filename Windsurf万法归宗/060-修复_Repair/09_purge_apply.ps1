# SEAL 264 - Persistence Purge v1 (Reversible)
# All user-visible strings are ASCII to dodge PS5.1 GBK source-encoding pitfalls.
# Comments may contain Chinese.

$ErrorActionPreference = 'Continue'
$ROOT  = 'E:\道\道生一\一生二\Windsurf万法归宗\060-修复_Repair'
$STAMP = Get-Date -Format 'yyyyMMdd_HHmmss'
$BAK   = Join-Path $ROOT ('_purge_backup\' + $STAMP)
New-Item -ItemType Directory -Force -Path $BAK | Out-Null
$LOG = Join-Path $BAK 'log.txt'

function L {
    param([string]$msg)
    $t = Get-Date -Format 'HH:mm:ss'
    $line = '[' + $t + '] ' + $msg
    Add-Content -Path $LOG -Value $line -Encoding utf8
    Write-Host $line
}

L '===== SEAL264 PURGE v1 ====='
L ('BackupDir: ' + $BAK)

# ---------- PHASE 1: Backup ----------
L ''
L '[Phase 1/3] Backing up current state...'

reg.exe export 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' "$BAK\HKCU_Run.reg" /y 2>&1 | Out-Null
L '  [reg] HKCU\Run exported'

reg.exe export 'HKLM\Software\Microsoft\Windows\CurrentVersion\Run' "$BAK\HKLM_Run.reg" /y 2>&1 | Out-Null
L '  [reg] HKLM\Run exported'

$startup_global = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
Copy-Item -Path "$startup_global\*" -Destination $BAK -Force -ErrorAction SilentlyContinue
L ('  [file] Startup folder copied to ' + $BAK)

$task_bak = Join-Path $BAK 'ScheduledTasks'
New-Item -ItemType Directory -Force -Path $task_bak | Out-Null
$ALL_TASKS = Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' }
foreach ($t in $ALL_TASKS) {
    $safeName = ($t.TaskPath + $t.TaskName) -replace '[\\\/:\*\?"<>\|]', '_'
    try {
        Export-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath |
            Out-File -FilePath "$task_bak\$safeName.xml" -Encoding utf8
    } catch { }
}
L ('  [task] Exported ' + $ALL_TASKS.Count + ' scheduled-task definitions')

Get-CimInstance Win32_StartupCommand |
    Select-Object Name, Command, Location, User |
    Export-Csv "$BAK\snapshot_startup_BEFORE.csv" -NoTypeInformation -Encoding utf8
$ALL_TASKS | Select-Object TaskName, TaskPath, State |
    Export-Csv "$BAK\snapshot_tasks_BEFORE.csv" -NoTypeInformation -Encoding utf8
L '  [snap] BEFORE snapshot saved'

# ---------- PHASE 2: Disable ----------
L ''
L '[Phase 2/3] Disabling (reversible Disable/Move, no deletion)...'

# 2.1 HKCU\Run values to remove
$disable_hkcu_run = @(
    'Docker Desktop',
    'electron.app.SakuraCat',
    'BingWallpaperDaemon',
    'ldremote',
    'Synapse3',
    'SunloginClient',
    'SOLIDWORKS 后台下载程序',
    'MicrosoftEdgeAutoLaunch_98769996E24836F99EC8617644423B4C',
    'MicrosoftEdgeAutoLaunch_0CA73620D0D44A3F8264FAA422A4FA31'
)
# 夸克网盘 contains Chinese, handle separately to avoid source-encoding issues
$disable_hkcu_run_extra = @('夸克网盘')

L '  --- HKCU\Run remove values ---'
foreach ($n in ($disable_hkcu_run + $disable_hkcu_run_extra)) {
    try {
        Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $n -ErrorAction Stop
        L ('    OK   ' + $n)
    } catch {
        L ('    --   ' + $n + ' [absent or already removed]')
    }
}

# 2.2 Startup folder lnk -> _disabled_<stamp>/
$startup_disabled = Join-Path $startup_global ('_disabled_' + $STAMP)
New-Item -ItemType Directory -Force -Path $startup_disabled | Out-Null
$move_startup = @(
    'dao-byok-autostart.lnk',
    'OpenHardwareMonitor.exe - 快捷方式.lnk',
    'OpenRGB.lnk'
)
L '  --- Startup folder move ---'
foreach ($f in $move_startup) {
    $src = Join-Path $startup_global $f
    if (Test-Path $src) {
        Move-Item -Path $src -Destination $startup_disabled -Force
        L ('    OK   ' + $f + ' -> _disabled_' + $STAMP + '\')
    } else {
        L ('    --   ' + $f + ' [not present]')
    }
}

# 2.3 Disable scheduled tasks
$disable_tasks = @(
    # === Updaters (zero side effects) ===
    @{ Path='\'; Name='AliProctectUpdate' },
    @{ Path='\'; Name='AMDAutoUpdate' },
    @{ Path='\'; Name='GigabyteSsdFirmwareUpdateTask' },
    @{ Path='\'; Name='CorelUpdateHelperTask-18853A63E874F5682D6C632E39406AB9' },
    @{ Path='\'; Name='NVIDIA App SelfUpdate_{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}' },
    @{ Path='\'; Name='MicrosoftEdgeUpdateTaskMachineCore{93568D27-C6A1-491C-9BB2-1F224F74FCB2}' },
    @{ Path='\'; Name='MicrosoftEdgeUpdateTaskMachineUA{AEAE116E-B240-400C-9660-F1BEFB9926D8}' },
    @{ Path='\'; Name='OneDrive Per-Machine Standalone Update Task' },
    @{ Path='\GoogleSystem\GoogleUpdater\'; Name='GoogleUpdaterTaskSystem149.0.7814.0{BFE41A0B-709F-4471-A384-F8884AEF7CA8}' },
    @{ Path='\QuarkUpdaterUser\QuarkUpdater\'; Name='QuarkUpdaterTaskUser1.0.0.21{34A068AE-C042-4ED2-B5D6-2312A93339A8}' },
    @{ Path='\Mozilla\'; Name='Firefox Background Update 308046B0AF4A39CB' },
    @{ Path='\Mozilla\'; Name='Firefox Background Update S-1-5-21-2762161139-2962422226-247775911-500 308046B0AF4A39CB' },
    @{ Path='\HP\HP Print Scan Doctor\'; Name='Printer Health Monitor' },
    @{ Path='\HP\HP Print Scan Doctor\'; Name='Printer Health Monitor Logon' },

    # === Heavy/unneeded auto-launch ===
    @{ Path='\'; Name='LaunchSW' },           # SolidWorks autostart
    @{ Path='\'; Name='GCC' },                # Gigabyte Control Center
    @{ Path='\'; Name='DockerDesktopStart' }, # Docker (dup with HKCU)
    @{ Path='\'; Name='OpenRGB_AutoStart' },
    @{ Path='\'; Name='SogouGuard' },         # Sogou guard (not the IME itself)
    @{ Path='\PixPin\'; Name='Autorun for Administrator' },

    # === Zombies / suspicious ===
    @{ Path='\'; Name='ZhouFinalPurge' },     # References C:\Users\zhou which is absent
    @{ Path='\'; Name='VortexNetworkFix' },   # Unknown source

    # === Windsurf-side distractions (keep ONLY DaoBackup-Watch) ===
    @{ Path='\'; Name='DaoStuckDetect-V7' },  # legacy duplicate of v9
    @{ Path='\'; Name='DaoStuckDetect-v9' },  # stuck detector
    @{ Path='\'; Name='DaoVMScan' }           # the node.EXE window in screenshot
)

L '  --- Scheduled tasks disable ---'
foreach ($t in $disable_tasks) {
    try {
        Disable-ScheduledTask -TaskName $t.Name -TaskPath $t.Path -ErrorAction Stop | Out-Null
        L ('    OK   ' + $t.Path + $t.Name)
    } catch {
        $em = $_.Exception.Message
        if ($em.Length -gt 100) { $em = $em.Substring(0,100) }
        L ('    --   ' + $t.Path + $t.Name + ' [' + $em + ']')
    }
}

# 2.4 Kill currently running distracting node processes
L '  --- Kill running distractor node processes ---'
$kill_pids = @()
$kill_pids += Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object {
        $_.CommandLine -match 'dao_supervisor_v7\.js' -or
        $_.CommandLine -match 'dao_stuck_v9\.js' -or
        $_.CommandLine -match '01-VM.*\\.*\.js'
    } |
    Select-Object -ExpandProperty ProcessId
$kill_pids = $kill_pids | Where-Object { $_ }
foreach ($procId in $kill_pids) {
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        L ('    KILL node pid=' + $procId)
    } catch {
        L ('    --   pid=' + $procId + ' [' + $_.Exception.Message + ']')
    }
}

# ---------- PHASE 3: Verify ----------
L ''
L '[Phase 3/3] Verifying...'

Get-CimInstance Win32_StartupCommand |
    Select-Object Name, Command, Location, User |
    Export-Csv "$BAK\snapshot_startup_AFTER.csv" -NoTypeInformation -Encoding utf8
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } |
    Select-Object TaskName, TaskPath, State |
    Export-Csv "$BAK\snapshot_tasks_AFTER.csv" -NoTypeInformation -Encoding utf8

$before_n    = (Import-Csv "$BAK\snapshot_startup_BEFORE.csv").Count
$after_n     = (Import-Csv "$BAK\snapshot_startup_AFTER.csv").Count
$task_before = (Import-Csv "$BAK\snapshot_tasks_BEFORE.csv" | Where-Object { $_.State -ne 'Disabled' }).Count
$task_after  = (Import-Csv "$BAK\snapshot_tasks_AFTER.csv"  | Where-Object { $_.State -ne 'Disabled' }).Count

L ''
L '===== VERDICT ====='
L ('Startup items:        ' + $before_n + ' -> ' + $after_n + '   delta=' + ($before_n - $after_n))
L ('Active tasks:         ' + $task_before + ' -> ' + $task_after + '   delta=' + ($task_before - $task_after))

$keep = Get-ScheduledTask -TaskName 'DaoBackup-Watch' -ErrorAction SilentlyContinue
if ($keep) {
    L ('[KEEP] DaoBackup-Watch state = ' + $keep.State + ' (should be Running)')
} else {
    L '[KEEP] DaoBackup-Watch NOT FOUND - manual check required!'
}

L ''
L 'Rollback:'
L ('  reg:    reg import "' + $BAK + '\HKCU_Run.reg"')
L '  tasks:  Enable-ScheduledTask -TaskName <name> -TaskPath <path>'
L ('  files:  Move-Item "' + $startup_disabled + '\*" "' + $startup_global + '"')
L ''
L ('Log: ' + $LOG)
