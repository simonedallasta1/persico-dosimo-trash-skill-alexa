#!/usr/bin/env bash
# Prova la skill con il simulatore ufficiale di Amazon (stage di sviluppo).
# Uso: ./scripts/prova.sh ["frase 1|frase 2|..."]
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"
FRASI="${1:-apri raccolta persico dosimo|chiedi a raccolta persico dosimo cosa tocca domani sera|chiedi a raccolta persico dosimo le prossime raccolte}"

note() { echo "    $*"; if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::notice title=prova::$*"; fi; }

IFS='|' read -r -a LISTA <<< "$FRASI"
for frase in "${LISTA[@]}"; do
  frase="$(echo "$frase" | sed -E 's/^ +| +$//g')"; [ -n "$frase" ] || continue
  info "Frase: $frase"
  OUT="$(smapi simulate-skill -s "$SID" --device-locale it-IT -g development --input-content "$frase")" \
    || die "simulazione non avviata per: $frase"
  ID="$(echo "$OUT" | json_field id)"
  RES=""
  for _ in $(seq 1 20); do
    sleep 2
    RES="$(smapi get-skill-simulation -s "$SID" -g development -i "$ID")"
    [ "$(echo "$RES" | json_field status)" = "IN_PROGRESS" ] || break
  done
  echo "$RES" | FRASE="$frase" node -e '
    let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
      let o; try { o = JSON.parse(d.slice(d.indexOf("{"))); } catch(e) { console.log("risposta non leggibile"); return; }
      const r = o.result || {};
      const said = ((r.alexaExecutionInfo||{}).alexaResponses||[]).map(x => (x.content||{}).caption).filter(Boolean).join(" ");
      const inv = ((r.skillExecutionInfo||{}).invocations||[])[0];
      let intent = "";
      try { const req = inv.invocationRequest.body.request; intent = req.type + (req.intent ? " / " + req.intent.name : ""); } catch(e) {}
      const err = (r.error||{}).message || "";
      const line = `"${process.env.FRASE}" -> ${o.status}` + (intent ? ` [${intent}]` : " [skill non invocata]") +
                   (said ? ` Alexa: ${said}` : "") + (err ? ` ERRORE: ${err}` : "");
      console.log("    " + line);
      if (process.env.GITHUB_ACTIONS) console.log((o.status === "SUCCESSFUL" && inv ? "::notice" : "::warning") + " title=prova::" + line);
    });'
done
