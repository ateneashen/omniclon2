param(
    [string]$Destination = "C:\AI\Klonin"
)

$src = "C:\AI\OmniClon2"
$dst = $Destination

if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst -Force | Out-Null
}

Write-Host "Packaging OmniClon 2 portable release to $dst ..."

# Core executable
Copy-Item -Path "$src\frontend\src-tauri\target\release\omniclon2.exe" -Destination "$dst\omniclon2.exe" -Force

# Launcher
Copy-Item -Path "$src\OmniClon2-Launcher.bat" -Destination "$dst\OmniClon2-Launcher.bat" -Force

# Backend (exclude dev caches)
robocopy "$src\backend" "$dst\backend" /MIR /XD __pycache__ generated temp_http_test temp_polish_test /XF *.pyc /R:2 /W:1 | Out-Null

# Data (models, config, voices, generations)
robocopy "$src\data" "$dst\data" /MIR /R:2 /W:1 | Out-Null

# QA scripts
robocopy "$src\scripts" "$dst\scripts" /MIR /R:2 /W:1 | Out-Null

Write-Host "Packaging complete."
Write-Host "Location: $dst"
Write-Host "Run: $dst\omniclon2.exe"
