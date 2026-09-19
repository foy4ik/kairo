# Runs cargo with a toolchain environment that works on machines without MSVC (GNU + WinLibs, ASCII target dir).
# Usage: scripts/cargo.ps1 <cargo args...>
$mingw = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.POSIX.MSVCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin"
if (Test-Path $mingw) { $env:Path = "$mingw;$env:Path" }
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = "C:\kairo-target" }
Set-Location (Join-Path $PSScriptRoot "..\src-tauri")
cargo @args
