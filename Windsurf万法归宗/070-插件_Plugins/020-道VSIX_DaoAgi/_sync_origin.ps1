$ErrorActionPreference = 'Stop'
$src  = 'e:\道\道生一\一生二\Windsurf万法归宗\070-插件_Plugins\020-道VSIX_DaoAgi\dao-agi\vendor\wam\bundled-origin'
$inst = 'C:\Users\Administrator\.windsurf\extensions\dao-agi.dao-agi-17.76.0\vendor\wam\bundled-origin'
$hot  = 'C:\Users\Administrator\.wam-hot\origin'

# 1. 源.js → source.js (vendor)
[System.IO.File]::Copy((Join-Path $src '源.js'), (Join-Path $src 'source.js'), $true)

# 2. vendor → installed-ext + hot-dir
foreach ($t in @($inst, $hot)) {
  foreach ($n in @('source.js', '源.js')) {
    [System.IO.File]::Copy((Join-Path $src $n), (Join-Path $t $n), $true)
  }
}

Write-Host 'sync OK · sizes:'
foreach ($t in @($src, $inst, $hot)) {
  $sz = (Get-Item -LiteralPath (Join-Path $t '源.js')).Length
  Write-Host ("  $t -> $sz B")
}
