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
    if args.version:
        clean_ver = args.version.lstrip("v")
    else:
        pkg = json.loads(PKG_JSON_PATH.read_text(encoding="utf-8"))
        clean_ver = str(pkg["version"]).lstrip("v")
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

DEFAULT_KEEP_VERSIONS = 2

ARTIFACT_SUFFIXES = (
    "-macos-universal.app.zip",
    "-ios.xcarchive.zip",
    "-universal.dmg",
    "-x64.msi",
    ".xcarchive.zip",
    ".app.zip",
    ".tar.gz",
    ".exe",
    ".msi",
    ".dmg",
    ".apk",
    ".aab",
    ".ipa",
)


def extract_version_from_artifact_name(filename: str) -> str | None:
    """Extracts canonical SemVer from a platform installer filename, ignoring non-binary metadata."""
    lower = filename.lower()
    matched_suffix = next((s for s in ARTIFACT_SUFFIXES if lower.endswith(s)), None)
    if not matched_suffix:
        return None

    stem = filename[: len(filename) - len(matched_suffix)]
    m = re.search(
        r"(?:^|[-_])v?(?P<ver>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$",
        stem,
    )
    if not m:
        return None
    ver = m.group("ver")
    try:
        parse_semver(ver)
    except ValueError:
        return None
    return ver


