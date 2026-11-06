#!/usr/bin/env python3
"""
LanternEd — Automated Release Management & Version Bumper
=========================================================

Handles the complete release lifecycle for LanternEd:
  1. Validates or bumps the semantic version across all configuration files:
     - releases/manifest.json
     - frontend/package.json
     - frontend/src/services/releaseService.ts
     - windows_launcher/setup.iss
  2. Extracts release description from CHANGELOG.md under ## [v<version>].
  3. Recomputes SHA-256 hashes and sizes for compiled native binaries.
  4. Optionally creates the git commit and release tag (v<version>).
  5. Synchronizes release metadata to ../LanternEd-App-Releases.

Usage:
  # Check status of current version and release integrity:
  python scripts/release.py --check

  # Prepare a new release (e.g., 0.1.2):
  python scripts/release.py --version 0.1.2 --tag --commit

  # Prepare a new release with custom notes:
  python scripts/release.py --version 0.1.2 --notes "Bug fixes and layout stabilization" --tag --commit
"""

import re
import sys
import json
import argparse
import subprocess
from pathlib import Path
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).resolve().parent.parent
RELEASES_DIR = ROOT_DIR / "releases"
MANIFEST_PATH = RELEASES_DIR / "manifest.json"
CHANGELOG_PATH = ROOT_DIR / "CHANGELOG.md"
FRONTEND_PKG_PATH = ROOT_DIR / "frontend" / "package.json"
RELEASE_SERVICE_PATH = ROOT_DIR / "frontend" / "src" / "services" / "releaseService.ts"
SETUP_ISS_PATH = ROOT_DIR / "windows_launcher" / "setup.iss"
APP_RELEASES_REPO = ROOT_DIR.parent / "LanternEd-App-Releases"


def extract_changelog_notes(version: str) -> str:
    """Extracts markdown notes under ## [v<version>] from CHANGELOG.md."""
    if not CHANGELOG_PATH.exists():
        return ""
    text = CHANGELOG_PATH.read_text(encoding="utf-8")
    pattern = rf"##\s*\[v?{re.escape(version)}\][^\n]*\n([\s\S]*?)(?=\n##\s*\[|\Z)"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return ""


