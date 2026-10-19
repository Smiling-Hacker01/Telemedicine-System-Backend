#!/usr/bin/env bash
# ==============================================================================
# Amrutam Telemedicine Backend — Automated PostgreSQL Backup Script
# Usage: ./scripts/backup-database.sh
# Production standard: Nightly cron job with retention management
# ==============================================================================

set -euo pipefail

# Configuration loaded strictly from environment or defaults
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="amrutam_backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

echo "=== [$(date)] Starting PostgreSQL Backup for Amrutam Telemedicine ==="

# Validate DATABASE_URL is present
if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL environment variable is required." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# Execute custom-format compressed pg_dump
echo "Creating compressed backup at ${BACKUP_PATH}..."
pg_dump --format=custom --compress=9 --verbose --file="${BACKUP_PATH}" "${DATABASE_URL}"

# Verify backup integrity
if [ -f "${BACKUP_PATH}" ]; then
  FILESIZE=$(stat -c%s "${BACKUP_PATH}" 2>/dev/null || stat -f%z "${BACKUP_PATH}")
  echo "Backup successfully created. Size: ${FILESIZE} bytes."
else
  echo "Error: Backup file was not created!" >&2
  exit 1
fi

# Optional S3 offsite replication
if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
  echo "Uploading backup to AWS S3: s3://${S3_BACKUP_BUCKET}/db-backups/${BACKUP_FILENAME}..."
  aws s3 cp "${BACKUP_PATH}" "s3://${S3_BACKUP_BUCKET}/db-backups/${BACKUP_FILENAME}" --sse aws:kms
  echo "S3 upload complete."
fi

# Prune local backups older than retention window
echo "Pruning local backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "amrutam_backup_*.dump" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "=== [$(date)] Backup process completed successfully ==="
