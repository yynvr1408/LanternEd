"""Native application release distribution and in-app update management.

Provides public manifest inspection, semantic update checking, and binary download
endpoints for Windows, macOS, Android, and iOS client applications.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/releases", tags=["releases"])

RELEASES_ROOT = Path(__file__).resolve().parents[4] / "releases"
MANIFEST_FILE = RELEASES_ROOT / "manifest.json"


class PlatformReleaseInfo(BaseModel):
    version: str
    file_name: str = Field(..., alias="fileName")
    installer_type: str = Field(..., alias="installerType")
    download_url: str = Field(..., alias="downloadUrl")
    file_size_mb: float = Field(..., alias="fileSizeMb")
    sha256: str
    min_os_version: str = Field(..., alias="minOsVersion")
    arch: str


class ReleaseManifestOut(BaseModel):
    version: str
    release_date: str = Field(..., alias="releaseDate")
    release_notes: str = Field(..., alias="releaseNotes")
    platforms: dict[str, Any]


class UpdateCheckOut(BaseModel):
    has_update: bool
    current_version: str
    latest_version: str
    platform: str
    download_url: str | None = None
    file_name: str | None = None
    file_size_mb: float | None = None
    sha256: str | None = None
    release_notes: str | None = None
    is_critical: bool = False


def _load_manifest() -> dict[str, Any]:
    if not MANIFEST_FILE.exists():
        return {
            "version": "0.1.0",
            "releaseDate": "2026-11-05T12:00:00Z",
            "releaseNotes": "LanternEd Cross-Platform Release",
            "platforms": {},
        }
    try:
        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to load release manifest: {exc}",
        ) from exc


def _parse_semver(v: str) -> tuple[int, int, int]:
    cleaned = v.lstrip("vV").strip()
    parts = cleaned.split(".")
    try:
        return (
            int(parts[0]) if len(parts) > 0 else 0,
            int(parts[1]) if len(parts) > 1 else 0,
            int(parts[2]) if len(parts) > 2 else 0,
        )
    except ValueError:
        return (0, 0, 0)


@router.get("/manifest", response_model=ReleaseManifestOut)
def get_release_manifest() -> dict[str, Any]:
    """Retrieves the full release manifest describing latest client app builds for all platforms."""
    return _load_manifest()


@router.get("/latest")
def get_latest_release(platform: str | None = Query(None, description="windows | macos | android | ios")) -> dict[str, Any]:
    """Retrieves the latest version details, optionally scoped to a single target platform."""
    manifest = _load_manifest()
    if not platform:
        return manifest
    p = platform.lower().strip()
    if p not in manifest.get("platforms", {}):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No release configured for platform '{platform}'. Supported: windows, macos, android, ios",
        )
    return {
        "version": manifest["version"],
        "releaseDate": manifest["releaseDate"],
        "releaseNotes": manifest["releaseNotes"],
        "platform": p,
        "details": manifest["platforms"][p],
    }


@router.get("/check-update", response_model=UpdateCheckOut)
def check_for_updates(
    current_version: str = Query(..., description="e.g. 0.1.0"),
    platform: str = Query(..., description="windows | macos | android | ios"),
) -> UpdateCheckOut:
    """Evaluates whether an installed client application has a newer version available."""
    manifest = _load_manifest()
    p = platform.lower().strip()
    platform_info = manifest.get("platforms", {}).get(p)
    if not platform_info:
        return UpdateCheckOut(
            has_update=False,
            current_version=current_version,
            latest_version=manifest.get("version", current_version),
            platform=p,
        )

    latest_semver = _parse_semver(platform_info.get("version", manifest["version"]))
    current_semver = _parse_semver(current_version)
    has_update = latest_semver > current_semver

    return UpdateCheckOut(
        has_update=has_update,
        current_version=current_version,
        latest_version=platform_info.get("version", manifest["version"]),
        platform=p,
        download_url=platform_info.get("downloadUrl"),
        file_name=platform_info.get("fileName"),
        file_size_mb=platform_info.get("fileSizeMb"),
        sha256=platform_info.get("sha256"),
        release_notes=manifest.get("releaseNotes"),
        is_critical=latest_semver[0] > current_semver[0],  # Major version difference is critical
    )


@router.get("/download/{platform}")
def download_platform_release(platform: str):
    """Directly downloads the native application installer package for the requested platform."""
    p = platform.lower().strip()
    manifest = _load_manifest()
    platform_info = manifest.get("platforms", {}).get(p)
    if not platform_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Platform '{platform}' not found in release catalog.",
        )

    file_name = platform_info.get("fileName")
    file_path = RELEASES_ROOT / p / file_name

    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Release binary '{file_name}' not yet uploaded to server releases repository.",
        )

    # Determine content-type
    media_types = {
        "exe": "application/vnd.microsoft.portable-executable",
        "msi": "application/x-msi",
        "dmg": "application/x-apple-diskimage",
        "apk": "application/vnd.android.package-archive",
        "ipa": "application/octet-stream",
    }
    ext = file_path.suffix.lstrip(".").lower()
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        filename=file_name,
        media_type=media_type,
    )
