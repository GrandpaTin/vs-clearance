# Starts the VS Clearance web server (hidden) and publishes it with Tailscale Funnel on its own
# HTTPS port, so it never touches other apps mounted on port 443.
#   .\serve.ps1               start (or restart) the server and make sure Funnel is on
#   .\serve.ps1 -Private      tailnet-only (tailscale serve) instead of a public Funnel link
#   .\serve.ps1 -Register     also start it automatically at Windows logon
#   .\serve.ps1 -Stop         stop the server and remove the Funnel/serve mapping
param(
  [int]$Port = 5050,
  [int]$HttpsPort = 10000,
  [switch]$Private,
  [switch]$Register,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$web = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$ts = (Get-Command tailscale -ErrorAction SilentlyContinue).Source

function Stop-Server {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*server.mjs*" -and $_.CommandLine -like "*$web*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

if ($Stop) {
  Stop-Server
  if ($ts) { & $ts funnel --https=$HttpsPort off 2>$null; & $ts serve --https=$HttpsPort off 2>$null }
  Write-Host 'Stopped.'
  return
}

$dns = $null
if ($ts) { $dns = ((& $ts status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.') }
$public = if ($dns) { "https://${dns}:$HttpsPort" } else { "http://127.0.0.1:$Port" }

Stop-Server
$env:PORT = "$Port"; $env:PUBLIC_URL = $public
Start-Process -FilePath $node -ArgumentList "`"$web\server.mjs`"" -WorkingDirectory $web -WindowStyle Hidden
Start-Sleep -Seconds 1
try { Invoke-RestMethod "http://127.0.0.1:$Port/api/health" | Out-Null } catch { throw "Server did not start on port $Port." }

if ($ts) {
  if ($Private) { & $ts serve --bg --https=$HttpsPort "http://127.0.0.1:$Port" }
  else { & $ts funnel --bg --https=$HttpsPort "http://127.0.0.1:$Port" }
}

if ($Register) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`"$(if ($Private) { ' -Private' })"
  Register-ScheduledTask -TaskName 'VSClearanceWeb' -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Force | Out-Null
  Write-Host 'Registered logon task "VSClearanceWeb".'
}

Write-Host ''
Write-Host "Share this : $public/        (live deals + 'Get the app')"
Write-Host "Install    : $public/get/"
Write-Host "Pairing    : http://127.0.0.1:$Port/setup   (this PC only: links that let YOUR devices publish)"
