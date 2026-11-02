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
  if ($null -eq $script:root) { throw 'Desktop window not found.' }
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

function Wait-TextLike([string]$Pattern, [int]$TimeoutSeconds = 20) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
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
  $patterns = $button.GetSupportedPatterns()
  if ($patterns -contains [System.Windows.Automation.InvokePattern]::Pattern) {
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
  } else {
    throw "Button has no invoke pattern: $Name"
  }
  Start-Sleep -Milliseconds 400
}

function Set-Edit([string]$Name, [string]$Value) {
  $edit = Require-Control $Name ([System.Windows.Automation.ControlType]::Edit)
  $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($Value)
  Start-Sleep -Milliseconds 400
}

function Toggle-Checkbox([string]$Name) {
  $checkbox = Require-Control $Name ([System.Windows.Automation.ControlType]::CheckBox)
  $checkbox.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle()
  Start-Sleep -Milliseconds 400
}

function Select-Radio([string]$Name) {
  $radio = Require-Control $Name ([System.Windows.Automation.ControlType]::RadioButton)
  $radio.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
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
foreach ($name in @('全部 9', '大文件 4', '缓存目录 4', '重复副本 1')) {
  Require-Control $name ([System.Windows.Automation.ControlType]::Button) | Out-Null
}
Write-Output 'PASS: Analysis still shows 9 items and saves a usable baseline.'

Toggle-Checkbox '选择大文件 Videos/large-render.mov'
Require-Control '移入回收站（1 项 · 5.0 MB）' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Select-Radio '保留 Packages/app.bin'
$groupCheckbox = $null
Update-Root
$checkboxes = $script:root.FindAll($descendants, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::CheckBox)))
foreach ($checkbox in $checkboxes) {
  if ($checkbox.Current.Name -like '选择重复组 * 的冗余副本') { $groupCheckbox = $checkbox; break }
}
if ($null -eq $groupCheckbox) { throw 'Duplicate group checkbox not found.' }
$groupCheckbox.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle()
Start-Sleep -Milliseconds 400
Require-Control '移入回收站（3 项 · 9.0 MB）' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Write-Output 'PASS: Big-file and duplicate selection totals remain correct.'

Set-Edit '保护目录相对路径' 'Backups'
Invoke-Button '添加参考目录'
Wait-TextLike '*当前保留 Backups/app-copy.bin*' | Out-Null
Require-Control '移入回收站（2 项 · 7.0 MB）' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Write-Output 'PASS: Reference directory becomes the duplicate keep anchor and leaves the execution selection.'

Set-Edit '保护目录相对路径' 'Videos'
Invoke-Button '添加参考目录'
$protectedBig = Require-Control '选择大文件 Videos/large-render.mov' ([System.Windows.Automation.ControlType]::CheckBox)
if ($protectedBig.Current.IsEnabled) { throw 'Reference-directory file is still selectable.' }
Require-Control '移入回收站（1 项 · 2.0 MB）' ([System.Windows.Automation.ControlType]::Button) | Out-Null
Set-Edit '保护目录相对路径' 'Downloads'
Invoke-Button '添加排除目录'
$excludedBig = Require-Control '选择大文件 Downloads/setup.exe' ([System.Windows.Automation.ControlType]::CheckBox)
if ($excludedBig.Current.IsEnabled) { throw 'Excluded file is still selectable.' }
Write-Output 'PASS: Reference and excluded paths are disabled and removed from selected totals.'

Invoke-Button '移除参考目录 Videos'
Toggle-Checkbox '选择大文件 Videos/large-render.mov'
Toggle-Checkbox '选择缓存目录 cache'
Require-Control '移入回收站（3 项 · 8.0 MB）' ([System.Windows.Automation.ControlType]::Button) | Out-Null
$lateFile = Join-Path $FixturePath 'cache/late-arrival.tmp'
[System.IO.File]::WriteAllText($lateFile, 'created after analysis; must survive')
Invoke-Button '移入回收站（3 项 · 8.0 MB）'
Confirm-Dialog
Require-Control '保存结果快照并比较' ([System.Windows.Automation.ControlType]::Button) -TimeoutSeconds 30 | Out-Null
Wait-TextLike '*已移入回收站 2 项，待清空 7.0 MB*' | Out-Null

if (Test-Path -LiteralPath $lateFile -PathType Leaf) { } else { throw 'Changed directory was not preserved.' }
if (-not (Test-Path -LiteralPath (Join-Path $FixturePath 'cache/today.tmp') -PathType Leaf)) { throw 'Changed cache directory was partially deleted.' }
if (Test-Path -LiteralPath (Join-Path $FixturePath 'Videos/large-render.mov')) { throw 'Selected big file was not moved to recycle bin.' }
if (Test-Path -LiteralPath (Join-Path $FixturePath 'Archive/app-old.bin')) { throw 'Selected duplicate was not moved to recycle bin.' }
foreach ($path in @('Backups/app-copy.bin', 'Packages/app.bin', 'Downloads/setup.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $FixturePath $path) -PathType Leaf)) { throw "Protected file missing: $path" }
}
Write-Output 'PASS: Changed cache is skipped intact; selected files move to recycle bin; protected files survive.'

Invoke-Button '保存结果快照并比较'
Require-Control '差异比较' ([System.Windows.Automation.ControlType]::Text) -TimeoutSeconds 30 | Out-Null
Wait-TextLike '*净变化*' | Out-Null
Write-Output 'PASS: Cleanup result saves a result snapshot and opens the baseline comparison.'
