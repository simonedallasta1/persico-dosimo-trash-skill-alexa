#!/usr/bin/env bash
# Invia la skill in certificazione per la pubblicazione nello store.
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"

URL="$(node -e 'const m=require(process.argv[1]).manifest;console.log(m.privacyAndCompliance.locales["it-IT"].privacyPolicyUrl||"")' "$PROJECT_DIR/skill-package/skill.json")"
case "$URL" in
  ""|*IL-TUO-DOMINIO*) die "metti il vero URL della privacy policy in skill-package/skill.json, poi aggiorna la skill" ;;
esac

"$PROJECT_DIR/scripts/valida.sh"

if [ -t 0 ]; then
  read -r -p "Inviare 'Raccolta Persico Dosimo' in certificazione? [s/N] " OK
  [ "$OK" = "s" ] || [ "$OK" = "S" ] || die "annullato."
fi

smapi submit-skill-for-certification -s "$SID"
info "Inviata. Amazon ti scrivera' via email con l'esito."
