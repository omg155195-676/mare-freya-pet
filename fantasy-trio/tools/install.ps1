# Copies the Fantasy Trio plugin and the three packs into Petween's data folder.
# Only copies files; it does not touch Petween's program, settings or other pets. Quit Petween first.
# (Not run by its author: written on Linux. Read it before running.)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$data = Join-Path $env:APPDATA 'com.petween.app'
if (-not (Test-Path $data)) { throw "Petween data folder not found: $data  (start Petween once first)" }
if (Get-Process -Name 'petween' -ErrorAction SilentlyContinue) { throw 'Petween is running. Quit it from the tray first.' }

New-Item -ItemType Directory -Force -Path (Join-Path $data 'plugins'), (Join-Path $data 'pets') | Out-Null
Copy-Item -Recurse -Force (Join-Path $root 'plugin\fantasy-trio') (Join-Path $data 'plugins')
foreach ($id in 'xiaomalei', 'fufu', 'freya') {
  Copy-Item -Recurse -Force (Join-Path $root "packs\$id") (Join-Path $data 'pets')
}
Write-Host "Installed to $data. Start Petween."