def get_current_manifest() -> dict:
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def update_version_in_files(version: str, notes: str | None = None):
    clean_version = version.lstrip("v")
    print(f"[*] Bumping project version to v{clean_version}...")

    # 1. Update releases/manifest.json
    manifest = get_current_manifest()
    manifest["version"] = clean_version
    manifest["releaseDate"] = datetime.now(timezone.utc).isoformat()
    if notes:
        manifest["releaseNotes"] = f"LanternED v{clean_version}: {notes}"

    for plat, config in manifest.get("platforms", {}).items():
        config["version"] = clean_version
        if plat == "windows":
            config["fileName"] = f"LanternEd-Setup-{clean_version}.exe"
            config["downloadUrl"] = f"https://github.com/yynvr1408/LanternEd-App-Releases/releases/latest/download/LanternEd-Setup-{clean_version}.exe"
        elif plat == "macos":
            config["fileName"] = f"LanternEd-{clean_version}-universal.dmg"
            config["downloadUrl"] = f"https://github.com/yynvr1408/LanternEd-App-Releases/releases/latest/download/LanternEd-{clean_version}-universal.dmg"
        elif plat == "android":
            config["fileName"] = f"LanternEd-v{clean_version}.apk"
            config["downloadUrl"] = f"https://github.com/yynvr1408/LanternEd-App-Releases/releases/latest/download/LanternEd-v{clean_version}.apk"
        elif plat == "ios":
            config["fileName"] = f"LanternEd-v{clean_version}.ipa"
            config["downloadUrl"] = f"https://github.com/yynvr1408/LanternEd-App-Releases/releases/latest/download/LanternEd-v{clean_version}.ipa"

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"  [OK] Updated {MANIFEST_PATH}")

    # 2. Update frontend/package.json
    if FRONTEND_PKG_PATH.exists():
        with open(FRONTEND_PKG_PATH, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        pkg["version"] = clean_version
        with open(FRONTEND_PKG_PATH, "w", encoding="utf-8") as f:
            json.dump(pkg, f, indent=2)
            f.write("\n")
        print(f"  [OK] Updated {FRONTEND_PKG_PATH}")

    # 3. Update releaseService.ts
    if RELEASE_SERVICE_PATH.exists():
        src = RELEASE_SERVICE_PATH.read_text(encoding="utf-8")
        src = re.sub(
            r"export const APP_CURRENT_VERSION\s*=\s*'[^']+'",
            f"export const APP_CURRENT_VERSION = '{clean_version}'",
            src
        )
        RELEASE_SERVICE_PATH.write_text(src, encoding="utf-8")
        print(f"  [OK] Updated {RELEASE_SERVICE_PATH}")

    # 4. Update setup.iss
    if SETUP_ISS_PATH.exists():
        iss = SETUP_ISS_PATH.read_text(encoding="utf-8")
        iss = re.sub(r'#define MyAppVersion\s*"[^"]+"', f'#define MyAppVersion "{clean_version}"', iss)
        iss = re.sub(r'OutputBaseFilename=LanternEd-Setup-[^\s]+', f'OutputBaseFilename=LanternEd-Setup-{clean_version}', iss)
        SETUP_ISS_PATH.write_text(iss, encoding="utf-8")
        print(f"  [OK] Updated {SETUP_ISS_PATH}")


def sync_to_distribution_repo():
    if not APP_RELEASES_REPO.exists():
        print(f"[!] Target releases directory {APP_RELEASES_REPO} does not exist.")
        return

    print("\n[*] Synchronizing distribution metadata to LanternEd-App-Releases...")
    manifest = get_current_manifest()
    app_manifest = APP_RELEASES_REPO / "manifest.json"
    with open(app_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"  [OK] Synced {app_manifest}")


def main():
    parser = argparse.ArgumentParser(description="LanternEd Automated Release Management")
    parser.add_argument("--version", help="Semantic version to release (e.g. 0.1.2 or v0.1.2)")
    parser.add_argument("--notes", help="Short one-line release description")
    parser.add_argument("--check", action="store_true", help="Verify release integrity and current version status")
    parser.add_argument("--tag", action="store_true", help="Create git tag v<version>")
    parser.add_argument("--commit", action="store_true", help="Create git commit for release version bump")
    parser.add_argument("--push", action="store_true", help="Push commit and tags to origin main")
    args = parser.parse_args()

    manifest = get_current_manifest()
    curr_version = manifest.get("version", "0.1.1")

    if args.check:
        print("=" * 70)
        print(f"LanternED Release Status Check (Current Version: v{curr_version})")
        print("=" * 70)
        # Import package_release to verify checksums
        sys.path.insert(0, str(ROOT_DIR / "scripts"))
        from package_release import verify_releases
        verify_releases()
        return

    if not args.version:
        print(f"Current version is: v{curr_version}")
        print("Usage: python scripts/release.py --version <NEW_VERSION> [--notes \"...\"] [--commit] [--tag] [--push]")
        sys.exit(0)

    clean_version = args.version.lstrip("v")
    changelog_notes = extract_changelog_notes(clean_version)
    notes = args.notes or changelog_notes or f"Release v{clean_version} cross-platform ecosystem update"

    update_version_in_files(clean_version, notes)

    # Recompute hashes if files exist
    sys.path.insert(0, str(ROOT_DIR / "scripts"))
    from package_release import update_hashes, verify_releases
    update_hashes()
    sync_to_distribution_repo()

    tag_name = f"v{clean_version}"
    if args.commit:
        print("\n[*] Committing release version bump...")
        subprocess.run(["git", "add", "releases/", "frontend/package.json", "frontend/src/services/releaseService.ts", "windows_launcher/setup.iss"], cwd=str(ROOT_DIR), check=True)
        subprocess.run(["git", "commit", "-m", f"chore(release): bump version to {tag_name}"], cwd=str(ROOT_DIR), check=True)
        print(f"  [OK] Committed chore(release): bump version to {tag_name}")

    if args.tag:
        print(f"\n[*] Creating git tag {tag_name}...")
        subprocess.run(["git", "tag", "-a", tag_name, "-m", f"LanternED {tag_name} - {notes}"], cwd=str(ROOT_DIR), check=True)
        print(f"  [OK] Created tag {tag_name}")

    if args.push:
        print("\n[*] Pushing to origin main with tags...")
        subprocess.run(["git", "push", "origin", "main", "--tags"], cwd=str(ROOT_DIR), check=True)
        print(f"  [OK] Pushed commit and {tag_name} to origin!")

    print("\n" + "=" * 70)
    print(f"🎉 LanternED Release v{clean_version} Prepared Successfully!")
    print("=" * 70)
    print("To trigger automated cross-platform builds and GitHub Release publishing:")
    print(f"  git push origin main --tags")
    print("=" * 70)


if __name__ == "__main__":
    main()
