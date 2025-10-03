Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Section([string]$text) {
  Write-Host "==> $text" -ForegroundColor Cyan
}

# 切换到脚本所在目录
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Section "Check Node.js (v18+ required)"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js not detected. Please install: https://nodejs.org (v18+)"
  exit 1
}
Write-Host (node -v)

# Accept any Node >=18 now (no native deps)

Write-Section "Install dependencies"
npm install

Write-Section "Create data directory"
New-Item -ItemType Directory -Force -Path "data" | Out-Null

Write-Section "Generate .env (if missing)"
if (-not (Test-Path ".env")) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 32
  $rng.GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $lines = @(
    "PORT=3000",
    "SITE_NAME=MusicMark",
    "SESSION_SECRET=$secret",
    "DATA_DIR=./data",
    "DB_FILE=./data/app.db",
    "SESSIONS_DB=sessions.db",
    "ADMIN_USERNAME=admin",
    "ADMIN_PASSWORD=admin123"
  )
  Set-Content -Path ".env" -Value $lines -Encoding UTF8
  Write-Host "Created .env"
} else {
  Write-Host ".env exists, skip"
}

Write-Section "Start dev server (Ctrl+C to exit)"
npm run dev


