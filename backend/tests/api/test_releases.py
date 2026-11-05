from fastapi.testclient import TestClient
from app.main import app


def test_releases_manifest_and_update_check():
    client = TestClient(app)

    # 1. Manifest
    r = client.get("/api/v1/releases/manifest")
    assert r.status_code == 200
    data = r.json()
    assert data["version"] == "0.1.0"
    assert "windows" in data["platforms"]
    assert "macos" in data["platforms"]
    assert "android" in data["platforms"]
    assert "ios" in data["platforms"]

    # 2. Latest for platform
    r_win = client.get("/api/v1/releases/latest?platform=windows")
    assert r_win.status_code == 200
    assert r_win.json()["platform"] == "windows"
    assert r_win.json()["details"]["fileName"] == "LanternEd-Setup-0.1.0.exe"

    # 3. Check for update: already up to date
    r_check_curr = client.get("/api/v1/releases/check-update?current_version=0.1.0&platform=windows")
    assert r_check_curr.status_code == 200
    assert r_check_curr.json()["has_update"] is False

    # 4. Check for update: older version installed
    r_check_old = client.get("/api/v1/releases/check-update?current_version=0.0.8&platform=windows")
    assert r_check_old.status_code == 200
    assert r_check_old.json()["has_update"] is True
    assert r_check_old.json()["download_url"] == "/api/v1/releases/download/windows"

    # 5. Download binary
    r_dl = client.get("/api/v1/releases/download/windows")
    assert r_dl.status_code == 200
    assert "LanternEd-Setup-0.1.0.exe" in r_dl.headers.get("content-disposition", "")
    assert len(r_dl.content) > 0