def prune_platform_dir(
    plat_dir: Path,
    *,
    keep: int = DEFAULT_KEEP_VERSIONS,
    preserve_version: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Retains only the newest ``keep`` SemVer versions of installers inside a platform directory."""
    if keep < 1:
        raise ValueError(f"keep must be >= 1, got {keep}")
    if not plat_dir.exists():
        return {"kept_versions": [], "removed_files": []}

    grouped: dict[str, list[Path]] = {}
    for entry in sorted(plat_dir.iterdir()):
        if not entry.is_file():
            continue
        ver = extract_version_from_artifact_name(entry.name)
        if not ver:
            continue
        grouped.setdefault(ver, []).append(entry)

    ordered_versions = sorted(grouped.keys(), key=semver_sort_key, reverse=True)
    kept_versions: list[str] = []

    clean_preserve = preserve_version.lstrip("v") if preserve_version else None
    if clean_preserve and clean_preserve in grouped:
        kept_versions.append(clean_preserve)

    for ver in ordered_versions:
        if ver in kept_versions:
            continue
        if len(kept_versions) >= keep:
            break
        kept_versions.append(ver)

    kept_versions.sort(key=semver_sort_key, reverse=True)
    kept_set = set(kept_versions)

    removed_files: list[str] = []
    for ver in ordered_versions:
        if ver in kept_set:
            continue
        for file_path in grouped[ver]:
            if not dry_run:
                file_path.unlink()
            removed_files.append(file_path.name)

    return {"kept_versions": kept_versions, "removed_files": removed_files}


def prune_local_releases(
    releases_root: Path,
    *,
    keep: int = DEFAULT_KEEP_VERSIONS,
    preserve_version: str | None = None,
    dry_run: bool = False,
) -> dict[str, dict[str, Any]]:
    """Enforces the latest-N-versions retention policy uniformly across all 4 app directories."""
    summary: dict[str, dict[str, Any]] = {}
    for plat in VALID_PLATFORMS:
        summary[plat] = prune_platform_dir(
            releases_root / plat,
            keep=keep,
            preserve_version=preserve_version,
            dry_run=dry_run,
        )
    return summary


def select_releases_to_prune(
    releases: list[dict[str, Any]],
    *,
    keep: int = DEFAULT_KEEP_VERSIONS,
    preserve_tag: str = "",
    include_drafts: bool = False,
) -> tuple[list[str], list[str]]:
    """Returns (kept_tags, delete_tags) keeping at most ``keep`` newest SemVer releases."""
    if keep < 1:
        raise ValueError(f"keep must be >= 1, got {keep}")

    clean_preserve = preserve_tag.strip()
    candidates: list[str] = []
    for rel in releases:
        tag = str(rel.get("tagName") or rel.get("tag_name") or "").strip()
        is_draft = bool(rel.get("isDraft") if "isDraft" in rel else rel.get("draft", False))
        if not tag or not SEMVER_RE.match(tag):
            continue
        if is_draft and not include_drafts and tag != clean_preserve:
            continue
        candidates.append(tag)

    unique_sorted = sorted(dict.fromkeys(candidates), key=semver_sort_key, reverse=True)
    kept: list[str] = []
    if clean_preserve and clean_preserve in unique_sorted:
        kept.append(clean_preserve)

    for tag in unique_sorted:
        if tag in kept:
            continue
        if len(kept) >= keep:
            break
        kept.append(tag)

    kept.sort(key=semver_sort_key, reverse=True)
    kept_set = set(kept)
    to_delete = [tag for tag in unique_sorted if tag not in kept_set]
    return kept, to_delete


def _collect_staged_platform_files(
    input_dir: Path,
    clean_ver: str,
    *,
    include_secondary: bool = False,
) -> dict[str, list[tuple[Path, str, bool]]]:
    """Collects (source_path, canonical_filename, is_primary) items grouped by platform."""
    collected: dict[str, list[tuple[Path, str, bool]]] = {}
    for plat in VALID_PLATFORMS:
        candidates = [input_dir / f"platform-{plat}", input_dir / plat]
        plat_dir = next((c for c in candidates if c.exists()), None)
        if not plat_dir:
            continue
        files = sorted([p for p in plat_dir.rglob("*") if p.is_file()])
        if not files:
            continue

        mapped = [(src, _canonical_artifact_name(plat, src, clean_ver)) for src in files]
        primary_ext = PRIMARY_EXTS[plat]
        primary_names = {dest for _, dest in mapped if dest.lower().endswith(primary_ext)}
        if not primary_names and mapped:
            primary_names = {mapped[0][1]}

        selected: list[tuple[Path, str, bool]] = []
        for src, dest in mapped:
            is_primary = dest in primary_names
            if include_secondary or is_primary:
                selected.append((src, dest, is_primary))
        if selected:
            collected[plat] = selected
    return collected


def install_local_releases(
    input_dir: Path,
    version: str,
    *,
    releases_dir: Path | None = None,
    keep: int = DEFAULT_KEEP_VERSIONS,
    include_secondary: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Installs built platform installers into releases/<plat>/, updates manifest checksums, and prunes to keep N."""
    clean_ver = version.lstrip("v")
    parse_semver(clean_ver)
    target_releases = (releases_dir or RELEASES_DIR).resolve()
    target_releases.mkdir(parents=True, exist_ok=True)
    manifest_file = target_releases / "manifest.json"
    manifest_data = (
        json.loads(manifest_file.read_text(encoding="utf-8"))
        if manifest_file.exists()
        else {"version": clean_ver, "releaseDate": "", "releaseNotes": "", "platforms": {}}
    )

    collected = _collect_staged_platform_files(input_dir.resolve(), clean_ver, include_secondary=include_secondary)
    installed: dict[str, list[str]] = {}
    for plat, items in collected.items():
        plat_dir = target_releases / plat
        if not dry_run:
            plat_dir.mkdir(parents=True, exist_ok=True)
        installed[plat] = []
        primary_stats: tuple[str, int, str] | None = None

        for src, dest_name, is_primary in items:
            dest_path = plat_dir / dest_name
            if not dry_run:
                shutil.copy2(src, dest_path)
            sha = _sha256_file(src if dry_run else dest_path)
            size_bytes = (src if dry_run else dest_path).stat().st_size
            installed[plat].append(dest_name)
            if is_primary or primary_stats is None:
                primary_stats = (dest_name, size_bytes, sha)

        if primary_stats:
            fname, size_bytes, sha = primary_stats
            cfg = manifest_data.setdefault("platforms", {}).setdefault(plat, {})
            cfg["version"] = clean_ver
            cfg["fileName"] = fname
            cfg["fileSizeMb"] = round(size_bytes / (1024 * 1024), 1)
            cfg["sha256"] = sha
            if not dry_run:
                (plat_dir / "release.json").write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")

    manifest_data["version"] = clean_ver
    manifest_data["releaseDate"] = datetime.now(timezone.utc).isoformat()
    if not dry_run:
        manifest_file.write_text(json.dumps(manifest_data, indent=2) + "\n", encoding="utf-8")
        if CHANGELOG_PATH.exists():
            shutil.copy2(CHANGELOG_PATH, target_releases / "CHANGELOG.md")

    prune_summary = prune_local_releases(
        target_releases,
        keep=keep,
        preserve_version=clean_ver,
        dry_run=dry_run,
    )
    return {"version": clean_ver, "installed": installed, "pruned": prune_summary}


def mirror_releases_tree(
    source_releases: Path,
    mirror_dir: Path,
    *,
    keep: int = DEFAULT_KEEP_VERSIONS,
    preserve_version: str | None = None,
    dry_run: bool = False,
) -> dict[str, dict[str, Any]]:
    """Synchronizes local releases/ content into a mirror repo directory while preserving repo files & keep-N rule."""
    src_root = source_releases.resolve()
    dst_root = mirror_dir.resolve()
    if not dry_run:
        dst_root.mkdir(parents=True, exist_ok=True)
        for plat in VALID_PLATFORMS:
            src_plat = src_root / plat
            dst_plat = dst_root / plat
            if src_plat.exists():
                if dst_plat.exists():
                    shutil.rmtree(dst_plat)
                shutil.copytree(src_plat, dst_plat)
        for fname in ("manifest.json", "CHANGELOG.md"):
            src_file = src_root / fname
            if src_file.exists():
                shutil.copy2(src_file, dst_root / fname)
        for optional_name in ("LICENSE",):
            src_opt = src_root / optional_name
            dst_opt = dst_root / optional_name
            if src_opt.exists() and not dst_opt.exists():
                shutil.copy2(src_opt, dst_opt)

    return prune_local_releases(
        dst_root,
        keep=keep,
        preserve_version=preserve_version,
        dry_run=dry_run,
    )


def _run_step(cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"$ ({cwd}) {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=str(cwd), env=env, text=True, check=check)


def _host_native_platforms() -> list[str]:
    if sys.platform.startswith("win"):
        return ["windows", "android"]
    if sys.platform == "darwin":
        return ["macos", "ios", "android"]
    return ["android"]


def _npm_exe() -> str:
    return "npm.cmd" if sys.platform.startswith("win") else "npm"


def _npx_exe() -> str:
    return "npx.cmd" if sys.platform.startswith("win") else "npx"


def _fetch_missing_from_release(
    target_dir: Path,
    platforms: list[str],
    release_ref: str,
    version: str,
    repo: str = "yynvr1408/LanternEd-App-Releases",
) -> list[str]:
    """Downloads missing cross-OS platform installers from a GitHub Release into target_dir/platform-<plat>/."""
    import urllib.error
    import urllib.request

    name_templates = {
        "windows": f"LanternEd-Setup-{version}.exe",
        "macos": f"LanternEd-{version}-universal.dmg",
        "android": f"LanternEd-v{version}.apk",
        "ios": f"LanternEd-v{version}.ipa",
    }
    base_url = (
        f"https://github.com/{repo}/releases/latest/download"
        if release_ref == "latest"
        else f"https://github.com/{repo}/releases/download/{release_ref}"
    )
    fetched: list[str] = []
    for plat in platforms:
        fname = name_templates[plat]
        url = f"{base_url}/{fname}"
        dest_dir = target_dir / f"platform-{plat}"
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_file = dest_dir / fname
        try:
            print(f"[fetch] Downloading {plat}: {url}")
            urllib.request.urlretrieve(url, dest_file)
            fetched.append(plat)
        except urllib.error.URLError as exc:
            print(f"[warn] Could not fetch {plat} from {url}: {exc}")
    return fetched


def cmd_install_local_releases(args: argparse.Namespace) -> None:
    res = install_local_releases(
        Path(args.input_dir),
        args.version,
        releases_dir=Path(args.releases_dir) if args.releases_dir else RELEASES_DIR,
        keep=args.keep,
        include_secondary=args.include_secondary,
        dry_run=args.dry_run,
    )
    print(json.dumps(res, indent=2))


def cmd_prune_releases(args: argparse.Namespace) -> None:
    releases_root = Path(args.releases_dir).resolve()
    summary = prune_local_releases(
        releases_root,
        keep=args.keep,
        preserve_version=args.preserve_version or None,
        dry_run=args.dry_run,
    )
    payload: dict[str, Any] = {"local": summary}
    if args.mirror_dir:
        payload["mirror"] = mirror_releases_tree(
            releases_root,
            Path(args.mirror_dir),
            keep=args.keep,
            preserve_version=args.preserve_version or None,
            dry_run=args.dry_run,
        )
    print(json.dumps(payload, indent=2))


def cmd_prune_github_releases(args: argparse.Namespace) -> None:
    res = subprocess.run(
        ["gh", "release", "list", "--repo", args.repo, "--limit", "100", "--json", "tagName,isDraft,isPrerelease,createdAt"],
        capture_output=True,
        text=True,
        check=True,
    )
    releases = json.loads(res.stdout or "[]")
    kept, to_delete = select_releases_to_prune(
        releases,
        keep=args.keep,
        preserve_tag=args.preserve_tag,
        include_drafts=args.include_drafts,
    )
    for tag in to_delete:
        if args.dry_run:
            print(f"[DRY RUN] Would delete GitHub release {tag} from {args.repo} (cleanup_tag={args.cleanup_tag})")
        else:
            cmd = ["gh", "release", "delete", tag, "--repo", args.repo, "--yes"]
            if args.cleanup_tag:
                cmd.append("--cleanup-tag")
            subprocess.run(cmd, check=True)
    print(json.dumps({"repo": args.repo, "kept": kept, "deleted": to_delete, "dry_run": args.dry_run}, indent=2))


def cmd_local_build(args: argparse.Namespace) -> None:
    """Builds web dist + local host-supported app packages into releases/<plat>/ while keeping latest N versions."""
    if args.version:
        clean_ver = args.version.lstrip("v")
        parse_semver(clean_ver)
    elif args.bump != "none":
        baseline = current_baseline_version()
        maj, min_, pat, _ = parse_semver(baseline)
        if args.bump == "major":
            clean_ver = f"{maj + 1}.0.0"
        elif args.bump == "minor":
            clean_ver = f"{maj}.{min_ + 1}.0"
        else:
            clean_ver = f"{maj}.{min_}.{pat + 1}"
    else:
        clean_ver = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")).get("version") or current_baseline_version()

    version_code = compute_version_code(clean_ver)
    native_supported = _host_native_platforms()
    raw_targets = (args.targets or "auto").strip().lower()
    if raw_targets == "auto":
        selected_targets = list(native_supported)
    else:
        selected_targets = parse_targets(raw_targets)

    print(f"[local-build] Target version: v{clean_ver} (code {version_code}); host native targets={native_supported}; requested={selected_targets}")
    if args.dry_run:
        summary = prune_local_releases(RELEASES_DIR, keep=args.keep, preserve_version=clean_ver, dry_run=True)
        print(json.dumps({"version": clean_ver, "targets": selected_targets, "prune_preview": summary}, indent=2))
        return

    sync_all_versions(clean_ver, version_code)
    npm = _npm_exe()
    npx = _npx_exe()

    if not (FRONTEND_DIR / "node_modules").exists():
        _run_step([npm, "ci"], cwd=FRONTEND_DIR)
    if not args.skip_tests:
        _run_step([npx, "oxlint"], cwd=FRONTEND_DIR)
        _run_step([npx, "tsc", "-b"], cwd=FRONTEND_DIR)
        _run_step([npx, "vitest", "run"], cwd=FRONTEND_DIR)
    if not args.skip_web_build:
        _run_step([npx, "vite", "build"], cwd=FRONTEND_DIR)

    import tempfile

    with tempfile.TemporaryDirectory(prefix="lanterned-local-") as tmp:
        stage_in = Path(tmp)
        unbuildable: list[str] = []

        for plat in selected_targets:
            if plat not in native_supported:
                unbuildable.append(plat)
                print(f"[skip] Platform '{plat}' cannot compile natively on this host ({sys.platform}).")
                continue

            pdir = stage_in / f"platform-{plat}"
            pdir.mkdir(parents=True, exist_ok=True)
            ci_cfg = str(FRONTEND_DIR / "src-tauri" / "tauri.ci.conf.json")

            if plat == "windows":
                _run_step([npx, "tauri", "build", "--ci", "--config", ci_cfg, "--target", "x86_64-pc-windows-msvc", "--bundles", "nsis", "--no-sign"], cwd=FRONTEND_DIR)
                nsis_dir = FRONTEND_DIR / "src-tauri" / "target" / "x86_64-pc-windows-msvc" / "release" / "bundle" / "nsis"
                for exe in sorted(nsis_dir.glob("*.exe")):
                    shutil.copy2(exe, pdir / exe.name)
            elif plat == "macos":
                _run_step([npx, "tauri", "build", "--ci", "--config", ci_cfg, "--target", "universal-apple-darwin", "--bundles", "dmg", "--no-sign"], cwd=FRONTEND_DIR)
                dmg_dir = FRONTEND_DIR / "src-tauri" / "target" / "universal-apple-darwin" / "release" / "bundle" / "dmg"
                for dmg in sorted(dmg_dir.glob("*.dmg")):
                    shutil.copy2(dmg, pdir / dmg.name)
            elif plat == "android":
                _run_step([npx, "cap", "sync", "android"], cwd=FRONTEND_DIR)
                android_dir = FRONTEND_DIR / "android"
                gradlew = str(android_dir / ("gradlew.bat" if sys.platform.startswith("win") else "gradlew"))
                _run_step([gradlew, "assembleRelease"], cwd=android_dir)
                apk_root = android_dir / "app" / "build" / "outputs" / "apk"
                apks = sorted(apk_root.rglob("*.apk"))
                if apks:
                    shutil.copy2(apks[0], pdir / apks[0].name)
            elif plat == "ios":
                _run_step([npx, "cap", "sync", "ios"], cwd=FRONTEND_DIR)
                ios_dir = FRONTEND_DIR / "ios" / "App"
                proj_flag = ["-workspace", "App.xcworkspace"] if (ios_dir / "App.xcworkspace").exists() else ["-project", "App.xcodeproj"]
                _run_step(
                    [
                        "xcodebuild",
                        *proj_flag,
                        "-scheme",
                        "App",
                        "-configuration",
                        "Release",
                        "-destination",
                        "generic/platform=iOS",
                        "CODE_SIGNING_ALLOWED=NO",
                        "CODE_SIGNING_REQUIRED=NO",
                        f"SYMROOT={ios_dir / 'build'}",
                        "clean",
                        "build",
                    ],
                    cwd=ios_dir,
                )
                payload_dir = ios_dir / "build" / "Release-iphoneos" / "Payload"
                payload_dir.mkdir(parents=True, exist_ok=True)
                shutil.copytree(ios_dir / "build" / "Release-iphoneos" / "App.app", payload_dir / "App.app", dirs_exist_ok=True)
                shutil.make_archive(str(pdir / f"LanternEd-v{clean_ver}"), "zip", root_dir=str(ios_dir / "build" / "Release-iphoneos"), base_dir="Payload")
                (pdir / f"LanternEd-v{clean_ver}.zip").rename(pdir / f"LanternEd-v{clean_ver}.ipa")

        if unbuildable and args.fetch_missing_from_release:
            _fetch_missing_from_release(stage_in, unbuildable, args.fetch_missing_from_release, clean_ver)

        res = install_local_releases(
            stage_in,
            clean_ver,
            releases_dir=RELEASES_DIR,
            keep=args.keep,
            dry_run=False,
        )
        print(json.dumps(res, indent=2))


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
    collected = _collect_staged_platform_files(input_dir, clean_ver, include_secondary=True)

    for plat, items in collected.items():
        artifacts_info: list[dict[str, Any]] = []
        primary_info: dict[str, Any] | None = None

        for src, dest_name, is_primary in items:
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
            if is_primary:
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
        notes_file = getattr(args, "notes_file", None)
        if notes_file and Path(notes_file).exists():
            raw_notes = Path(notes_file).read_text(encoding="utf-8").strip()
            bullets = [
                ln.lstrip("- ").strip()
                for ln in raw_notes.splitlines()
                if ln.strip().startswith("- ")
            ]
            if bullets:
                summary = "; ".join(bullets[:4])
                manifest_data["releaseNotes"] = f"LanternED v{clean_ver}: {summary}"
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
    p_ver.add_argument("--version", default="")
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
    p_stg.add_argument("--notes-file", default="")
    p_stg.set_defaults(func=cmd_stage_release)

    p_inst = sub.add_parser("install-local-releases", help="Copy built installers into releases/<plat>/, update hashes, and keep latest N versions")
    p_inst.add_argument("--input-dir", required=True)
    p_inst.add_argument("--version", required=True)
    p_inst.add_argument("--releases-dir", default="")
    p_inst.add_argument("--keep", type=int, default=DEFAULT_KEEP_VERSIONS)
    p_inst.add_argument("--include-secondary", action="store_true")
    p_inst.add_argument("--dry-run", action="store_true")
    p_inst.set_defaults(func=cmd_install_local_releases)

    p_prune = sub.add_parser("prune-releases", help="Prune local releases/<plat>/ (and optional mirror repo) to latest N versions")
    p_prune.add_argument("--releases-dir", default=str(RELEASES_DIR))
    p_prune.add_argument("--mirror-dir", default="")
    p_prune.add_argument("--keep", type=int, default=DEFAULT_KEEP_VERSIONS)
    p_prune.add_argument("--preserve-version", default="")
    p_prune.add_argument("--dry-run", action="store_true")
    p_prune.set_defaults(func=cmd_prune_releases)

    p_gh = sub.add_parser("prune-github-releases", help="Prune GitHub Releases on a repository to latest N versions")
    p_gh.add_argument("--repo", required=True)
    p_gh.add_argument("--keep", type=int, default=DEFAULT_KEEP_VERSIONS)
    p_gh.add_argument("--preserve-tag", default="")
    p_gh.add_argument("--include-drafts", action="store_true")
    p_gh.add_argument("--cleanup-tag", action="store_true")
    p_gh.add_argument("--dry-run", action="store_true")
    p_gh.set_defaults(func=cmd_prune_github_releases)

    p_loc = sub.add_parser("local-build", help="Build shared web dist + native builds into releases/ with keep-N retention")
    p_loc.add_argument("--version", default="")
    p_loc.add_argument("--bump", default="none", choices=["patch", "minor", "major", "none"])
    p_loc.add_argument("--targets", default="auto", help="'auto' (host-native), 'all', or comma-separated targets")
    p_loc.add_argument("--keep", type=int, default=DEFAULT_KEEP_VERSIONS)
    p_loc.add_argument("--fetch-missing-from-release", default="", help="Optional release tag (e.g. 'latest' or 'v0.1.6') to fetch non-host builds")
    p_loc.add_argument("--skip-tests", action="store_true")
    p_loc.add_argument("--skip-web-build", action="store_true")
    p_loc.add_argument("--dry-run", action="store_true")
    p_loc.set_defaults(func=cmd_local_build)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
