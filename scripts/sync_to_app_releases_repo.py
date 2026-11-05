#!/usr/bin/env python3
"""
LanternEd - App Releases Repository Sync & Publish Utility
=========================================================

Prepares and synchronizes the standalone public distribution repository:
'LanternEd-App-Releases' (or 'LanternEd-App-Release').

This utility exports the clean release manifest, platform installer binaries,
checksums, and public documentation into an isolated git repository ready
to push to GitHub.

Usage:
    # Prepare export directory at ../LanternEd-App-Releases:
    python scripts/sync_to_app_releases_repo.py --target-dir ../LanternEd-App-Releases

    # Prepare and automatically push to GitHub remote:
    python scripts/sync_to_app_releases_repo.py \
        --target-dir ../LanternEd-App-Releases \
        --git-remote https://github.com/YOUR_USERNAME/LanternEd-App-Releases.git \
        --push
"""

import sys
import os
import shutil
import argparse
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
RELEASES_DIR = ROOT_DIR / "releases"
sys.path.insert(0, str(SCRIPTS_DIR))


def main():
    parser = argparse.ArgumentParser(description="Sync LanternEd Releases to dedicated repository")
    parser.add_argument(
        "--target-dir",
        type=Path,
        default=ROOT_DIR.parent / "LanternEd-App-Releases",
        help="Path to export directory (default: ../LanternEd-App-Releases)"
    )
    parser.add_argument("--git-remote", help="Remote Git URL for the app releases repository")
    parser.add_argument("--push", action="store_true", help="Automatically commit and push to remote")
    args = parser.parse_args()

    target_dir = args.target_dir.resolve()
    print("=" * 70)
    print("LanternEd Dedicated App Releases Repository Sync")
    print("=" * 70)
    print(f"Source Directory: {RELEASES_DIR}")
    print(f"Target Directory: {target_dir}")

    # First verify release integrity in source directory
    from package_release import verify_releases, load_manifest
    manifest = load_manifest()
    version = manifest.get("version", "0.1.1")
    if not verify_releases():
        print("[!] Verification failed. Please ensure all binaries match manifest before syncing.")
        sys.exit(1)

    # Create target directory if needed
    target_dir.mkdir(parents=True, exist_ok=True)

    # Copy files
    print("\nCopying release packages and metadata...")
    for item in RELEASES_DIR.iterdir():
        dest = target_dir / item.name
        if item.is_dir():
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(item, dest)
            print(f"  [DIR]  {item.name}/ -> {dest}")
        else:
            shutil.copy2(item, dest)
            print(f"  [FILE] {item.name} -> {dest}")

    # Initialize git repo in target directory if not already a git repo
    git_dir = target_dir / ".git"
    if not git_dir.exists():
        print("\nInitializing Git repository in target directory...")
        subprocess.run(["git", "init", "-b", "main"], cwd=str(target_dir), check=True)

    if args.git_remote:
        print(f"Configuring git remote: origin -> {args.git_remote}")
        subprocess.run(["git", "remote", "remove", "origin"], cwd=str(target_dir), stderr=subprocess.DEVNULL)
        subprocess.run(["git", "remote", "add", "origin", args.git_remote], cwd=str(target_dir), check=True)

    if args.push:
        print("\nStaging, committing, and pushing release artifacts...")
        subprocess.run(["git", "add", "."], cwd=str(target_dir), check=True)
        subprocess.run(
            ["git", "commit", "-m", f"chore(release): publish v{version} cross-platform release artifacts"],
            cwd=str(target_dir),
            capture_output=True,
            text=True,
        )
        try:
            push_res = subprocess.run(
                ["git", "push", "-u", "origin", "main", "--force"],
                cwd=str(target_dir),
                capture_output=True,
                text=True,
            )
            if push_res.returncode == 0:
                print("[SUCCESS] Published release packages to remote repository!")
            else:
                err_msg = push_res.stderr.strip() or push_res.stdout.strip()
                print(f"[WARNING] Remote push was not accepted (returncode={push_res.returncode}): {err_msg}")
                print("[INFO] Release assets are preserved locally in target directory and workflow artifacts.")
        except Exception as push_err:
            print(f"[WARNING] Could not push to remote releases repository: {push_err}")
            print("[INFO] Release assets are preserved locally in target directory and workflow artifacts.")
    else:
        print(f"\n[OK] Release repository prepared at: {target_dir}")
        print("To push manually, run:")
        print(f"  cd \"{target_dir}\"")
        print("  git add .")
        print(f"  git commit -m \"chore(release): publish v{version} cross-platform release artifacts\"")
        print("  git remote add origin <YOUR_APP_RELEASES_REPO_URL>")
        print("  git push -u origin main")

    print("=" * 70)


if __name__ == "__main__":
    main()
