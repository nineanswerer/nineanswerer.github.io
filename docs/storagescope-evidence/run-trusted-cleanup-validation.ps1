$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $workspace 'StorageScope/apps/desktop/src-tauri/target/debug/storagescope-desktop.exe'
$evidence = Join-Path $workspace 'cleanup-validation-results'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null

function Wait-Window($process) {
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $process.Refresh()
    if ($process.MainWindowHandle -ne 0) { return }
    if ($process.HasExited) { throw "Desktop process exited early: $($process.ExitCode)" }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Desktop window did not become ready.'
}
function Stop-TestWindow($process) {
  if ($null -eq $process -or $process.HasExited) { return }
  $process.CloseMainWindow() | Out-Null
  Start-Sleep -Seconds 2
  $process.Refresh()
  if (-not $process.HasExited) { $process.Kill() }
}

python (Join-Path $workspace 'make_cleanup_ui_fixture.py') | Out-Null
python (Join-Path $workspace 'make_cleanup_merge_fixture.py') | Out-Null
$trashFixture = Join-Path $workspace 'cleanup-ui-fixture'
$mergeFixture = Join-Path $workspace 'cleanup-merge-fixture'

$trashProcess = $null
try {
  $trashProcess = Start-Process -FilePath $exe -WorkingDirectory $workspace -PassThru
  Wait-Window $trashProcess
  $verifyTrash = [scriptblock]::Create([System.IO.File]::ReadAllText((Join-Path $workspace 'verify-trusted-cleanup-ui.ps1'), [System.Text.Encoding]::UTF8))
  & $verifyTrash -ProcessId $trashProcess.Id -FixturePath $trashFixture -DatabasePath (Join-Path $evidence 'trash-snapshots.db')
  & (Join-Path $workspace 'capture-window.ps1') -ProcessId $trashProcess.Id -OutputPath (Join-Path $evidence 'cleanup-result-diff.png') | Out-Null
} finally {
  Stop-TestWindow $trashProcess
}

$mergeProcess = $null
try {
  $mergeProcess = Start-Process -FilePath $exe -WorkingDirectory $workspace -PassThru
  Wait-Window $mergeProcess
  $verifyMerge = [scriptblock]::Create([System.IO.File]::ReadAllText((Join-Path $workspace 'verify-trusted-merge-ui.ps1'), [System.Text.Encoding]::UTF8))
  & $verifyMerge -ProcessId $mergeProcess.Id -FixturePath $mergeFixture -DatabasePath (Join-Path $evidence 'merge-snapshots.db')
  & (Join-Path $workspace 'capture-window.ps1') -ProcessId $mergeProcess.Id -OutputPath (Join-Path $evidence 'merge-result.png') | Out-Null
} finally {
  Stop-TestWindow $mergeProcess
}
Write-Output 'ALL DESKTOP VALIDATIONS PASSED'
