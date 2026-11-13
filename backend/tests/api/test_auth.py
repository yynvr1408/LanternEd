from tests.conftest import unique_email


def test_register_and_me(client):
    email = unique_email("alice")
    resp = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Alice", "email": email, "password": "password123", "role": "student"},
    )
    assert resp.status_code == 201
    assert resp.json()["user"]["role"] == "student"

    me = client.get("/api/v1/users/me")
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_duplicate_email_rejected(client):
    email = unique_email("bob")
    payload = {"full_name": "Bob", "email": email, "password": "password123", "role": "teacher"}
    first = client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 201

    second = client.post("/api/v1/auth/register", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "EMAIL_TAKEN"


def test_login_wrong_password_rejected(client):
    email = unique_email("carol")
    client.post(
        "/api/v1/auth/register",
        json={"full_name": "Carol", "email": email, "password": "correct-password", "role": "student"},
    )
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": "wrong-password"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_me_requires_authentication(client):
    resp = client.get("/api/v1/users/me")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


def test_logout_revokes_session(client):
    email = unique_email("dave")
    client.post(
        "/api/v1/auth/register",
        json={"full_name": "Dave", "email": email, "password": "password123", "role": "student"},
    )
    assert client.get("/api/v1/users/me").status_code == 200

    logout = client.post("/api/v1/auth/logout")
    assert logout.status_code == 204

    assert client.get("/api/v1/users/me").status_code == 401


def test_login_returns_token_and_bearer_auth_works(client):
    email = unique_email("eve")
    reg = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Eve", "email": email, "password": "password123", "role": "student"},
    )
    assert reg.status_code == 201
    token = reg.json().get("token")
    assert token is not None
    assert reg.json().get("session_token") == token

    # Create fresh client with no cookies
    from fastapi.testclient import TestClient
    from app.main import app

    isolated = TestClient(app)
    # Without token or cookie -> 401
    assert isolated.get("/api/v1/users/me").status_code == 401

    # With Bearer header -> 200
    with_bearer = isolated.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert with_bearer.status_code == 200
    assert with_bearer.json()["email"] == email

    # With X-Session-Token header -> 200
    with_custom = isolated.get("/api/v1/users/me", headers={"X-Session-Token": token})
    assert with_custom.status_code == 200
    assert with_custom.json()["email"] == email


def test_cross_origin_and_native_app_origins_allowed(client):
    email = unique_email("frank")
    for origin in [
        "https://lantern-ed.vercel.app",
        "https://lanterned.vercel.app",
        "https://my-preview.vercel.app",
        "https://lanterned.app",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "capacitor://localhost",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
    ]:
        resp = client.post(
            "/api/v1/auth/register",
            json={"full_name": "Frank", "email": unique_email("frank"), "password": "password123", "role": "student"},
            headers={"Origin": origin},
        )
        assert resp.status_code == 201, f"Failed for origin {origin}: {resp.text}"
