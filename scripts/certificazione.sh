#!/usr/bin/env bash
# Stato di certificazione, pubblicazione e abilitazione della skill.
source "$(dirname "$0")/common.sh"
SID="$(skill_id)"
note() { echo "    $*"; if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::notice title=certificazione::$*"; fi; }

summ() {  # stampa le chiavi principali di una risposta JSON
  node -e '
    let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
      let o; try { o = JSON.parse(d.slice(d.indexOf("{"))); } catch(e) { console.log((d||"").replace(/\s+/g," ").slice(0,300)); return; }
      const pick = (x, depth=0) => {
        if (x === null || typeof x !== "object") return x;
        if (Array.isArray(x)) return x.slice(0,3).map(y => pick(y, depth+1));
        const out = {};
        for (const [k,v] of Object.entries(x)) {
          if (/url|token|link|href/i.test(k)) continue;
          out[k] = depth > 2 ? (typeof v === "object" ? "…" : v) : pick(v, depth+1);
        }
        return out;
      };
      console.log(JSON.stringify(pick(o)).slice(0,900));
    });'
}

note "certificazioni: $(smapi get-certifications-list -s "$SID" 2>&1 | summ)"
note "pubblicazione: $(smapi get-skill-publications -s "$SID" --accept-language it-IT 2>&1 | summ)"
note "abilitazione live sul tuo account: $(smapi get-skill-enablement-status -s "$SID" -g live 2>&1 | summ)"
note "abilitazione sviluppo sul tuo account: $(smapi get-skill-enablement-status -s "$SID" -g development 2>&1 | summ)"
