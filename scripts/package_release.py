#!/usr/bin/env python3
"""
LanternEd Cross-Platform Release Packaging & Checksum Generator
==============================================================

Automates the packaging, hashing (SHA-256), metadata generation, and verification
for LanternEd native client packages across Windows, macOS, Android, and iOS.

Usage:
    # Verify all current release binaries against manifest:
    python scripts/package_release.py --action verify

    # Re-calculate hashes & sizes for existing binaries in releases/:
    python scripts/package_release.py --action update-hashes

    # Package a newly built Windows executable:
    python scripts/package_release.py --action package --platform windows --version 0.2.0 \
        --source-file path/to/LanternEd-Setup.exe --notes "Version 0.2.0 release"

    # Bump version and update release notes across manifest and all platforms:
    python scripts/package_release.py --action update-version --version 0.2.0 \
        --notes "Performance improvements and live classroom bandwidth optimizations."
"""

import os
import sys
import json
import hashlib
import argparse
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).resolve().parent.parent
RELEASES_DIR = ROOT_DIR / "releases"
MANIFEST_PATH = RELEASES_DIR / "manifest.json"

PLATFORMS = ["windows", "macos", "android", "ios"]

DEFAULT_SPECS = {
    "windows": {
        "fileName": "LanternEd-Setup-{version}.exe",
        "installerType": "exe",
        "downloadUrl": "/api/v1/releases/download/windows",
        "minOsVersion": "Windows 10 / 11 (64-bit)",
        "arch": "x64"
    },
    "macos": {
        "fileName": "LanternEd-{version}-universal.dmg",
        "installerType": "dmg",
        "downloadUrl": "/api/v1/releases/download/macos",
        "minOsVersion": "macOS 10.15+ (Catalina through Sequoia)",
        "arch": "Universal (Apple Silicon & Intel)"
    },
    "android": {
        "fileName": "LanternEd-v{version}.apk",
        "installerType": "apk",
        "downloadUrl": "/api/v1/releases/download/android",
        "minOsVersion": "Android 8.0+ (Oreo, Pie, 10, 11, 12, 13, 14, 15)",
        "arch": "arm64-v8a, armeabi-v7a"
    },
    "ios": {
        "fileName": "LanternEd-v{version}.ipa",
        "installerType": "ipa",
        "downloadUrl": "/api/v1/releases/download/ios",
        "minOsVersion": "iOS 14.0+ (iPhone & iPad)",
        "arch": "arm64"
    }
}


