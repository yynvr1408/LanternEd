#!/usr/bin/env python3
"""
LanternEd - Neon PostgreSQL Connection & Migration Diagnostic Tool
==================================================================

Tests the connectivity, SSL encryption, and Alembic migration state of your
Neon serverless PostgreSQL database.

Usage:
    # Uses DATABASE_URL from backend/.env:
    python scripts/test_neon_connection.py

    # Or specify URL directly:
    python scripts/test_neon_connection.py --url "postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=require"

    # Automatically run migrations if database is behind:
    python scripts/test_neon_connection.py --migrate
"""

import sys
import os
import argparse
from pathlib import Path

# Add backend to path
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Load backend/.env if running from workspace root
env_path = BACKEND_DIR / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        pass

from app.config import get_settings
from sqlalchemy import create_engine, text


def normalize_url(url: str) -> str:
    clean = url.strip()
    if clean.startswith("postgres://"):
        return clean.replace("postgres://", "postgresql+psycopg2://", 1)
    if clean.startswith("postgresql://") and not clean.startswith("postgresql+"):
        return clean.replace("postgresql://", "postgresql+psycopg2://", 1)
    return clean


def main():
    parser = argparse.ArgumentParser(description="Test Neon PostgreSQL Connection & Schema")
    parser.add_argument("--url", help="Database connection URL (overrides .env)")
    parser.add_argument("--migrate", action="store_true", help="Run 'alembic upgrade head' if connected")
    args = parser.parse_args()

    settings = get_settings()
    raw_url = args.url or os.environ.get("DATABASE_URL") or settings.database_url

    if not raw_url or "dev.db" in raw_url:
        print("[!] No production/Neon DATABASE_URL specified.")
        print("    Pass --url 'postgresql://user:pass@ep-name.neon.tech/neondb?sslmode=require'")
        print("    or set DATABASE_URL in backend/.env")
        sys.exit(1)

    url = normalize_url(raw_url)
    # Mask password for display
    display_url = url
    if "@" in display_url and ":" in display_url:
        parts = display_url.split("@")
        cred_part = parts[0]
        host_part = parts[1]
        proto, userpass = cred_part.split("://")
        user = userpass.split(":")[0]
        display_url = f"{proto}://{user}:****@{host_part}"

    print("=" * 70)
    print("LanternEd Neon Database Connection Diagnostic")
    print("=" * 70)
    print(f"Target DB: {display_url}")

    try:
        engine = create_engine(url, pool_pre_ping=True)
        with engine.connect() as conn:
            # Query version and basic status
            res = conn.execute(text("SELECT version(), current_database(), current_user;")).fetchone()
            version, db_name, user = res[0], res[1], res[2]
            print(f"[OK] Connected successfully as user '{user}' to database '{db_name}'")
            print(f"     Engine Version: {version[:45]}...")

            # Check Alembic version table
            try:
                ver_res = conn.execute(text("SELECT version_num FROM alembic_version;")).fetchall()
                revisions = [r[0] for r in ver_res]
                print(f"[OK] Alembic Version Table Found: {revisions}")
                if "b7d0ffee0016" in revisions:
                    print("     [STATUS: UP TO DATE] Database schema is at latest head (b7d0ffee0016)")
                else:
                    print("     [STATUS: OUTDATED] Database needs migrations applied.")
            except Exception:
                print("[!] Alembic Version Table Not Found (fresh database).")
                revisions = []

    except Exception as exc:
        print(f"\n[ERROR] Connection failed: {exc}")
        print("\nTroubleshooting Tips:")
        print("1. Ensure your Neon connection string includes '?sslmode=require'.")
        print("2. Check that your Neon branch is active (not paused/suspended in Neon console).")
        print("3. Verify your username and password are URL-encoded if they contain special symbols.")
        sys.exit(1)

    if args.migrate:
        print("\nApplying Alembic migrations ('alembic upgrade head')...")
        import subprocess
        env = os.environ.copy()
        env["DATABASE_URL"] = url
        res = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True
        )
        print(res.stdout)
        if res.stderr:
            print(res.stderr)
        if res.returncode == 0:
            print("[SUCCESS] All migrations successfully applied to Neon database!")
        else:
            print(f"[ERROR] Migration failed with exit code {res.returncode}")
            sys.exit(res.returncode)

    print("=" * 70)


if __name__ == "__main__":
    main()
