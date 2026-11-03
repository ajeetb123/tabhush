# Edge-case test for the Windows helper (Q-71), run by .github/workflows/windows.yml on a real
# Windows runner: garbage input, unknown and empty commands, missing apps, a real Notepad window
# (listed, hidden and quit through the helper, with a non-ASCII file name), and the relaunch guard.

$ErrorActionPreference = "Stop"
$helper = Join-Path $PSScriptRoot "helper-win.ps1"
$failures = New-Object System.Collections.Generic.List[string]
function Check($name, $ok, $detail = "") {
  if ($ok) { Write-Host "ok   $name" } else { Write-Host "FAIL $name $detail"; $failures.Add($name) }
}

function Start-Helper($appArg) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo "powershell.exe", "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$helper`" $appArg"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
  return [System.Diagnostics.Process]::Start($psi)
}

$h = Start-Helper ""
$script:id = 0
function Ask($obj) {
  $script:id++
  $obj["id"] = $script:id
  $h.StandardInput.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
  $h.StandardInput.Flush()
  while ($true) {
    $line = $h.StandardOutput.ReadLine()
    if ($null -eq $line) { throw "helper exited" }
    if ($line -notmatch '\{') { continue }
    $r = $line.Substring($line.IndexOf('{')) | ConvertFrom-Json
    if ($r.id -eq $script:id) { return $r }
  }
}

# Garbage before a real command is skipped without a reply.
$h.StandardInput.WriteLine("this is not json")
$h.StandardInput.WriteLine("{`"id`": 999, `"cmd`":")
$r = Ask @{ cmd = "trust" }
Check "garbage lines are ignored" ($r.ok -and $r.trusted)

$r = Ask @{ cmd = "nonsense" }
Check "unknown command is an error reply" ((-not $r.ok) -and ($r.error -like "unknown command*"))

$r = Ask @{ cmd = "quit"; bundleId = "not-installed.exe" }
Check "quit a missing app" ($r.ok -and (-not $r.done))

$r = Ask @{ cmd = "hide"; bundleId = "not-installed.exe" }
Check "hide a missing app" ($r.ok -and (-not $r.done))

$r = Ask @{ cmd = "closeTabs"; bundleId = "chrome.exe"; urls = @() }
Check "closeTabs with no URLs" ($r.ok -and $r.closed -eq 0)

$r = Ask @{ cmd = "closeFrontTab"; bundleId = "chrome.exe"; title = "nothing" }
Check "closeFrontTab when that browser isn't in front" ($r.ok -and (-not $r.closed))

$r = Ask @{ cmd = "volume"; bundleId = "spotify.exe"; level = 30 }
Check "volume is unsupported, not an error" ($r.ok -and $null -eq $r.previous)

$r = Ask @{ cmd = "front" }
Check "front answers" $r.ok

# A real app: Notepad with a non-ASCII file name.
$file = Join-Path $env:TEMP "Résumé 测试.txt"
[System.IO.File]::WriteAllText($file, "hello", (New-Object System.Text.UTF8Encoding($false)))
$np = Start-Process notepad.exe -ArgumentList "`"$file`"" -PassThru
Start-Sleep -Seconds 4

$r = Ask @{ cmd = "apps" }
$names = @($r.apps | ForEach-Object { $_.bundleId })
Check "apps lists Notepad" ($names -contains "notepad.exe") ($names -join ",")
$npInfo = @($r.apps | Where-Object { $_.bundleId -eq "notepad.exe" })[0]
Check "apps gives Notepad's install path" ($npInfo -and $npInfo.path -like "*otepad*") "$($npInfo.path)"

$r = Ask @{ cmd = "front" }
if ($r.app -and $r.app.bundleId -eq "notepad.exe") {
  Check "non-ASCII window title survives" ($r.title -like "*测试*") $r.title
} else {
  Write-Host "skip non-ASCII title check (Notepad isn't in front on this runner: $($r.app.bundleId))"
}

$r = Ask @{ cmd = "hide"; bundleId = "notepad.exe" }
Check "hide Notepad" ($r.ok -and $r.done)

$r = Ask @{ cmd = "quit"; bundleId = "notepad.exe" }
Check "quit Notepad" ($r.ok -and $r.done)
Start-Sleep -Seconds 3
$r = Ask @{ cmd = "apps" }
$still = @($r.apps | Where-Object { $_.bundleId -eq "notepad.exe" }).Count
Check "Notepad is gone after quit" ($still -eq 0)
Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$h.StandardInput.Close()
Check "helper exits when the app closes its input" ($h.WaitForExit(5000))

# The relaunch guard: off = nothing; on = the app is started again when its input closes.
$marker = Join-Path $env:TEMP "tabhush-relaunch-marker.txt"
$probe = Join-Path $env:TEMP "tabhush-relaunch-probe.cmd"
Set-Content -Path $probe -Value "@echo relaunched> `"$marker`"" -Encoding ASCII
foreach ($case in @(@{ on = $false; expect = $false }, @{ on = $true; expect = $true })) {
  Remove-Item $marker -ErrorAction SilentlyContinue
  $g = Start-Helper "-App `"$probe`""
  $g.StandardInput.WriteLine((@{ id = 1; cmd = "relaunch"; on = $case.on } | ConvertTo-Json -Compress))
  $g.StandardInput.Flush()
  [void]$g.StandardOutput.ReadLine()
  $g.StandardInput.Close()
  [void]$g.WaitForExit(10000)
  # Starting the reopened app can take a while on a busy machine: wait up to 20 s for its marker.
  $deadline = (Get-Date).AddSeconds($(if ($case.expect) { 20 } else { 6 }))
  while ((Get-Date) -lt $deadline -and -not (Test-Path $marker)) { Start-Sleep -Milliseconds 250 }
  Check "relaunch guard on=$($case.on)" ((Test-Path $marker) -eq $case.expect)
}

if ($failures.Count -gt 0) { Write-Host "$($failures.Count) failed: $($failures -join '; ')"; exit 1 }
Write-Host "all Windows helper checks passed"
