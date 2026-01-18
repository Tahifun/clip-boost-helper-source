$ErrorActionPreference = "Stop"

Write-Host "=== CLiP-BOOsT Helfer-App: Windows-EXE bauen ===" -ForegroundColor Cyan

# In den Projektordner wechseln
Set-Location $PSScriptRoot

# 1) Node vorhanden?
try {
  $nodeV = (node -v)
  $npmV  = (npm -v)
  Write-Host "Node: $nodeV  |  npm: $npmV" -ForegroundColor Green
} catch {
  Write-Host "Node.js ist nicht installiert oder nicht im PATH." -ForegroundColor Red
  Write-Host "Installiere Node (LTS), dann erneut starten." -ForegroundColor Yellow
  exit 1
}

# 2) Dependencies installieren (sauber)
if (Test-Path "$PSScriptRoot\package-lock.json") {
  Write-Host "Installiere Abhaengigkeiten (npm ci)..." -ForegroundColor Cyan
  npm ci
} else {
  Write-Host "Installiere Abhaengigkeiten (npm install)..." -ForegroundColor Cyan
  npm install
}

# 3) EXE bauen
Write-Host "Baue Windows-EXE..." -ForegroundColor Cyan
npm run build:win

$exe = Join-Path $PSScriptRoot "dist\CLiP-BOOsT-Helper.exe"
if (Test-Path $exe) {
  Write-Host "FERTIG: $exe" -ForegroundColor Green
  Write-Host "Hinweis: Lege optional eine obs-agent.config.json neben die EXE (wird beim ersten Start auch automatisch erstellt)." -ForegroundColor Yellow
} else {
  Write-Host "Build scheinbar fehlgeschlagen: EXE nicht gefunden." -ForegroundColor Red
  exit 1
}
