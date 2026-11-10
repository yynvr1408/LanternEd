#!/usr/bin/env python3
"""CI/CD Versioning, Conventional Changelog, and Multi-Platform Release Helper.

Coordinates synchronized SemVer across web, Tauri desktop (Windows/macOS),
Capacitor mobile (Android/iOS), Inno Setup metadata, and releases/manifest.json;
generates Conventional-Commit changelogs; and produces SHA256SUMS.txt +
release-manifest.json for centralized release publishing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
RELEASES_DIR = ROOT_DIR / "releases"
MANIFEST_PATH = RELEASES_DIR / "manifest.json"
CHANGELOG_PATH = ROOT_DIR / "CHANGELOG.md"
PKG_JSON_PATH = FRONTEND_DIR / "package.json"
PKG_LOCK_PATH = FRONTEND_DIR / "package-lock.json"
TAURI_CONF_PATH = FRONTEND_DIR / "src-tauri" / "tauri.conf.json"
CARGO_TOML_PATH = FRONTEND_DIR / "src-tauri" / "Cargo.toml"
ANDROID_GRADLE_PATH = FRONTEND_DIR / "android" / "app" / "build.gradle"
IOS_PBXPROJ_PATH = FRONTEND_DIR / "ios" / "App" / "App.xcodeproj" / "project.pbxproj"
RELEASE_SERVICE_PATH = FRONTEND_DIR / "src" / "services" / "releaseService.ts"
SETUP_ISS_PATH = ROOT_DIR / "windows_launcher" / "setup.iss"

VALID_PLATFORMS = ("windows", "macos", "ios", "android")
RUNNER_MAP = {
    "windows": "windows-latest",
    "macos": "macos-latest",
    "ios": "macos-latest",
    "android": "ubuntu-latest",
}

SEMVER_RE = re.compile(
    r"^v?(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)"
    r"(?:-(?P<pre>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$"
)
CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[A-Za-z]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<desc>.+)$"
)


def run_git(args: list[str], *, check: bool = True) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if check and res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed ({res.returncode}): {res.stderr.strip()}")
    return res.stdout.strip()


def parse_semver(raw: str) -> tuple[int, int, int, str]:
    m = SEMVER_RE.match(raw.strip())
    if not m:
        raise ValueError(f"Invalid SemVer string: {raw!r}")
    return int(m.group("major")), int(m.group("minor")), int(m.group("patch")), m.group("pre") or ""


def semver_sort_key(raw: str) -> tuple[int, int, int, int, str]:
    major, minor, patch, pre = parse_semver(raw)
    # Final releases sort higher than pre-releases with the same major.minor.patch
    return (major, minor, patch, 1 if not pre else 0, pre)


def compute_version_code(version: str) -> int:
    major, minor, patch, _ = parse_semver(version)
    return max(1, major * 10000 + minor * 100 + patch)


def base_numeric_version(version: str) -> str:
    major, minor, patch, _ = parse_semver(version)
    return f"{major}.{minor}.{patch}"


def list_semver_tags() -> list[str]:
    out = run_git(["tag", "-l", "v*"], check=False)
    tags = []
    for line in out.splitlines():
        line = line.strip()
        if line and SEMVER_RE.match(line):
            tags.append(line)
    tags.sort(key=semver_sort_key)
    return tags


def current_baseline_version() -> str:
    tags = list_semver_tags()
    if tags:
        return tags[-1].lstrip("v")
    if MANIFEST_PATH.exists():
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if data.get("version"):
            return str(data["version"]).lstrip("v")
    if PKG_JSON_PATH.exists():
        data = json.loads(PKG_JSON_PATH.read_text(encoding="utf-8"))
        if data.get("version") and data["version"] != "0.0.0":
            return str(data["version"]).lstrip("v")
    return "0.1.0"


def find_previous_tag(target_tag: str) -> str:
    # Prefer git ancestry from the tag itself if it already exists
    exists = run_git(["rev-parse", "-q", "--verify", f"refs/tags/{target_tag}"], check=False)
    if exists:
        prev = run_git(
            ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", f"{target_tag}^"],
            check=False,
        )
        if prev and SEMVER_RE.match(prev):
            return prev

    tags = list_semver_tags()
    target_key = semver_sort_key(target_tag)
    prior = [t for t in tags if semver_sort_key(t) < target_key]
    return prior[-1] if prior else ""


def parse_targets(raw: str) -> list[str]:
    cleaned = (raw or "all").strip().lower()
    if not cleaned or cleaned == "all":
        return list(VALID_PLATFORMS)
    chosen: list[str] = []
    for part in cleaned.split(","):
        p = part.strip()
        if not p:
            continue
        if p not in VALID_PLATFORMS:
            raise ValueError(f"Unsupported target platform {p!r}. Valid options: all, {', '.join(VALID_PLATFORMS)}")
        if p not in chosen:
            chosen.append(p)
    if not chosen:
        raise ValueError("No valid target platforms specified.")
    return chosen


def write_github_outputs(path: Path | None, values: dict[str, str]) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            if "\n" in v:
                delimiter = "EOF_LANTERNED_OUT"
                f.write(f"{k}<<{delimiter}\n{v}\n{delimiter}\n")
            else:
                f.write(f"{k}={v}\n")


def cmd_next_version(args: argparse.Namespace) -> None:
    explicit_tag = (args.explicit_tag or "").strip()
    if explicit_tag:
        major, minor, patch, pre = parse_semver(explicit_tag)
        next_ver = f"{major}.{minor}.{patch}" + (f"-{pre}" if pre else "")
        tag = f"v{next_ver}"
        prev_tag = find_previous_tag(tag)
        bump_applied = "none"
    else:
        baseline = current_baseline_version()
        major, minor, patch, pre = parse_semver(baseline)
        bump = (args.bump or "patch").strip().lower()
        if bump == "major":
            next_ver = f"{major + 1}.0.0"
        elif bump == "minor":
            next_ver = f"{major}.{minor + 1}.0"
        elif bump == "patch":
            next_ver = f"{major}.{minor}.{patch + 1}"
        elif bump == "none":
            next_ver = f"{major}.{minor}.{patch}" + (f"-{pre}" if pre else "")
        else:
            raise ValueError(f"Invalid bump type: {bump!r}")
        tag = f"v{next_ver}"
        prev_tag = f"v{baseline}" if list_semver_tags() and bump != "none" else find_previous_tag(tag)
        bump_applied = bump

    version_code = compute_version_code(next_ver)
    is_prerelease = "true" if parse_semver(next_ver)[3] else "false"

    result = {
        "version": next_ver,
        "base_version": base_numeric_version(next_ver),
        "tag": tag,
        "prev_tag": prev_tag,
        "version_code": str(version_code),
        "bump": bump_applied,
        "is_prerelease": is_prerelease,
    }
    write_github_outputs(args.github_output, result)
    print(json.dumps(result, indent=2))


def cmd_matrix(args: argparse.Namespace) -> None:
    targets = parse_targets(args.targets)
    matrix = [{"platform": p, "runner": RUNNER_MAP[p]} for p in targets]
    payload = json.dumps(matrix, separators=(",", ":"))
    write_github_outputs(args.github_output, {"matrix": payload, "targets": ",".join(targets)})
    print(payload)


def _update_cargo_toml_version(path: Path, version: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    in_package = False
    replaced = False
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("["):
            in_package = stripped == "[package]"
        elif in_package and not replaced and re.match(r'^version\s*=\s*"[^"]+"', stripped):
            newline = "\r\n" if line.endswith("\r\n") else "\n"
            line = f'version = "{version}"{newline}'
            replaced = True
        out.append(line)
    if not replaced:
        raise RuntimeError(f"Could not locate [package] version in {path}")
    path.write_text("".join(out), encoding="utf-8")


def _update_android_gradle(path: Path, version: str, version_code: int) -> None:
    text = path.read_text(encoding="utf-8")
    new_text, n_code = re.subn(r"(\bversionCode\s+)\d+", rf"\g<1>{version_code}", text, count=1)
    new_text, n_name = re.subn(r'(\bversionName\s+)"[^"]+"', rf'\g<1>"{version}"', new_text, count=1)
    if n_code != 1 or n_name != 1:
        raise RuntimeError(f"Could not update versionCode/versionName in {path}")
    path.write_text(new_text, encoding="utf-8")


def _update_ios_pbxproj(path: Path, marketing_version: str, build_number: int) -> None:
    text = path.read_text(encoding="utf-8")
    new_text, n_mkt = re.subn(
        r"(\bMARKETING_VERSION\s*=\s*)[^;]+;",
        rf"\g<1>{marketing_version};",
        text,
    )
    new_text, n_cur = re.subn(
        r"(\bCURRENT_PROJECT_VERSION\s*=\s*)[^;]+;",
        rf"\g<1>{build_number};",
        new_text,
    )
    if n_mkt == 0 or n_cur == 0:
        raise RuntimeError(f"Could not update MARKETING_VERSION/CURRENT_PROJECT_VERSION in {path}")
    path.write_text(new_text, encoding="utf-8")


def _update_manifest_metadata(version: str, notes: str | None = None) -> None:
    if not MANIFEST_PATH.exists():
        return
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["version"] = version
    manifest["releaseDate"] = datetime.now(timezone.utc).isoformat()
    if notes:
        manifest["releaseNotes"] = f"LanternED v{version}: {notes}"

    default_names = {
        "windows": f"LanternEd-Setup-{version}.exe",
        "macos": f"LanternEd-{version}-universal.dmg",
        "android": f"LanternEd-v{version}.apk",
        "ios": f"LanternEd-v{version}.ipa",
    }
    for plat, cfg in manifest.get("platforms", {}).items():
        cfg["version"] = version
        if plat in default_names:
            cfg["fileName"] = default_names[plat]
        plat_release_json = RELEASES_DIR / plat / "release.json"
        if plat_release_json.exists():
            plat_release_json.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def sync_all_versions(version: str, version_code: int, notes: str | None = None) -> None:
    clean_ver = version.lstrip("v")
    parse_semver(clean_ver)
    ios_marketing_ver = base_numeric_version(clean_ver)

    # 1. frontend/package.json
    pkg = json.loads(PKG_JSON_PATH.read_text(encoding="utf-8"))
    pkg["version"] = clean_ver
    PKG_JSON_PATH.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")

    # 2. frontend/package-lock.json (keep root metadata synchronized)
    if PKG_LOCK_PATH.exists():
        lock = json.loads(PKG_LOCK_PATH.read_text(encoding="utf-8"))
        lock["version"] = clean_ver
        if isinstance(lock.get("packages"), dict) and "" in lock["packages"]:
            lock["packages"][""]["version"] = clean_ver
        PKG_LOCK_PATH.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")

    # 3. Tauri desktop configs
    tauri_conf = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    tauri_conf["version"] = clean_ver
    TAURI_CONF_PATH.write_text(json.dumps(tauri_conf, indent=2) + "\n", encoding="utf-8")
    _update_cargo_toml_version(CARGO_TOML_PATH, clean_ver)

    # 4. Android Capacitor config
    _update_android_gradle(ANDROID_GRADLE_PATH, clean_ver, version_code)

    # 5. iOS Xcode project
    _update_ios_pbxproj(IOS_PBXPROJ_PATH, ios_marketing_ver, version_code)

    # 6. Frontend releaseService.ts
    if RELEASE_SERVICE_PATH.exists():
        src = RELEASE_SERVICE_PATH.read_text(encoding="utf-8")
        src, count = re.subn(
            r"(export const APP_CURRENT_VERSION\s*=\s*')[^']+(')",
            rf"\g<1>{clean_ver}\g<2>",
            src,
            count=1,
        )
        if count != 1:
            raise RuntimeError(f"Could not update APP_CURRENT_VERSION in {RELEASE_SERVICE_PATH}")
        RELEASE_SERVICE_PATH.write_text(src, encoding="utf-8")

    # 7. Inno Setup script (legacy/auxiliary Windows launcher)
    if SETUP_ISS_PATH.exists():
        iss = SETUP_ISS_PATH.read_text(encoding="utf-8")
        iss = re.sub(r'#define MyAppVersion\s+"[^"]+"', f'#define MyAppVersion "{clean_ver}"', iss)
        iss = re.sub(r"OutputBaseFilename=LanternEd-Setup-[^\s]+", f"OutputBaseFilename=LanternEd-Setup-{clean_ver}", iss)
        SETUP_ISS_PATH.write_text(iss, encoding="utf-8")

    # 8. releases/manifest.json
    _update_manifest_metadata(clean_ver, notes=notes)


def verify_all_versions(expected_version: str, expected_code: int) -> None:
    clean_ver = expected_version.lstrip("v")
    ios_ver = base_numeric_version(clean_ver)
    errors: list[str] = []

    pkg = json.loads(PKG_JSON_PATH.read_text(encoding="utf-8"))
    if pkg.get("version") != clean_ver:
        errors.append(f"frontend/package.json={pkg.get('version')!r} != {clean_ver!r}")

    tauri_conf = json.loads(TAURI_CONF_PATH.read_text(encoding="utf-8"))
    if tauri_conf.get("version") != clean_ver:
        errors.append(f"tauri.conf.json={tauri_conf.get('version')!r} != {clean_ver!r}")

    cargo_m = re.search(r'^version\s*=\s*"([^"]+)"', CARGO_TOML_PATH.read_text(encoding="utf-8"), re.MULTILINE)
    if not cargo_m or cargo_m.group(1) != clean_ver:
        errors.append(f"Cargo.toml={cargo_m.group(1) if cargo_m else None!r} != {clean_ver!r}")

    gradle_txt = ANDROID_GRADLE_PATH.read_text(encoding="utf-8")
    vc_m = re.search(r"\bversionCode\s+(\d+)", gradle_txt)
    vn_m = re.search(r'\bversionName\s+"([^"]+)"', gradle_txt)
    if not vc_m or int(vc_m.group(1)) != expected_code:
        errors.append(f"build.gradle versionCode={vc_m.group(1) if vc_m else None!r} != {expected_code}")
    if not vn_m or vn_m.group(1) != clean_ver:
        errors.append(f"build.gradle versionName={vn_m.group(1) if vn_m else None!r} != {clean_ver!r}")

    pbx_txt = IOS_PBXPROJ_PATH.read_text(encoding="utf-8")
    mkt_vals = set(re.findall(r"\bMARKETING_VERSION\s*=\s*([^;]+);", pbx_txt))
    cur_vals = set(re.findall(r"\bCURRENT_PROJECT_VERSION\s*=\s*([^;]+);", pbx_txt))
    if mkt_vals != {ios_ver}:
        errors.append(f"project.pbxproj MARKETING_VERSION={mkt_vals!r} != {{{ios_ver!r}}}")
    if cur_vals != {str(expected_code)}:
        errors.append(f"project.pbxproj CURRENT_PROJECT_VERSION={cur_vals!r} != {{{str(expected_code)!r}}}")

    if RELEASE_SERVICE_PATH.exists():
        rs_m = re.search(r"export const APP_CURRENT_VERSION\s*=\s*'([^']+)'", RELEASE_SERVICE_PATH.read_text(encoding="utf-8"))
        if not rs_m or rs_m.group(1) != clean_ver:
            errors.append(f"releaseService.ts={rs_m.group(1) if rs_m else None!r} != {clean_ver!r}")

    if MANIFEST_PATH.exists():
        man = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if man.get("version") != clean_ver:
            errors.append(f"releases/manifest.json={man.get('version')!r} != {clean_ver!r}")

    if errors:
        raise RuntimeError("Version mismatch across targets:\n  - " + "\n  - ".join(errors))


def cmd_sync_version(args: argparse.Namespace) -> None:
    clean_ver = args.version.lstrip("v")
    code = args.version_code or compute_version_code(clean_ver)
    sync_all_versions(clean_ver, code, notes=args.notes)
    verify_all_versions(clean_ver, code)
    print(f"[OK] Synchronized version {clean_ver} (build code {code}) across web, desktop, Android, iOS, and manifest.")


def cmd_verify_versions(args: argparse.Namespace) -> None:
    clean_ver = args.version.lstrip("v")
    code = args.version_code or compute_version_code(clean_ver)
    verify_all_versions(clean_ver, code)
    print(f"[OK] Verified all platform configs match version {clean_ver} (build code {code}).")


def _collect_commits(prev_tag: str, head_ref: str) -> list[tuple[str, str, str]]:
    rev_range = f"{prev_tag}..{head_ref}" if prev_tag else head_ref
    raw = run_git(["log", "--no-merges", rev_range, "--pretty=format:%h%x1f%s%x1f%b%x1e"], check=False)
    commits: list[tuple[str, str, str]] = []
    for record in raw.split("\x1e"):
        record = record.strip()
        if not record:
            continue
        parts = record.split("\x1f")
        short_sha = parts[0].strip()
        subject = parts[1].strip() if len(parts) > 1 else ""
        body = parts[2].strip() if len(parts) > 2 else ""
        if not subject:
            continue
        if "[skip ci]" in subject or subject.lower().startswith("chore(release):"):
            continue
        commits.append((short_sha, subject, body))
    return commits


def format_conventional_notes(commits: list[tuple[str, str, str]]) -> str:
    added: list[str] = []
    fixed: list[str] = []
    changed: list[str] = []
    breaking: list[str] = []

    for sha, subject, body in commits:
        m = CONVENTIONAL_RE.match(subject)
        is_breaking = bool("BREAKING CHANGE:" in body or (m and m.group("breaking")))
        if m:
            ctype = m.group("type").lower()
            scope = m.group("scope")
            desc = m.group("desc").strip()
            bullet = f"- **{scope}:** {desc} (`{sha}`)" if scope else f"- {desc} (`{sha}`)"
            if is_breaking:
                breaking.append(bullet)
            if ctype == "feat":
                added.append(bullet)
            elif ctype == "fix":
                fixed.append(bullet)
            else:
                changed.append(bullet)
        else:
            bullet = f"- {subject} (`{sha}`)"
            if is_breaking:
                breaking.append(bullet)
            changed.append(bullet)

    sections: list[str] = []
    if breaking:
        sections.append("### Breaking Changes\n\n" + "\n".join(breaking))
    if added:
        sections.append("### Added\n\n" + "\n".join(added))
    if fixed:
        sections.append("### Fixed\n\n" + "\n".join(fixed))
    if changed:
        sections.append("### Changed / Maintenance\n\n" + "\n".join(changed))

    if not sections:
        sections.append("### Changed / Maintenance\n\n- Synchronized cross-platform web bundle and maintenance release.")

    return "\n\n".join(sections).strip()


def _extract_existing_changelog_section(changelog_text: str, version: str) -> str | None:
    pattern = rf"##\s*\[v?{re.escape(version)}\][^\n]*\n([\s\S]*?)(?=\n##\s*\[|\Z)"
    m = re.search(pattern, changelog_text)
    if not m:
        return None
    body = m.group(1).strip()
    if body.endswith("---"):
        body = body[:-3].strip()
    return body


def _upsert_changelog_section(changelog_text: str, version: str, body: str, release_date: str) -> str:
    header_line = f"## [v{version}] — {release_date}"
    new_block = f"{header_line}\n\n{body.strip()}\n\n---"

    existing_re = re.compile(rf"##\s*\[v?{re.escape(version)}\][^\n]*\n[\s\S]*?(?=\n##\s*\[|\Z)")
    if existing_re.search(changelog_text):
        updated = existing_re.sub(new_block + "\n", changelog_text, count=1)
        return updated.rstrip() + "\n"

    # Insert right after the top-level document header + first '---' separator
    sep_match = re.search(r"^---\s*$", changelog_text, re.MULTILINE)
    if sep_match:
        idx = sep_match.end()
        prefix = changelog_text[:idx].rstrip()
        suffix = changelog_text[idx:].lstrip()
        return f"{prefix}\n\n{new_block}\n\n{suffix}".rstrip() + "\n"

    return f"# LanternED — Changelog & Cross-Platform Release Notes\n\n---\n\n{new_block}\n\n{changelog_text.lstrip()}"


def cmd_generate_changelog(args: argparse.Namespace) -> None:
    clean_ver = args.version.lstrip("v")
    prev_tag = (args.prev_tag or "").strip()
    head_ref = (args.head_ref or "HEAD").strip()

    changelog_text = CHANGELOG_PATH.read_text(encoding="utf-8") if CHANGELOG_PATH.exists() else ""
    existing_body = _extract_existing_changelog_section(changelog_text, clean_ver) if args.preserve_existing else None

    if existing_body is not None:
        notes_body = existing_body
    else:
        commits = _collect_commits(prev_tag, head_ref)
        notes_body = format_conventional_notes(commits)
        if args.update_changelog:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            updated = _upsert_changelog_section(changelog_text, clean_ver, notes_body, today)
            CHANGELOG_PATH.write_text(updated, encoding="utf-8")

    if args.output_notes:
        out_path = Path(args.output_notes)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(notes_body.strip() + "\n", encoding="utf-8")

    print(notes_body)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def _canonical_artifact_name(platform: str, src_path: Path, version: str) -> str:
    name_lower = src_path.name.lower()
    if platform == "windows":
        if name_lower.endswith(".exe"):
            return f"LanternEd-Setup-{version}.exe"
        if name_lower.endswith(".msi"):
            return f"LanternEd-{version}-x64.msi"
    elif platform == "macos":
        if name_lower.endswith(".dmg"):
            return f"LanternEd-{version}-universal.dmg"
        if name_lower.endswith(".app.zip") or name_lower.endswith(".zip"):
            return f"LanternEd-{version}-macos-universal.app.zip"
    elif platform == "android":
        if name_lower.endswith(".apk"):
            return f"LanternEd-v{version}.apk"
        if name_lower.endswith(".aab"):
            return f"LanternEd-v{version}.aab"
    elif platform == "ios":
        if name_lower.endswith(".ipa"):
            return f"LanternEd-v{version}.ipa"
        if name_lower.endswith(".xcarchive.zip"):
            return f"LanternEd-v{version}-ios.xcarchive.zip"
    return src_path.name


PRIMARY_EXTS = {
    "windows": ".exe",
    "macos": ".dmg",
    "android": ".apk",
    "ios": ".ipa",
}


def cmd_stage_release(args: argparse.Namespace) -> None:
    clean_ver = args.version.lstrip("v")
    tag = args.tag if args.tag.startswith("v") else f"v{args.tag}"
    input_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    platforms_manifest: dict[str, Any] = {}
    checksum_lines: list[str] = []
    manifest_data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {"platforms": {}}

    for plat in VALID_PLATFORMS:
        candidates = [input_dir / f"platform-{plat}", input_dir / plat]
        plat_dir = next((c for c in candidates if c.exists()), None)
        if not plat_dir:
            continue

        plat_files = sorted([p for p in plat_dir.rglob("*") if p.is_file()])
        if not plat_files:
            continue

        artifacts_info: list[dict[str, Any]] = []
        primary_info: dict[str, Any] | None = None

        for src in plat_files:
            dest_name = _canonical_artifact_name(plat, src, clean_ver)
            dest = output_dir / dest_name
            shutil.copy2(src, dest)
            sha = _sha256_file(dest)
            size_bytes = dest.stat().st_size
            item = {
                "fileName": dest_name,
                "sizeBytes": size_bytes,
                "sizeMb": round(size_bytes / (1024 * 1024), 2),
                "sha256": sha,
            }
            artifacts_info.append(item)
            checksum_lines.append(f"{sha}  {dest_name}")
            if dest_name.lower().endswith(PRIMARY_EXTS[plat]):
                primary_info = item

        if not primary_info and artifacts_info:
            primary_info = artifacts_info[0]

        platforms_manifest[plat] = {
            "primaryArtifact": primary_info["fileName"] if primary_info else None,
            "artifacts": artifacts_info,
        }

        if primary_info and plat in manifest_data.get("platforms", {}):
            cfg = manifest_data["platforms"][plat]
            cfg["version"] = clean_ver
            cfg["fileName"] = primary_info["fileName"]
            cfg["fileSizeMb"] = round(primary_info["sizeBytes"] / (1024 * 1024), 1)
            cfg["sha256"] = primary_info["sha256"]
            plat_rel = RELEASES_DIR / plat / "release.json"
            if plat_rel.exists():
                plat_rel.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")

    if not checksum_lines:
        raise RuntimeError(f"No platform artifacts found under {input_dir}")

    checksum_lines.sort(key=lambda line: line.split("  ", 1)[1])
    sha_file = output_dir / "SHA256SUMS.txt"
    sha_file.write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    built_at = datetime.now(timezone.utc).isoformat()
    release_manifest = {
        "version": clean_ver,
        "tag": tag,
        "commit": args.commit,
        "builtAt": built_at,
        "platforms": platforms_manifest,
    }
    rel_manifest_file = output_dir / "release-manifest.json"
    rel_manifest_file.write_text(json.dumps(release_manifest, indent=2) + "\n", encoding="utf-8")

    if MANIFEST_PATH.exists():
        manifest_data["version"] = clean_ver
        manifest_data["releaseDate"] = built_at
        MANIFEST_PATH.write_text(json.dumps(manifest_data, indent=2) + "\n", encoding="utf-8")

    print(f"[OK] Staged {len(checksum_lines)} artifact(s) + SHA256SUMS.txt + release-manifest.json in {output_dir}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="LanternED CI/CD release helper")
    sub = parser.add_subparsers(dest="command", required=True)

    p_next = sub.add_parser("next-version", help="Compute next SemVer and build code")
    p_next.add_argument("--bump", default="patch", choices=["patch", "minor", "major", "none"])
    p_next.add_argument("--explicit-tag", default="")
    p_next.add_argument("--github-output", type=Path, default=None)
    p_next.set_defaults(func=cmd_next_version)

    p_mat = sub.add_parser("matrix", help="Compute platform build matrix JSON")
    p_mat.add_argument("--targets", default="all")
    p_mat.add_argument("--github-output", type=Path, default=None)
    p_mat.set_defaults(func=cmd_matrix)

    p_sync = sub.add_parser("sync-version", help="Sync version across web, desktop, Android, iOS, and manifest")
    p_sync.add_argument("--version", required=True)
    p_sync.add_argument("--version-code", type=int, default=None)
    p_sync.add_argument("--notes", default=None)
    p_sync.set_defaults(func=cmd_sync_version)

    p_ver = sub.add_parser("verify-versions", help="Verify all platform configs match expected version")
    p_ver.add_argument("--version", required=True)
    p_ver.add_argument("--version-code", type=int, default=None)
    p_ver.set_defaults(func=cmd_verify_versions)

    p_chg = sub.add_parser("generate-changelog", help="Generate Conventional Commits release notes & update CHANGELOG.md")
    p_chg.add_argument("--version", required=True)
    p_chg.add_argument("--prev-tag", default="")
    p_chg.add_argument("--head-ref", default="HEAD")
    p_chg.add_argument("--output-notes", default="")
    p_chg.add_argument("--update-changelog", action="store_true")
    p_chg.add_argument("--preserve-existing", action="store_true")
    p_chg.set_defaults(func=cmd_generate_changelog)

    p_stg = sub.add_parser("stage-release", help="Stage platform artifacts, SHA256SUMS.txt, and release-manifest.json")
    p_stg.add_argument("--input-dir", required=True)
    p_stg.add_argument("--output-dir", required=True)
    p_stg.add_argument("--version", required=True)
    p_stg.add_argument("--tag", required=True)
    p_stg.add_argument("--commit", required=True)
    p_stg.set_defaults(func=cmd_stage_release)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
