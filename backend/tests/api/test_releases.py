import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_releases_manifest_and_update_check():
    client = TestClient(app)
    manifest_path = Path(__file__).resolve().parents[3] / "releases" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    current_version = manifest["version"]
    win_filename = manifest["platforms"]["windows"]["fileName"]

    # 1. Manifest
    r = client.get("/api/v1/releases/manifest")
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == current_version
    assert "windows" in data["platforms"]
    assert "macos" in data["platforms"]
    assert "android" in data["platforms"]
    assert "ios" in data["platforms"]

    # 2. Latest for platform
    r_win = client.get("/api/v1/releases/latest?platform=windows")
    assert r_win.status_code == 200
    assert r_win.json()["platform"] == "windows"
    assert r_win.json()["details"]["fileName"] == win_filename

    # 3. Check for update: already up to date
    r_check_curr = client.get(f"/api/v1/releases/check-update?current_version={current_version}&platform=windows")
    assert r_check_curr.status_code == 200
    assert r_check_curr.json()["has_update"] is False

    # 4. Check for update: older version installed
    r_check_old = client.get("/api/v1/releases/check-update?current_version=0.0.8&platform=windows")
    assert r_check_old.status_code == 200
    assert r_check_old.json()["has_update"] is True
    assert r_check_old.json()["download_url"] == "/api/v1/releases/download/windows"

    # 5. Download binary (served locally if present, or redirects to LanternEd-App-Releases)
    local_bin = manifest_path.parent / "windows" / win_filename
    r_dl = client.get("/api/v1/releases/download/windows", follow_redirects=False)
    if local_bin.exists():
        assert r_dl.status_code == 200
        assert win_filename in r_dl.headers.get("content-disposition", "")
        assert len(r_dl.content) > 0
    else:
        assert r_dl.status_code == 307
        assert win_filename in r_dl.headers.get("location", "")
