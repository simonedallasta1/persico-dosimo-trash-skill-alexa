#!/usr/bin/env bash
# Stato di build della skill: manifest, modello vocale, codice.
source "$(dirname "$0")/common.sh"
info "Stato della skill"
report_status || true
if [ "${1:-}" = "-v" ]; then
  # risposta completa, senza i link di accesso temporanei ai log AWS
  smapi get-skill-status -s "$(skill_id)" | sed -E 's#"logUrl": *"[^"]*"#"logUrl": "(oscurato)"#g'
fi
