#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR=/root/db-backups
ENV_FILE=/opt/lavadero/.env
LOG_FILE=/var/log/lavadero-backup.log

umask 077
mkdir -p "$BACKUP_DIR"
DB_NAME=$(sed -n 's/^DB_NAME=//p' "$ENV_FILE")
if [[ -z "$DB_NAME" ]]; then
  echo "No se encontró DB_NAME en $ENV_FILE" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d_%H%M%S)
FINAL_FILE="$BACKUP_DIR/bdlavaderoA8_${STAMP}.backup"
TEMP_FILE=$(mktemp /tmp/lavadero-backup.XXXXXX)
trap 'rm -f "$TEMP_FILE"' EXIT

echo "[$(date --iso-8601=seconds)] Iniciando backup de $DB_NAME" >> "$LOG_FILE"
runuser -u postgres -- pg_dump -Fc "$DB_NAME" > "$TEMP_FILE"
mv "$TEMP_FILE" "$FINAL_FILE"
chmod 600 "$FINAL_FILE"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'bdlavaderoA8_*.backup' -mtime +30 -print -delete >> "$LOG_FILE"
echo "[$(date --iso-8601=seconds)] Backup completado: $FINAL_FILE" >> "$LOG_FILE"