def calculate_sha256(filepath: Path) -> str:
    """Computes SHA-256 hash in 64KB chunks."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def get_file_size_mb(filepath: Path) -> float:
    """Returns file size in megabytes rounded to 1 decimal place."""
    size_bytes = filepath.stat().st_size
    return round(size_bytes / (1024 * 1024), 1)


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Manifest not found at {MANIFEST_PATH}")
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_manifest(data: dict, dry_run: bool = False):
    if dry_run:
        print("[DRY RUN] Would update manifest.json:")
        print(json.dumps(data, indent=2))
        return
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"[OK] Saved updated manifest to {MANIFEST_PATH}")


def save_platform_release(platform: str, data: dict, dry_run: bool = False):
    platform_dir = RELEASES_DIR / platform
    platform_dir.mkdir(parents=True, exist_ok=True)
    release_path = platform_dir / "release.json"
    if dry_run:
        print(f"[DRY RUN] Would update {release_path}")
        return
    with open(release_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"[OK] Saved platform release info to {release_path}")


def verify_releases() -> bool:
    """Verifies that all binaries listed in manifest.json exist and match checksums."""
    manifest = load_manifest()
    print("=" * 70)
    print(f"LanternEd Release Integrity Verification (Manifest v{manifest.get('version')})")
    print("=" * 70)

    all_passed = True
    for plat in PLATFORMS:
        info = manifest["platforms"].get(plat)
        if not info:
            print(f"  [{plat.upper()}] Missing from manifest")
            all_passed = False
            continue

        filename = info.get("fileName")
        filepath = RELEASES_DIR / plat / filename

        if not filepath.exists():
            print(f"  [{plat.upper():<7}] MISSING: {filepath}")
            all_passed = False
            continue

        actual_sha = calculate_sha256(filepath)
        actual_size = get_file_size_mb(filepath)
        expected_sha = info.get("sha256", "")

        sha_match = actual_sha.lower() == expected_sha.lower()
        status = "MATCH" if sha_match else "MISMATCH"

        if not sha_match:
            all_passed = False

        print(f"  [{plat.upper():<7}] {filename} ({actual_size} MB)")
        print(f"            Expected SHA: {expected_sha}")
        print(f"            Actual SHA:   {actual_sha} [{status}]")

    print("-" * 70)
    if all_passed:
        print("RESULT: All release artifacts passed SHA-256 checksum verification.")
    else:
        print("RESULT: One or more release artifacts failed integrity check.")
    print("=" * 70)
    return all_passed


def normalize_downloaded_artifacts(plat: str, target_filename: str) -> Path | None:
    """If the exact expected target_filename does not exist in releases/<plat>,
    find any binary artifact with matching or compatible extension and rename it to target_filename."""
    platform_dir = RELEASES_DIR / plat
    if not platform_dir.exists():
        return None
    target_path = platform_dir / target_filename
    if target_path.exists():
        return target_path

    ext = Path(target_filename).suffix.lower()
    candidates = [f for f in platform_dir.iterdir() if f.is_file() and f.suffix.lower() == ext]
    if not candidates:
        alt_map = {".exe": [".msi"], ".ipa": [".zip", ".tar.gz", ".app"]}
        compat_exts = alt_map.get(ext, [])
        candidates = [f for f in platform_dir.iterdir() if f.is_file() and f.suffix.lower() in compat_exts]

    if candidates:
        candidate = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]
        print(f"  [{plat}] Normalizing downloaded artifact: {candidate.name} -> {target_filename}")
        candidate.rename(target_path)
        return target_path
    return None


def update_hashes(dry_run: bool = False):
    """Recomputes SHA-256 and sizes for all binaries present in releases/<platform>/."""
    manifest = load_manifest()
    version = manifest.get("version", "0.1.1")
    print(f"Updating checksums for LanternEd v{version}...")

    for plat in PLATFORMS:
        info = manifest["platforms"].get(plat, {})
        filename = info.get("fileName") or DEFAULT_SPECS[plat]["fileName"].format(version=version)
        filepath = normalize_downloaded_artifacts(plat, filename) or (RELEASES_DIR / plat / filename)

        if filepath.exists():
            sha = calculate_sha256(filepath)
            size_mb = get_file_size_mb(filepath)
            info["sha256"] = sha
            info["fileSizeMb"] = size_mb
            info["fileName"] = filename
            manifest["platforms"][plat] = info
            save_platform_release(plat, info, dry_run=dry_run)
            print(f"  [{plat}] Updated: {filename} -> {sha[:16]}... ({size_mb} MB)")
        else:
            print(f"  [{plat}] File not found at {filepath}, retaining existing metadata")

    save_manifest(manifest, dry_run=dry_run)


def package_platform_binary(
    platform: str,
    source_file: Path,
    version: str = None,
    notes: str = None,
    dry_run: bool = False
):
    """Copies a newly compiled binary into releases/<platform>/ and updates manifest."""
    manifest = load_manifest()
    ver = version or manifest.get("version", "0.1.0")

    if not source_file.exists():
        raise FileNotFoundError(f"Source file does not exist: {source_file}")

    target_dir = RELEASES_DIR / platform
    target_dir.mkdir(parents=True, exist_ok=True)

    default_name = DEFAULT_SPECS[platform]["fileName"].format(version=ver)
    target_file = target_dir / default_name

    if not dry_run:
        import shutil
        print(f"Copying {source_file} -> {target_file}...")
        shutil.copy2(source_file, target_file)

    sha = calculate_sha256(source_file)
    size_mb = get_file_size_mb(source_file)

    platform_data = {
        "version": ver,
        "fileName": default_name,
        "installerType": DEFAULT_SPECS[platform]["installerType"],
        "downloadUrl": DEFAULT_SPECS[platform]["downloadUrl"],
        "fileSizeMb": size_mb,
        "sha256": sha,
        "minOsVersion": DEFAULT_SPECS[platform]["minOsVersion"],
        "arch": DEFAULT_SPECS[platform]["arch"]
    }

    manifest["platforms"][platform] = platform_data
    if version:
        manifest["version"] = version
    if notes:
        manifest["releaseNotes"] = notes
    manifest["releaseDate"] = datetime.now(timezone.utc).isoformat()

    save_platform_release(platform, platform_data, dry_run=dry_run)
    save_manifest(manifest, dry_run=dry_run)
    print(f"Successfully packaged {platform} release: {default_name}")


def update_version(version: str, notes: str = None, dry_run: bool = False):
    """Bumps version number across all platforms and the master manifest."""
    manifest = load_manifest()
    manifest["version"] = version
    manifest["releaseDate"] = datetime.now(timezone.utc).isoformat()
    if notes:
        manifest["releaseNotes"] = notes

    for plat in PLATFORMS:
        info = manifest["platforms"].get(plat, {})
        info["version"] = version
        old_name = info.get("fileName", "")
        # Update filename if it matches default pattern
        new_name = DEFAULT_SPECS[plat]["fileName"].format(version=version)
        info["fileName"] = new_name
        manifest["platforms"][plat] = info
        save_platform_release(plat, info, dry_run=dry_run)

    save_manifest(manifest, dry_run=dry_run)
    print(f"Bumped release version to {version}")


def main():
    parser = argparse.ArgumentParser(description="LanternEd Native Release Packaging Tool")
    parser.add_argument(
        "--action",
        choices=["verify", "update-hashes", "package", "update-version"],
        default="verify",
        help="Action to perform (default: verify)"
    )
    parser.add_argument("--platform", choices=PLATFORMS, help="Target platform for packaging")
    parser.add_argument("--source-file", type=Path, help="Path to compiled binary")
    parser.add_argument("--version", type=str, help="Release version (e.g., 0.1.0)")
    parser.add_argument("--notes", type=str, help="Release notes summary")
    parser.add_argument("--dry-run", action="store_true", help="Simulate actions without saving")

    args = parser.parse_args()

    if args.action == "verify":
        success = verify_releases()
        sys.exit(0 if success else 1)

    elif args.action == "update-hashes":
        update_hashes(dry_run=args.dry_run)

    elif args.action == "package":
        if not args.platform or not args.source_file:
            parser.error("--platform and --source-file are required for 'package' action")
        package_platform_binary(
            platform=args.platform,
            source_file=args.source_file,
            version=args.version,
            notes=args.notes,
            dry_run=args.dry_run
        )

    elif args.action == "update-version":
        if not args.version:
            parser.error("--version is required for 'update-version' action")
        update_version(
            version=args.version,
            notes=args.notes,
            dry_run=args.dry_run
        )


if __name__ == "__main__":
    main()
