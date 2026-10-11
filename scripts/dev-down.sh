#!/usr/bin/env bash
# Stops the web app, the WhatsApp gateway and the API started by scripts/dev-up.sh. PostgreSQL keeps running.
for port in 3000 3010 3001; do
  for pid in $(ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u); do
    ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
    kill "$pid" 2>/dev/null; [ -n "$ppid" ] && [ "$ppid" != "1" ] && kill "$ppid" 2>/dev/null
  done
done
echo "stopped"
