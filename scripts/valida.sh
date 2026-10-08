#!/usr/bin/env bash
# Validazione Amazon (prerequisito per beta e certificazione).
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"

info "Avvio la validazione"
OUT="$(smapi submit-skill-validation -s "$SID" -l it-IT -g development)"
VID="$(echo "$OUT" | json_field id)"
[ -n "$VID" ] || die "risposta inattesa: $OUT"

for _ in $(seq 1 40); do
  sleep 15
  RES="$(smapi get-skill-validations -s "$SID" -i "$VID" -g development)"
  ST="$(echo "$RES" | json_field status)"
  echo "    stato: $ST"
  case "$ST" in
    SUCCESSFUL) info "Validazione superata."; exit 0 ;;
    FAILED)     echo "$RES"; die "validazione non superata: vedi i dettagli sopra." ;;
  esac
done
die "la validazione sta impiegando troppo: ricontrolla piu' tardi."
