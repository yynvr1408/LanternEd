<#
.SYNOPSIS
    Build local LanternED release artifacts for host-supported apps and enforce the latest-2 retention rule.

.EXAMPLE
    .\scripts\local_release_build.ps1
    .\scripts\local_release_build.ps1 -Targets windows,android -Keep 2
    .\scripts\local_release_build.ps1 -Version 0.1.6 -FetchMissingFromRelease v0.1.6
#>
[CmdletBinding()]
param(
    [string]$Version = "",
    [ValidateSet("none", "patch", "minor", "major")]
    [string]$Bump = "none",
    [string]$Targets = "auto",
    [int]$Keep = 2,
    [string]$FetchMissingFromRelease = "",
    [switch]$SkipTests,
    [switch]$SkipWebBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$VenvPython = Join-Path $RepoRoot "backend\venv\Scripts\python.exe"
$PythonExe = if (Test-Path $VenvPython) { $VenvPython } else { "python" }

$CmdArgs = @(
    (Join-Path $RepoRoot "scripts\ci_release.py"),
    "local-build",
    "--bump", $Bump,
    "--targets", $Targets,
    "--keep", "$Keep"
)

if ($Version) { $CmdArgs += @("--version", $Version) }
if ($FetchMissingFromRelease) { $CmdArgs += @("--fetch-missing-from-release", $FetchMissingFromRelease) }
if ($SkipTests) { $CmdArgs += "--skip-tests" }
if ($SkipWebBuild) { $CmdArgs += "--skip-web-build" }
if ($DryRun) { $CmdArgs += "--dry-run" }

& $PythonExe @CmdArgs
exit $LASTEXITCODE
