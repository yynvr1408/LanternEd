#!/usr/bin/env python3
"""
LanternEd - Cloudflare R2 Storage Diagnostic & Setup Verification Tool
=====================================================================

Validates your Cloudflare R2 object storage credentials, endpoint configuration,
bucket read/write permissions, and presigned URL generation.

Usage:
    # Uses credentials from backend/.env:
    python scripts/test_r2_connection.py

    # Or specify credentials explicitly:
    python scripts/test_r2_connection.py \
        --endpoint "https://<ACCOUNT_ID>.r2.cloudflarestorage.com" \
        --bucket "lanterned-storage" \
        --access-key "<KEY_ID>" \
        --secret-key "<SECRET_KEY>"
"""

import sys
import os
import uuid
import argparse
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings


def main():
    parser = argparse.ArgumentParser(description="Test Cloudflare R2 Storage Connection")
    parser.add_argument("--endpoint", help="R2 Endpoint URL")
    parser.add_argument("--bucket", help="R2 Bucket Name")
    parser.add_argument("--access-key", help="R2 Access Key ID")
    parser.add_argument("--secret-key", help="R2 Secret Access Key")
    args = parser.parse_args()

    settings = get_settings()
    endpoint = args.endpoint or os.environ.get("OBJECT_STORAGE_ENDPOINT") or settings.object_storage_endpoint
    bucket = args.bucket or os.environ.get("OBJECT_STORAGE_BUCKET") or settings.object_storage_bucket
    access_key = args.access_key or os.environ.get("OBJECT_STORAGE_ACCESS_KEY") or settings.object_storage_access_key
    secret_key = args.secret_key or os.environ.get("OBJECT_STORAGE_SECRET_KEY") or settings.object_storage_secret_key

    print("=" * 70)
    print("LanternEd Cloudflare R2 Object Storage Diagnostic")
    print("=" * 70)

    if not all([endpoint, bucket, access_key, secret_key]):
        print("[!] Incomplete Cloudflare R2 configuration detected.")
        print(f"    Endpoint:   {endpoint or '<NOT SET>'}")
        print(f"    Bucket:     {bucket or '<NOT SET>'}")
        print(f"    Access Key: {'*' * 8 if access_key else '<NOT SET>'}")
        print(f"    Secret Key: {'*' * 8 if secret_key else '<NOT SET>'}")
        print("\nTo test, configure backend/.env with:")
        print("    STORAGE_BACKEND=s3")
        print("    OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com")
        print("    OBJECT_STORAGE_BUCKET=lanterned-storage")
        print("    OBJECT_STORAGE_ACCESS_KEY=<YOUR_R2_ACCESS_KEY_ID>")
        print("    OBJECT_STORAGE_SECRET_KEY=<YOUR_R2_SECRET_ACCESS_KEY>")
        print("    OBJECT_STORAGE_REGION=auto")
        sys.exit(1)

    print(f"Target Bucket:   {bucket}")
    print(f"Endpoint URL:    {endpoint}")
    print(f"Access Key ID:   {access_key[:6]}...{access_key[-4:] if len(access_key) > 10 else ''}")

    try:
        import boto3
        from botocore.config import Config

        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "auto"}
            )
        )

        # 1. Bucket check
        print("\n[1/4] Verifying bucket connectivity...")
        s3.head_bucket(Bucket=bucket)
        print("      [OK] Bucket exists and is accessible.")

        # 2. Write probe
        probe_key = f"diagnostics/probe-{uuid.uuid4().hex[:8]}.txt"
        probe_payload = b"LanternEd Cloudflare R2 Verification Probe: SUCCESS\n"
        print(f"\n[2/4] Testing upload probe ({probe_key})...")
        s3.put_object(
            Bucket=bucket,
            Key=probe_key,
            Body=probe_payload,
            ContentType="text/plain"
        )
        print("      [OK] Probe uploaded successfully.")

        # 3. Read metadata & Presigned URL
        print("\n[3/4] Generating presigned download URL...")
        presigned_url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": probe_key},
            ExpiresIn=300
        )
        print("      [OK] Presigned URL generated.")
        print(f"      URL preview: {presigned_url[:80]}...")

        # 4. Cleanup
        print("\n[4/4] Cleaning up test probe...")
        s3.delete_object(Bucket=bucket, Key=probe_key)
        print("      [OK] Probe deleted.")

        print("-" * 70)
        print("RESULT: Cloudflare R2 is fully configured and operational for LanternEd!")
        print("=" * 70)

    except Exception as exc:
        print(f"\n[ERROR] R2 verification failed: {exc}")
        print("\nTroubleshooting Checklist:")
        print("1. Did you create the bucket in Cloudflare R2 with name: " + bucket + "?")
        print("2. Is the endpoint format exact: https://<ACCOUNT_ID>.r2.cloudflarestorage.com (no bucket name in the domain)?")
        print("3. Did you grant 'Object Read & Write' permission when creating the API Token in Cloudflare R2?")
        print("4. CORS: Make sure your bucket's CORS configuration allows GET, PUT, POST, HEAD from your frontend domain.")
        sys.exit(1)


if __name__ == "__main__":
    main()
