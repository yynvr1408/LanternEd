import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[3]
CI_RELEASE_PATH = ROOT_DIR / "scripts" / "ci_release.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("ci_release", CI_RELEASE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_semver_parsing_and_targets():
    mod = _load_module()
    assert mod.parse_semver("v1.2.3") == (1, 2, 3, "")
    assert mod.parse_semver("0.2.0-rc.1") == (0, 2, 0, "rc.1")
    assert mod.compute_version_code("0.1.6") == 106
    assert mod.compute_version_code("1.2.3") == 10203
    assert mod.parse_targets("all") == ["windows", "macos", "ios", "android"]
    assert mod.parse_targets("android, windows") == ["android", "windows"]


def test_conventional_changelog_grouping():
    mod = _load_module()
    commits = [
        ("abc1234", "feat(ui): add offline exam badge", ""),
        ("def5678", "fix(sync): handle empty payload", ""),
        ("ghi9012", "perf: reduce bundle chunk size", ""),
        ("jkl3456", "feat(auth)!: drop legacy cookie", "BREAKING CHANGE: old cookies invalidated"),
    ]
    md = mod.format_conventional_notes(commits)
    assert "### Breaking Changes" in md
    assert "### Added" in md
    assert "### Fixed" in md
    assert "### Changed / Maintenance" in md
    assert "**ui:** add offline exam badge (`abc1234`)" in md
    assert "**sync:** handle empty payload (`def5678`)" in md
    assert "reduce bundle chunk size (`ghi9012`)" in md


def test_sync_version_and_stage_release_in_isolated_tree(tmp_path, monkeypatch):
    mod = _load_module()

    # Copy all versioned configuration files into tmp_path
    rel_files = [
        "CHANGELOG.md",
        "releases/manifest.json",
        "releases/windows/release.json",
        "frontend/package.json",
        "frontend/package-lock.json",
        "frontend/src-tauri/tauri.conf.json",
        "frontend/src-tauri/Cargo.toml",
        "frontend/android/app/build.gradle",
        "frontend/ios/App/App.xcodeproj/project.pbxproj",
        "frontend/src/services/releaseService.ts",
        "windows_launcher/setup.iss",
    ]
    for rf in rel_files:
        src = ROOT_DIR / rf
        if src.exists():
            dst = tmp_path / rf
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

    monkeypatch.setattr(mod, "ROOT_DIR", tmp_path)
    monkeypatch.setattr(mod, "FRONTEND_DIR", tmp_path / "frontend")
    monkeypatch.setattr(mod, "RELEASES_DIR", tmp_path / "releases")
    monkeypatch.setattr(mod, "MANIFEST_PATH", tmp_path / "releases" / "manifest.json")
    monkeypatch.setattr(mod, "CHANGELOG_PATH", tmp_path / "CHANGELOG.md")
    monkeypatch.setattr(mod, "PKG_JSON_PATH", tmp_path / "frontend" / "package.json")
    monkeypatch.setattr(mod, "PKG_LOCK_PATH", tmp_path / "frontend" / "package-lock.json")
    monkeypatch.setattr(mod, "TAURI_CONF_PATH", tmp_path / "frontend" / "src-tauri" / "tauri.conf.json")
    monkeypatch.setattr(mod, "CARGO_TOML_PATH", tmp_path / "frontend" / "src-tauri" / "Cargo.toml")
    monkeypatch.setattr(mod, "ANDROID_GRADLE_PATH", tmp_path / "frontend" / "android" / "app" / "build.gradle")
    monkeypatch.setattr(mod, "IOS_PBXPROJ_PATH", tmp_path / "frontend" / "ios" / "App" / "App.xcodeproj" / "project.pbxproj")
    monkeypatch.setattr(mod, "RELEASE_SERVICE_PATH", tmp_path / "frontend" / "src" / "services" / "releaseService.ts")
    monkeypatch.setattr(mod, "SETUP_ISS_PATH", tmp_path / "windows_launcher" / "setup.iss")

    mod.sync_all_versions("0.2.0", 200, notes="Isolated test release")
    mod.verify_all_versions("0.2.0", 200)

    # Verify Cargo.toml dependency versions were NOT altered
    cargo_txt = (tmp_path / "frontend/src-tauri/Cargo.toml").read_text(encoding="utf-8")
    assert 'version = "0.2.0"' in cargo_txt
    assert 'tokio = { version = "1.38"' in cargo_txt

    # Verify changelog upsert matches extracted notes verbatim
    updated_changelog = mod._upsert_changelog_section(
        (tmp_path / "CHANGELOG.md").read_text(encoding="utf-8"),
        "0.2.0",
        "### Added\n\n- **core:** test feature (`1111111`)",
        "2026-11-10",
    )
    assert "## [v0.2.0] — 2026-11-10" in updated_changelog
    assert mod._extract_existing_changelog_section(updated_changelog, "0.2.0") == "### Added\n\n- **core:** test feature (`1111111`)"

    # Verify stage-release outputs SHA256SUMS.txt + release-manifest.json
    in_dir = tmp_path / "downloaded"
    for plat, fname in [
        ("windows", "LanternEd_0.2.0_x64-setup.exe"),
        ("macos", "LanternEd_0.2.0_universal.dmg"),
        ("android", "app-release.apk"),
        ("ios", "App.ipa"),
    ]:
        pdir = in_dir / f"platform-{plat}"
        pdir.mkdir(parents=True, exist_ok=True)
        (pdir / fname).write_bytes(f"binary-{plat}".encode("utf-8"))

    out_dir = tmp_path / "staged"
    import argparse

    mod.cmd_stage_release(
        argparse.Namespace(
            input_dir=str(in_dir),
            output_dir=str(out_dir),
            version="0.2.0",
            tag="v0.2.0",
            commit="deadbeef",
        )
    )
    assert (out_dir / "SHA256SUMS.txt").exists()
    rel_manifest = json.loads((out_dir / "release-manifest.json").read_text(encoding="utf-8"))
    assert rel_manifest["version"] == "0.2.0"
    assert rel_manifest["tag"] == "v0.2.0"
    assert rel_manifest["commit"] == "deadbeef"
    assert set(rel_manifest["platforms"].keys()) == {"windows", "macos", "android", "ios"}
    assert (out_dir / "LanternEd-Setup-0.2.0.exe").exists()
    assert (out_dir / "LanternEd-0.2.0-universal.dmg").exists()
    assert (out_dir / "LanternEd-v0.2.0.apk").exists()
    assert (out_dir / "LanternEd-v0.2.0.ipa").exists()
