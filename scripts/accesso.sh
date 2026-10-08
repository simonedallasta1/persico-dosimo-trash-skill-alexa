#!/usr/bin/env bash
# Configurazione iniziale, UNA VOLTA SOLA (va bene il Codespace dal telefono).
#  1. login al tuo account Amazon Developer
#  2. salva l'ID della skill nel file skill-id
#  3. salva le credenziali come secret ASK_CLI_CONFIG del repository
#  4. primo caricamento della skill
#
# Uso: ./scripts/accesso.sh [ID-della-skill]
source "$(dirname "$0")/common.sh"
cd "$PROJECT_DIR"

if [ ! -f "$HOME/.ask/cli_config" ]; then
  info "Login Amazon. Comparira' un link: aprilo, accedi, copia il codice e incollalo qui."
  echo "    Alla domanda sull'account AWS rispondi NO."
  ask configure --no-browser --profile "$ASK_PROFILE"
fi

SID="${1:-}"
if [ -z "$SID" ] && [ -s skill-id ]; then SID="$(tr -d ' \r\n' < skill-id)"; fi
if [ -z "$SID" ]; then
  read -r -p "Incolla l'ID della skill (amzn1.ask.skill....): " SID
fi
[[ "$SID" == amzn1.ask.skill.* ]] || die "ID non valido: $SID"

info "Controllo che la skill sia Alexa-hosted"
smapi get-alexa-hosted-skill-metadata -s "$SID" >/dev/null \
  || die "skill non trovata o non Alexa-hosted. Creala in console con hosting 'Alexa-hosted (Node.js)'."

if [ "$(tr -d ' \r\n' < skill-id 2>/dev/null || true)" != "$SID" ]; then
  echo "$SID" > skill-id
  git add skill-id
  git commit -q -m "Imposta ID della skill"
  git push -q || echo "    (push non riuscito: fai commit e push del file skill-id a mano)"
fi

info "Salvo le credenziali Amazon come secret del repository"
if ! gh secret set ASK_CLI_CONFIG < "$HOME/.ask/cli_config" 2>/dev/null; then
  echo "    Serve un'autorizzazione GitHub aggiuntiva: segui le istruzioni."
  env -u GITHUB_TOKEN gh auth login --hostname github.com --git-protocol https --web
  env -u GITHUB_TOKEN gh secret set ASK_CLI_CONFIG < "$HOME/.ask/cli_config"
fi
info "Secret ASK_CLI_CONFIG salvato."

SKILL_ID="$SID" "$PROJECT_DIR/scripts/deploy.sh"
echo
info "Configurazione completata. D'ora in poi usa GitHub > Actions > 'Skill Alexa' > Run workflow."
