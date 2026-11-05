<#
.SYNOPSIS
    Unified test suite runner for the complete LanternEd application.
.DESCRIPTION
    Runs and verifies all test layers across backend and frontend:
      1. Backend Pytest (Auth, SQLite/PostgreSQL, Whisper STT, Classes, Sync, Notifications, Billing)
      2. Frontend Code Quality (Oxlint)
      3. Frontend Production Build & TypeScript check (Vite + tsc)
      4. Frontend Unit & Component Tests (Vitest)
      5. Playwright Responsive Layout Tests (Desktop to mobile viewports)
      6. Playwright Offline Shell & Playback Tests (Service Worker, IndexedDB, Video Sync)
      7. Playwright Real Backend Stack Tests (Real FastAPI + SQLite + Vite Preview)
      8. Playwright Live Cloud WebRTC Tests (LiveKit Cloud, concurrent peers, media tracks)

.PARAMETER SkipLive
    Skips the Live WebRTC cloud tests (useful when running fully offline or in restricted environments).
.PARAMETER Fast
    Runs only fast suites (Backend Pytest + Frontend Lint + Build + Vitest Unit Tests).
.PARAMETER Suite
    Runs only a specific suite: 'backend', 'lint', 'build', 'unit', 'layout', 'offline', 'real', 'live'.
#>

[CmdletBinding()]
param(
    [switch]$SkipLive,
    [switch]$Fast,
    [ValidateSet('all', 'backend', 'lint', 'build', 'unit', 'layout', 'offline', 'real', 'live')]
    [string]$Suite = 'all'
)

$ErrorActionPreference = 'Continue'
$Root = $PSScriptRoot | Split-Path -Parent
Set-Location $Root

function Write-Header($text) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor White
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Write-Success($text) {
    Write-Host " [PASS] $text" -ForegroundColor Green
}

function Write-Failure($text) {
    Write-Host " [FAIL] $text" -ForegroundColor Red
}

$Results = [System.Collections.Generic.List[PSCustomObject]]::new()
$TotalSw = [System.Diagnostics.Stopwatch]::StartNew()

function Run-Step($name, $scriptBlock) {
    Write-Host ""
    Write-Host ">>> Running: $name..." -ForegroundColor Yellow
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $passed = $false
    $errorMsg = ""
    try {
        & $scriptBlock
        if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq $null) {
            $passed = $true
        } else {
            $errorMsg = "Exit code: $LASTEXITCODE"
        }
    } catch {
        $errorMsg = $_.Exception.Message
    }
    $sw.Stop()
    $dur = [Math]::Round($sw.Elapsed.TotalSeconds, 1)

    if ($passed) {
        Write-Success "$name ($dur s)"
        $Results.Add([PSCustomObject]@{ Suite = $name; Status = 'PASSED'; Duration = "${dur}s"; Error = '' })
    } else {
        Write-Failure "$name ($dur s) - $errorMsg"
        $Results.Add([PSCustomObject]@{ Suite = $name; Status = 'FAILED'; Duration = "${dur}s"; Error = $errorMsg })
    }
    return $passed
}

Write-Header "LanternEd Full Test Suite Runner"
Write-Host "Root Directory: $Root" -ForegroundColor Gray
Write-Host "Timestamp:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray

# 1. Backend Pytest
if ($Suite -in @('all', 'backend')) {
    Run-Step "Backend Pytest (API, DB, Media, STT, Auth)" {
        $python = Join-Path $Root "backend\venv\Scripts\pytest.exe"
        if (-not (Test-Path $python)) {
            $python = "pytest"
        }
        & $python (Join-Path $Root "backend/tests") -v
    }
}

# 2. Frontend Lint
if ($Suite -in @('all', 'lint')) {
    Run-Step "Frontend Linter (oxlint)" {
        npm --prefix (Join-Path $Root "frontend") run lint
    }
}

# 3. Frontend Type Check & Build
if ($Suite -in @('all', 'build')) {
    Run-Step "Frontend Build & Typecheck (tsc + vite build)" {
        npm --prefix (Join-Path $Root "frontend") run build
    }
}

# 4. Frontend Vitest Unit Tests
if ($Suite -in @('all', 'unit')) {
    Run-Step "Frontend Unit Tests (Vitest)" {
        npm --prefix (Join-Path $Root "frontend") test
    }
}

if (-not $Fast) {
    # 5. Playwright Layout Tests
    if ($Suite -in @('all', 'layout')) {
        Run-Step "Playwright Responsive Layout Suite" {
            npm --prefix (Join-Path $Root "frontend") run test:e2e:layout
        }
    }

    # 6. Playwright Offline Shell & Sync Tests
    if ($Suite -in @('all', 'offline')) {
        Run-Step "Playwright Offline Shell & Playback Suite" {
            npm --prefix (Join-Path $Root "frontend") run test:e2e:offline
        }
    }

    # 7. Playwright Real Backend Stack Tests
    if ($Suite -in @('all', 'real')) {
        Run-Step "Playwright Real Stack Integration Suite" {
            npm --prefix (Join-Path $Root "frontend") run test:e2e:real
        }
    }

    # 8. Playwright Live Cloud WebRTC Tests
    if (-not $SkipLive -and ($Suite -in @('all', 'live'))) {
        Run-Step "Playwright Live Cloud WebRTC Suite" {
            npm --prefix (Join-Path $Root "frontend") run test:e2e:live
        }
    } elseif ($SkipLive -and ($Suite -in @('all', 'live'))) {
        $Results.Add([PSCustomObject]@{ Suite = "Playwright Live Cloud WebRTC Suite"; Status = 'SKIPPED'; Duration = '0s'; Error = 'Skipped via -SkipLive' })
        Write-Host " [SKIP] Playwright Live Cloud WebRTC Suite (Skipped via -SkipLive)" -ForegroundColor DarkGray
    }
}

$TotalSw.Stop()
$totalDur = [Math]::Round($TotalSw.Elapsed.TotalSeconds, 1)

# Summary Report
Write-Header "Test Execution Summary"
$allPassed = $true
foreach ($r in $Results) {
    $color = if ($r.Status -eq 'PASSED') { 'Green' } elseif ($r.Status -eq 'SKIPPED') { 'DarkGray' } else { 'Red' }
    if ($r.Status -eq 'FAILED') { $allPassed = $false }
    Write-Host ("  {0,-45} [{1,-7}] {2,8}" -f $r.Suite, $r.Status, $r.Duration) -ForegroundColor $color
}

Write-Host ("-" * 70) -ForegroundColor Cyan
Write-Host ("  Total Execution Time: {0}s" -f $totalDur) -ForegroundColor White

if ($allPassed) {
    Write-Host ""
    Write-Host "ALL TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "SOME TESTS FAILED - Check logs above for details." -ForegroundColor Red
    exit 1
}
