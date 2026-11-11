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


def test_extract_version_and_keep_latest_two_local_releases(tmp_path, monkeypatch):
    mod = _load_module()

    assert mod.extract_version_from_artifact_name("LanternEd-Setup-0.1.6.exe") == "0.1.6"
    assert mod.extract_version_from_artifact_name("LanternEd-0.2.0-rc.1-universal.dmg") == "0.2.0-rc.1"
    assert mod.extract_version_from_artifact_name("LanternEd-v0.1.6-ios.xcarchive.zip") == "0.1.6"
    assert mod.extract_version_from_artifact_name("LanternEd-v0.1.1.apk") == "0.1.1"
    assert mod.extract_version_from_artifact_name("release.json") is None
    assert mod.extract_version_from_artifact_name("manifest.json") is None

    releases_dir = tmp_path / "releases"
    for plat, pat in [
        ("windows", "LanternEd-Setup-{v}.exe"),
        ("macos", "LanternEd-{v}-universal.dmg"),
        ("android", "LanternEd-v{v}.apk"),
        ("ios", "LanternEd-v{v}.ipa"),
    ]:
        pdir = releases_dir / plat
        pdir.mkdir(parents=True, exist_ok=True)
        (pdir / "release.json").write_text('{"version": "0.1.1"}\n', encoding="utf-8")
        for old_v in ("0.1.0", "0.1.1"):
            (pdir / pat.format(v=old_v)).write_bytes(f"{plat}-{old_v}".encode("utf-8"))

    (releases_dir / "manifest.json").write_text(
        json.dumps(
            {
                "version": "0.1.1",
                "releaseDate": "2026-11-06T00:00:00Z",
                "releaseNotes": "test",
                "platforms": {p: {"version": "0.1.1", "fileName": ""} for p in ("windows", "macos", "android", "ios")},
            }
        ),
        encoding="utf-8",
    )
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text("# Changelog\n", encoding="utf-8")
    monkeypatch.setattr(mod, "CHANGELOG_PATH", changelog)

    dl_dir = tmp_path / "downloaded"
    for plat, raw_name in [
        ("windows", "setup.exe"),
        ("macos", "app.dmg"),
        ("android", "app-release.apk"),
        ("ios", "App.ipa"),
    ]:
        pdir = dl_dir / f"platform-{plat}"
        pdir.mkdir(parents=True, exist_ok=True)
        (pdir / raw_name).write_bytes(f"built-{plat}-0.1.6".encode("utf-8"))

    res = mod.install_local_releases(dl_dir, "0.1.6", releases_dir=releases_dir, keep=2)
    assert res["version"] == "0.1.6"
    assert (releases_dir / "CHANGELOG.md").exists()

    # Only latest 2 versions (0.1.6 and 0.1.1) remain for every app; 0.1.0 is pruned; release.json kept
    assert sorted(p.name for p in (releases_dir / "windows").iterdir()) == [
        "LanternEd-Setup-0.1.1.exe",
        "LanternEd-Setup-0.1.6.exe",
        "release.json",
    ]
    assert sorted(p.name for p in (releases_dir / "macos").iterdir()) == [
        "LanternEd-0.1.1-universal.dmg",
        "LanternEd-0.1.6-universal.dmg",
        "release.json",
    ]
    assert sorted(p.name for p in (releases_dir / "android").iterdir()) == [
        "LanternEd-v0.1.1.apk",
        "LanternEd-v0.1.6.apk",
        "release.json",
    ]
    assert sorted(p.name for p in (releases_dir / "ios").iterdir()) == [
        "LanternEd-v0.1.1.ipa",
        "LanternEd-v0.1.6.ipa",
        "release.json",
    ]

    # Mirror sync preserves README/LICENSE in target mirror and enforces keep=2 as well
    mirror_dir = tmp_path / "mirror"
    mirror_dir.mkdir()
    (mirror_dir / "README.md").write_text("keep-me\n", encoding="utf-8")
    (mirror_dir / "windows").mkdir()
    (mirror_dir / "windows" / "LanternEd-Setup-0.0.9.exe").write_bytes(b"stale")
    mod.mirror_releases_tree(releases_dir, mirror_dir, keep=2, preserve_version="0.1.6")
    assert (mirror_dir / "README.md").read_text(encoding="utf-8") == "keep-me\n"
    assert sorted(p.name for p in (mirror_dir / "windows").iterdir()) == [
        "LanternEd-Setup-0.1.1.exe",
        "LanternEd-Setup-0.1.6.exe",
        "release.json",
    ]


def test_select_releases_to_prune_keeps_latest_two_and_preserves_tag():
    mod = _load_module()
    releases = [
        {"tagName": "v0.1.6", "isDraft": False},
        {"tagName": "v0.1.5", "isDraft": False},
        {"tagName": "v0.1.4", "isDraft": False},
        {"tagName": "v0.1.1", "isDraft": False},
        {"tagName": "v0.2.0-draft", "isDraft": True},
        {"tagName": "unversioned-notes", "isDraft": False},
    ]
    kept, to_delete = mod.select_releases_to_prune(releases, keep=2, preserve_tag="v0.1.6")
    assert kept == ["v0.1.6", "v0.1.5"]
    assert to_delete == ["v0.1.4", "v0.1.1"]

    # If a preserved tag is currently a draft (or manually rebuilt), still keep max 2 total
    kept2, to_delete2 = mod.select_releases_to_prune(releases, keep=2, preserve_tag="v0.2.0-draft")
    assert kept2 == ["v0.2.0-draft", "v0.1.6"]
    assert to_delete2 == ["v0.1.5", "v0.1.4", "v0.1.1"]
