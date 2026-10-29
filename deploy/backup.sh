#!/bin/sh
# Nightly backup, run by the "backup" service in docker-compose.yml (postgres:16 image, so pg_dump matches the server).
# Every night at BACKUP_AT (server time, default 03:30) it writes to /backups:
#   easalpha-<date>.dump       the main database, pg_dump custom format (restore: pg_restore -d easalpha_production file)
#   umami-<date>.dump          the analytics database
#   storage-<date>.tar.gz      uploaded files (menu photos, logos, receipts)
#   wasessions-<date>.tar.gz   linked WhatsApp phones (sensitive: treat like a password)
# and deletes anything older than BACKUP_KEEP_DAYS (default 14). BACKUP_COPY_CMD, when set, runs after each backup with
# the folder as $1 (for example an rclone or rsync line) so a copy leaves the server. "backup.sh now" runs one backup
# at once and exits; docs/DEPLOY.md has the restore steps.
set -eu
DIR=${BACKUP_DIR_IN_CONTAINER:-/backups}
KEEP=${BACKUP_KEEP_DAYS:-14}
AT=${BACKUP_AT:-03:30}
DB=${DATABASE_NAME:-easalpha_production}
mkdir -p "$DIR"

run_backup() {
  stamp=$(date +%F)
  echo "[backup] $(date -Is) start"
  pg_dump -h db -U postgres -Fc "$DB" > "$DIR/easalpha-$stamp.dump.part" && mv "$DIR/easalpha-$stamp.dump.part" "$DIR/easalpha-$stamp.dump"
  if psql -h db -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='umami'" | grep -q 1; then
    pg_dump -h db -U postgres -Fc umami > "$DIR/umami-$stamp.dump.part" && mv "$DIR/umami-$stamp.dump.part" "$DIR/umami-$stamp.dump"
  fi
  [ -d /data/storage ] && tar -czf "$DIR/storage-$stamp.tar.gz" -C /data storage
  [ -d /data/wasessions ] && tar -czf "$DIR/wasessions-$stamp.tar.gz" -C /data wasessions
  find "$DIR" -maxdepth 1 -type f -mtime +"$KEEP" \( -name '*.dump' -o -name '*.tar.gz' \) -delete
  if [ -n "${BACKUP_COPY_CMD:-}" ]; then sh -c "$BACKUP_COPY_CMD \"$DIR\"" || echo "[backup] copy command failed"; fi
  echo "[backup] $(date -Is) done: $(ls -1 "$DIR" | wc -l) files, $(du -sh "$DIR" | cut -f1)"
}

if [ "${1:-}" = "now" ]; then run_backup; exit 0; fi

while true; do
  # seconds until the next BACKUP_AT
  now=$(date +%s)
  target=$(date -d "today $AT" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  run_backup || echo "[backup] FAILED $(date -Is)"
done
