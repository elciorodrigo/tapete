#!/bin/sh
# Dump compactado do PostgreSQL. Agendar no cron da VPS, por exemplo às 3h:
#   0 3 * * * /opt/tapete/app/infra/backup.sh >> /opt/tapete/app/infra/backups/backup.log 2>&1
set -eu

cd "$(dirname "$0")"
set -a
. ./.env
set +a

DIR="${BACKUP_DIR:-./backups}"
DIAS="${BACKUP_DIAS:-14}"
ARQUIVO="$DIR/tapete-$(date +%Y%m%d-%H%M%S).sql.gz"

mkdir -p "$DIR"
docker exec tapete-db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip > "$ARQUIVO.tmp"
mv "$ARQUIVO.tmp" "$ARQUIVO"
find "$DIR" -name 'tapete-*.sql.gz' -mtime +"$DIAS" -delete

echo "$(date '+%F %T') backup ok: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"
