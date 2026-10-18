$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path "$scriptDir\.."
Set-Location $projectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [STARTING] Industrial AI Quality Inspection Worker... " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check Checkpoint
$checkpoint = "$projectRoot\ml\quality\models\food_box_patchcore.ckpt"
if (-not (Test-Path $checkpoint)) {
    Write-Host "[ERROR] PatchCore checkpoint not found at: $checkpoint" -ForegroundColor Red
    exit 1
}

# 2. Check cloudflared
$cloudflared = "$projectRoot\scripts\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
    Write-Host "[ERROR] cloudflared.exe not found at: $cloudflared" -ForegroundColor Red
    exit 1
}

$port = 8008
$env:QUALITY_WORKER_MODE = "1"

# Kill any previous process on port 8008
$occupied = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($occupied) {
    Write-Host "[WARN] Port $port is in use, terminating old process..." -ForegroundColor Yellow
    Stop-Process -Id $occupied.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 3. Start Uvicorn Server
Write-Host "[INFO] Starting local PatchCore model server on http://127.0.0.1:$port..." -ForegroundColor Yellow
$serverProcess = Start-Process python -ArgumentList "-m uvicorn ml.app.api:app --host 127.0.0.1 --port $port" -PassThru -NoNewWindow

# Wait for server to respond
$serverReady = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/quality/health" -TimeoutSec 2 -ErrorAction Stop
        if ($res.model_available) {
            $serverReady = $true
            break
        }
    } catch {}
}

if (-not $serverReady) {
    Write-Host "[ERROR] Server failed to initialize PatchCore model." -ForegroundColor Red
    if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
    exit 1
}

Write-Host "[SUCCESS] Model server is ready with PatchCore checkpoint!" -ForegroundColor Green

# 4. Start Cloudflare Tunnel
Write-Host "[INFO] Creating secure public tunnel (Cloudflare)..." -ForegroundColor Yellow
$logFile = "$env:TEMP\cf_tunnel_output.log"
if (Test-Path $logFile) { Remove-Item $logFile -Force }

$tunnelProcess = Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url http://127.0.0.1:$port" -RedirectStandardError $logFile -PassThru -NoNewWindow

$tunnelUrl = ""
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $logFile) {
        $content = Get-Content $logFile -Raw
        if ($content -match '(https://[a-zA-Z0-9-]+\.trycloudflare\.com)') {
            $tunnelUrl = $matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "[ERROR] Failed to retrieve Cloudflare Tunnel URL. Check $logFile" -ForegroundColor Red
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -Force }
    if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
    exit 1
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Quality Inspection Worker is ONLINE!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " Public HTTPS URL: " -NoNewline; Write-Host $tunnelUrl -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " Next Steps for Vercel:" -ForegroundColor Yellow
Write-Host " 1. Open Vercel Dashboard -> Settings -> Environment Variables" -ForegroundColor White
Write-Host " 2. Set: QUALITY_SERVICE_URL = $tunnelUrl" -ForegroundColor Cyan
Write-Host " 3. Quality inspections on Vercel will now be processed by your PC!" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " Press [Ctrl + C] anytime to stop the worker." -ForegroundColor Gray
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 2
        if ($serverProcess.HasExited -or $tunnelProcess.HasExited) {
            Write-Host "[WARN] Process terminated. Exiting..." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host "[STOPPING] Shutting down server and tunnel..." -ForegroundColor Red
    if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -Force }
    if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force }
    Write-Host "[DONE] Worker stopped." -ForegroundColor Gray
}
