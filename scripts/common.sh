#!/usr/bin/env bash
# Funzioni comuni agli script. Non eseguire direttamente.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASK_PROFILE="${ASK_PROFILE:-default}"

die()  {
  echo "ERRORE: $*" >&2
  if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::error::$*"; fi
  exit 1
}
info() { echo "==> $*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "manca '$1'. $2"; }

need node "Serve Node.js 18 o superiore."
need ask  "Installa ASK CLI: npm install -g ask-cli@2"

# ID della skill: variabile SKILL_ID oppure file skill-id nella radice del repo
skill_id() {
  local sid="${SKILL_ID:-}"
  if [ -z "$sid" ] && [ -f "$PROJECT_DIR/skill-id" ]; then
    sid="$(tr -d ' \r\n' < "$PROJECT_DIR/skill-id")"
  fi
  [ -n "$sid" ] || die "ID della skill mancante: esegui scripts/accesso.sh oppure scrivilo nel file skill-id"
  echo "$sid"
}

# Estrae un campo (es. a.b.c) dal JSON letto su stdin
json_field() {
  node -e '
    let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
      let o; try { o = JSON.parse(d.slice(d.indexOf("{"))); } catch (e) { console.log(""); return; }
      const v = process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k], o);
      console.log(v==null ? "" : (typeof v==="object" ? JSON.stringify(v) : v));
    });' "$1"
}

check_sources() {
  for f in skill-package/skill.json skill-package/interactionModels/custom/it-IT.json lambda/package.json; do
    node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$PROJECT_DIR/$f" \
      || die "JSON non valido: $f"
  done
  node --check "$PROJECT_DIR/lambda/index.js" || die "errore di sintassi in lambda/index.js"
}

smapi() { ask smapi "$@" --profile "$ASK_PROFILE"; }

# Riassume lo stato della skill (manifest, modello vocale, codice hosted).
# Stampa una riga per componente; in GitHub Actions le scrive anche come annotazioni.
# Codice di uscita: 0 tutto ok, 1 qualcosa in corso, 2 qualcosa fallito.
report_status() {
  local res
  res="$(smapi get-skill-status -s "$(skill_id)")" || die "impossibile leggere lo stato della skill"
  echo "$res" | node -e '
    let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
      let o; try { o = JSON.parse(d.slice(d.indexOf("{"))); } catch(e) { console.log("FAILED|stato|risposta non leggibile"); return; }
      const out = [];
      const add = (name, req) => {
        if (!req) return;
        const errs = (req.errors||[]).map(e=>e.message||JSON.stringify(e)).join(" ; ");
        const warns = (req.warnings||[]).map(e=>e.message||JSON.stringify(e)).join(" ; ");
        out.push([req.status||"?", name, errs + (warns ? " [avvisi: " + warns + "]" : "")].join("|"));
      };
      if (o.manifest) add("manifest", o.manifest.lastUpdateRequest);
      for (const [loc, m] of Object.entries(o.interactionModel||{})) add("modello " + loc, m.lastUpdateRequest);
      if (o.hostedSkillDeployment) add("codice", o.hostedSkillDeployment.lastUpdateRequest);
      if (o.hostedSkillProvisioning) add("hosting", o.hostedSkillProvisioning.lastUpdateRequest);
      console.log(out.join("\n"));
    });' > "${TMPDIR:-/tmp}/skill-status.txt"
  local rc=0 st name msg level
  while IFS='|' read -r st name msg; do
    [ -n "$st" ] || continue
    echo "    $name: $st ${msg}"
    case "$st" in
      FAILED)      rc=2; level=error ;;
      IN_PROGRESS) [ $rc -lt 1 ] && rc=1; level=warning ;;
      *)           level=notice ;;
    esac
    if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::${level}::${name}: ${st} ${msg}"; fi
  done < "${TMPDIR:-/tmp}/skill-status.txt"
  return $rc
}
