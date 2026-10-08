#!/usr/bin/env bash
# Avvia il beta test e aggiunge i tester.
# Uso: ./scripts/beta.sh email1 [email2 ...]   (anche separate da virgola)
# La prima email riceve i feedback dei tester.
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"
EMAILS="$(echo "$*" | tr ' ,;' '\n\n\n' | sed '/^$/d' | paste -sd, -)"
[ -n "$EMAILS" ] || die "indica almeno un'email: ./scripts/beta.sh tester@esempio.it"
FEEDBACK="${EMAILS%%,*}"

"$PROJECT_DIR/scripts/valida.sh"

info "Creo il beta test (se esiste gia' proseguo)"
smapi create-beta-test -s "$SID" --feedback-email "$FEEDBACK" || true

info "Aggiungo i tester: $EMAILS"
smapi add-testers-to-beta-test -s "$SID" --testers-emails "$EMAILS"

info "Avvio il beta test"
smapi start-beta-test -s "$SID" || echo "    (gia' avviato)"

echo
echo "Se l'invito non arriva ai tester: Developer Console > Distribution >"
echo "Availability > Beta Test, copia il link d'invito e mandalo tu (da aprire dal telefono)."
