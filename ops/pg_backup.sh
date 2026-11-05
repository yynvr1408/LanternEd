#!/usr/bin/env bash
# Nightly PostgreSQL backup to S3-compatible storage (Cloudflare R2). Run from cron or a scheduled job.
#
#   DATABASE_URL            postgres connection string (the same one the API uses, without the +psycopg2 suffix)
#   BACKUP_BUCKET           bucket for backups (NOT the recordings bucket; give it a lifecycle rule too)
#   BACKUP_ENDPOINT         e.g. https://<account>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   write-only credentials scoped to the backup bucket
#   BACKUP_RETENTION_DAYS   default 30 (older dumps are deleted)
#
# Requires: pg_dump, gzip, aws CLI. Restore steps and the monthly restore drill: docs/OPERATIONS.md.
set -euo pipefail

: "${DATABASE_URL:?}" "${BACKUP_BUCKET:?}" "${BACKUP_ENDPOINT:?}"
retention="${BACKUP_RETENTION_DAYS:-30}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="lanterned-${stamp}.sql.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pg_dump --no-owner --no-privileges "${DATABASE_URL/+psycopg2/}" | gzip -9 > "$tmp/$file"
# A dump that is suspiciously small is a failed dump (e.g. auth error); do not upload it as if it were fine.
size=$(wc -c < "$tmp/$file")
if [ "$size" -lt 2048 ]; then echo "backup too small ($size bytes); aborting" >&2; exit 1; fi

aws s3 cp "$tmp/$file" "s3://${BACKUP_BUCKET}/db/${file}" --endpoint-url "$BACKUP_ENDPOINT" --only-show-errors
echo "uploaded db/${file} (${size} bytes)"

cutoff="$(date -u -d "-${retention} days" +%Y%m%d)"
aws s3 ls "s3://${BACKUP_BUCKET}/db/" --endpoint-url "$BACKUP_ENDPOINT" | awk '{print $4}' | while read -r name; do
  day="${name#lanterned-}"; day="${day%%T*}"
  if [[ "$day" =~ ^[0-9]{8}$ ]] && [ "$day" -lt "$cutoff" ]; then
    aws s3 rm "s3://${BACKUP_BUCKET}/db/${name}" --endpoint-url "$BACKUP_ENDPOINT" --only-show-errors
    echo "pruned ${name}"
  fi
done
