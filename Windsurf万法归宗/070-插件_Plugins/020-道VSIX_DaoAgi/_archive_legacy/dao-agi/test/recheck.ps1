$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here '..')
$node = (Get-Command node -ErrorAction Stop).Source
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('dao-agi-recheck-' + [guid]::NewGuid().ToString('N'))

function Invoke-NodeStep {
    param([string[]]$NodeArgs)
    & $node @NodeArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

try {
    New-Item -ItemType Directory -Force (Join-Path $stage 'vendor\wam') | Out-Null
    New-Item -ItemType Directory -Force (Join-Path $stage 'test') | Out-Null
    Copy-Item -Recurse -Force (Join-Path $root 'vendor\wam\bundled-origin') (Join-Path $stage 'vendor\wam\bundled-origin')
    Copy-Item -Force (Join-Path $root 'ls-client.js') (Join-Path $stage 'ls-client.js')
    Copy-Item -Force (Join-Path $here '_141_synth_chat.js') (Join-Path $stage 'test\_141_synth_chat.js')
    Copy-Item -Force (Join-Path $here 'v17_78.spec.js') (Join-Path $stage 'test\v17_78.spec.js')

    Push-Location $stage
    try {
        Invoke-NodeStep @('--check', 'vendor\wam\bundled-origin\源.js')
        Invoke-NodeStep @('--check', 'vendor\wam\bundled-origin\source.js')
        Invoke-NodeStep @('--check', 'test\_141_synth_chat.js')
        Invoke-NodeStep @('test\_141_synth_chat.js')
        Invoke-NodeStep @('test\v17_78.spec.js')
    } finally {
        Pop-Location
    }
} finally {
    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
