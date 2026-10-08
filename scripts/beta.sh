#!/usr/bin/env bash
# Avvia il beta test e aggiunge i tester.
# Uso: ./scripts/beta.sh email1 [email2 ...]   (anche separate da virgola)
# La prima email riceve i feedback dei tester.
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"
EMAILS="$(echo "$*" | tr ' ,;' '\n\n\n' | sed '/^$/d' | paste -sd, -)"
[ -n "$EMAILS" ] || die "indica almeno un'email: ./scripts/beta.sh tester@esempio.it"
FEEDBACK="${EMAILS%%,*}"

note() { echo "    $*"; if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::notice title=beta::$*"; fi; }
# esegue un comando smapi; in caso di errore lo riporta (anche come annotazione) e restituisce 1
try() {
  local label="$1"; shift
  local out
  if out="$(smapi "$@" 2>&1)"; then note "$label: ok"; return 0; fi
  local msg; msg="$(echo "$out" | tr '\n' ' ' | sed -E 's/ +/ /g' | cut -c1-400)"
  echo "$out"
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning title=beta::$label: $msg"; fi
  return 1
}

"$PROJECT_DIR/scripts/valida.sh"

info "Beta test"
EXISTING="$(smapi get-beta-test -s "$SID" 2>/dev/null || true)"
if [ -n "$(echo "$EXISTING" | json_field status)" ]; then
  note "beta gia' esistente, stato: $(echo "$EXISTING" | json_field status)"
else
  try "creazione beta" create-beta-test -s "$SID" --feedback-email "$FEEDBACK" || die "impossibile creare il beta test"
fi

N="$(echo "$EMAILS" | tr ',' '\n' | wc -l | tr -d ' ')"
try "aggiunta di $N tester" add-testers-to-beta-test -s "$SID" --testers-emails "$EMAILS" || die "impossibile aggiungere i tester"

STATUS="$(smapi get-beta-test -s "$SID" | json_field status)"
if [ "$STATUS" != "RUNNING" ]; then
  try "avvio beta" start-beta-test -s "$SID" || true
  sleep 10
fi

# riepilogo finale (senza email: compaiono oscurate)
BT="$(smapi get-beta-test -s "$SID")"
note "stato beta: $(echo "$BT" | json_field status), scadenza: $(echo "$BT" | json_field expiryDate)"
if [ -n "$(echo "$BT" | json_field invitationUrl)" ]; then
  note "link d'invito disponibile in console: Distribution > Availability > Beta Test"
fi
TESTERS="$(smapi get-list-of-testers -s "$SID" 2>/dev/null || true)"
echo "$TESTERS" | node -e '
  let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
    let o; try { o = JSON.parse(d.slice(d.indexOf("{"))); } catch(e) { return; }
    const t = o.testers || [];
    const line = "tester registrati: " + t.length + (t.length ? " (inviti: " + t.map(x => x.invitationStatus || "?").join(", ") + ")" : "");
    console.log("    " + line);
    if (process.env.GITHUB_ACTIONS) console.log("::notice title=beta::" + line);
  });'
