#!/usr/bin/env bash
# Carica/aggiorna codice, modello vocale, manifest e icone sullo stage di
# sviluppo della skill Alexa-hosted (push sul branch master del suo repository).
source "$(dirname "$0")/common.sh"
check_sources
need git "Installa git."
SID="$(skill_id)"

info "Recupero il repository della skill"
URL="$(smapi get-alexa-hosted-skill-metadata -s "$SID" | json_field alexaHosted.repository.url)"
[ -n "$URL" ] || die "impossibile leggere il repository della skill $SID"
CRED="$(smapi generate-credentials-for-alexa-hosted-skill -s "$SID" --repository-url "$URL" --repository-type GIT)"
export HOSTED_GIT_USER HOSTED_GIT_PASS
HOSTED_GIT_USER="$(echo "$CRED" | json_field repositoryCredentials.username)"
HOSTED_GIT_PASS="$(echo "$CRED" | json_field repositoryCredentials.password)"
[ -n "$HOSTED_GIT_USER" ] || die "credenziali del repository non ricevute"

# credenziali passate a git tramite variabili d'ambiente, mai scritte su disco
HELPER='!f() { test "$1" = get && printf "username=%s\npassword=%s\n" "$HOSTED_GIT_USER" "$HOSTED_GIT_PASS"; }; f'
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git -c credential.helper= -c "credential.helper=$HELPER" clone -q --branch master "$URL" "$WORK/hosted"
cd "$WORK/hosted"
git config credential.helper ""
git config --add credential.helper "$HELPER"
git config user.name  "$(git -C "$PROJECT_DIR" config user.name  2>/dev/null || echo 'Raccolta Persico Dosimo')"
git config user.email "$(git -C "$PROJECT_DIR" config user.email 2>/dev/null || echo 'noreply@example.com')"

info "Preparo il manifest (descrizioni, icone, privacy, permessi)"
# il manifest attuale contiene l'endpoint del codice hosted: lo si conserva
smapi get-skill-manifest -s "$SID" -g development > "$WORK/current.json"
node -e '
  const fs = require("fs");
  const raw = fs.readFileSync(process.argv[1], "utf8");
  const cur = JSON.parse(raw.slice(raw.indexOf("{"))).manifest;
  const ours = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).manifest;
  if (!cur || !cur.apis || !cur.apis.custom) { console.error("manifest attuale senza apis.custom"); process.exit(1); }
  const out = { manifest: Object.assign({}, cur, {
    publishingInformation: ours.publishingInformation,
    privacyAndCompliance: ours.privacyAndCompliance,
    permissions: ours.permissions
  })};
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 2));
' "$WORK/current.json" "$PROJECT_DIR/skill-package/skill.json" "$WORK/manifest.json" \
  || die "impossibile preparare il manifest"
info "Copio i file del progetto"
mkdir -p lambda skill-package/interactionModels/custom skill-package/assets/images
cp "$PROJECT_DIR/lambda/index.js"     lambda/index.js
cp "$PROJECT_DIR/lambda/package.json" lambda/package.json
cp "$PROJECT_DIR/skill-package/interactionModels/custom/it-IT.json" skill-package/interactionModels/custom/it-IT.json
cp "$PROJECT_DIR"/skill-package/assets/images/*.png skill-package/assets/images/
# manifest completo (con endpoint) anche nel repository hosted, per coerenza
cp "$WORK/manifest.json" skill-package/skill.json
# il template puo' contenere altre lingue (es. en-US): la skill e' solo italiana
find skill-package/interactionModels/custom -name '*.json' ! -name 'it-IT.json' -delete

git add -A
CODE_PUSHED=0
if git diff --cached --quiet; then
  info "Codice gia' aggiornato."
else
  git commit -q -m "Aggiornamento Raccolta Persico Dosimo $(date '+%Y-%m-%d %H:%M')"
  info "Pubblico il codice sullo stage di sviluppo"
  git push -q origin master
  CODE_PUSHED=1
fi

# allinea la scheda Code della console (branch dev), se esiste
if git ls-remote --exit-code --heads origin dev >/dev/null 2>&1; then
  git fetch -q origin dev && git checkout -q -B dev origin/dev \
    && git merge -q --no-edit master && git push -q --no-verify origin dev || true
fi

wait_build() {
  local rc=1
  sleep "${1:-20}"
  for _ in $(seq 1 40); do
    if report_status >/dev/null; then rc=0; else rc=$?; fi
    [ $rc -eq 1 ] || break
    sleep 15
  done
  return $rc
}

if [ "$CODE_PUSHED" = 1 ]; then
  info "Attendo il deploy del codice"
  wait_build 30 || true
fi

info "Aggiorno il manifest"
smapi update-skill-manifest -s "$SID" -g development --manifest "file:$WORK/manifest.json" >/dev/null

info "Aggiorno il modello vocale"
smapi set-interaction-model -s "$SID" -g development -l it-IT \
  --interaction-model "file:$PROJECT_DIR/skill-package/interactionModels/custom/it-IT.json" >/dev/null

info "Attendo la build di Amazon"
if wait_build 20; then rc=0; else rc=$?; fi
report_status || true
case $rc in
  0) info "Fatto: skill aggiornata."
     echo "    Prova: \"Alexa, apri rifiuti persico\"" ;;
  1) die "la build e' ancora in corso dopo 10 minuti: controlla piu' tardi con l'azione 'stato'." ;;
  *) die "Amazon ha rifiutato l'aggiornamento: vedi gli errori sopra." ;;
esac
