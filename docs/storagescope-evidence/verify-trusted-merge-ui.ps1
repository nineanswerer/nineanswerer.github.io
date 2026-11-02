param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][string]$FixturePath,
  [Parameter(Mandatory=$true)][string]$DatabasePath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$script:root = $null
$descendants = [System.Windows.Automation.TreeScope]::Descendants

function Update-Root {
  $process = Get-Process -Id $ProcessId
  $process.Refresh()
  $script:root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
}
function Find-Control([string]$Name, [System.Windows.Automation.ControlType]$Type) {
  $condition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $Type)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name))
  )
  return $script:root.FindFirst($descendants, $condition)
}
function Require-Control([string]$Name, [System.Windows.Automation.ControlType]$Type, [int]$TimeoutSeconds = 20) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    Update-Root
    $element = Find-Control $Name $Type
    if ($null -ne $element) { return $element }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Control not found: $Name"
}
function Wait-TextLike([string]$Pattern) {
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    Update-Root
    $elements = $script:root.FindAll($descendants, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($element in $elements) {
      if ($element.Current.Name -like $Pattern) { return $element }
    }
    Start-Sleep -Milliseconds 300
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "Text not found: $Pattern"
}
function Invoke-Button([string]$Name) {
  $button = Require-Control $Name ([System.Windows.Automation.ControlType]::Button)
  $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  Start-Sleep -Milliseconds 400
}
function Set-Edit([string]$Name, [string]$Value) {
  $edit = Require-Control $Name ([System.Windows.Automation.ControlType]::Edit)
  $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($Value)
  Start-Sleep -Milliseconds 400
}
function Confirm-Dialog {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    Update-Root
    if ($null -ne (Find-Control '保存结果快照并比较' ([System.Windows.Automation.ControlType]::Button))) {
      Write-Output 'INFO: WebView completed confirmation without exposing a separate automation dialog.'
      return
    }
    $desktop = [System.Windows.Automation.AutomationElement]::RootElement
    foreach ($name in @('确定', 'OK', '是', 'Yes')) {
      $condition = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name))
      )
      $button = $desktop.FindFirst($descendants, $condition)
      if ($null -ne $button) {
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Start-Sleep -Milliseconds 500
        return
      }
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Confirmation dialog or execution result not found.'
}

Invoke-Button '01 扫描目录'
Set-Edit '目录路径' $FixturePath
Invoke-Button '03 快照与趋势'
Set-Edit '快照数据库路径' $DatabasePath
Invoke-Button '05 清理建议'
Invoke-Button '开始分析'
Require-Control '重复副本 1' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Set-Edit '保护目录相对路径' 'Packages'
Invoke-Button '添加参考目录'
Wait-TextLike '*当前保留 Packages/app.bin*' | Out-Null
Invoke-Button '合并全部重复组 · 副本 4.0 MB'
Confirm-Dialog
Require-Control '保存结果快照并比较' ([System.Windows.Automation.ControlType]::Button) -TimeoutSeconds 30 | Out-Null
Wait-TextLike '*空间合并完成：2 个副本，合并逻辑大小 4.0 MB；已核实释放 4.0 MB*' | Out-Null
Require-Control '全部 2' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Require-Control '大文件 1' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Require-Control '重复副本 0' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Write-Output 'PASS: Post-merge candidates and baselines are reconciled; merged copies do not reappear as big files.'

$paths = @('Packages/app.bin', 'Backups/app-copy.bin', 'Archive/app-old.bin')
$hashes = @()
foreach ($relative in $paths) {
  $absolute = Join-Path $FixturePath $relative
  if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { throw "Merged path missing: $relative" }
  $hashes += (Get-FileHash -LiteralPath $absolute -Algorithm SHA256).Hash
}
if (($hashes | Select-Object -Unique).Count -ne 1) { throw 'Merged paths no longer have identical content.' }
$links = @(& fsutil hardlink list (Join-Path $FixturePath 'Packages/app.bin') | Where-Object { $_ -and $_.Trim() })
if ($LASTEXITCODE -ne 0 -or $links.Count -lt 3) { throw "Expected at least three hard-link paths, got $($links.Count): $links" }
$backups = @(Get-ChildItem -LiteralPath $FixturePath -Recurse -Filter '*.ss-merge-bak')
if ($backups.Count -ne 0) { throw 'Merge backup files remain after successful execution.' }
Write-Output 'PASS: Three paths survive with identical content and one shared hard-link entity; 4.0 MB allocated space is verified.'
