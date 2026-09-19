# Runs the Tauri CLI with the toolchain environment used on this machine (GNU + WinLibs, ASCII paths).
# Usage: scripts/tauri.ps1 dev | build [args]
$mingw = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.MSVCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
if (Test-Path $mingw) { $env:Path = "$mingw;$env:Path" }
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = "C:\kairo-target" }
Set-Location (Join-Path $PSScriptRoot "..")
npx tauri $args
