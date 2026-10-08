#!/usr/bin/env bash
# Stato di build della skill: manifest, modello vocale, codice.
source "$(dirname "$0")/common.sh"
info "Stato della skill"
report_status || true
if [ -n "${GITHUB_ACTIONS:-}" ] || [ "${1:-}" = "-v" ]; then
  RAW="$(smapi get-skill-status -s "$(skill_id)" | tr -d '\n' | tr -s ' ')"
  echo "$RAW"
  # risposta completa come annotazione, a pezzi (limite di lunghezza)
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "$RAW" | fold -w 900 | while IFS= read -r part; do echo "::notice title=raw::$part"; done
fi
