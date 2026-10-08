# Raccolta Persico Dosimo — Skill Alexa

Skill Alexa **non ufficiale** che dice e ricorda cosa esporre **la sera prima**
della raccolta differenziata porta a porta di **Persico Dosimo (CR)**
(Casalasca Servizi).

- Nome pubblico: **Raccolta Persico Dosimo** · invocation: `rifiuti persico`
- Italiano (it-IT), solo Italia · hosting: **Alexa-hosted** (gratis, niente AWS)

Frasi: "Alexa, apri rifiuti persico" · "...cosa metto fuori stasera" ·
"...cosa tocca domani sera" · "...le prossime raccolte" ·
"...ricordamelo ogni giorno alle 19" · "...disattiva i promemoria".

---

## Configurazione iniziale (una volta sola, dal telefono)

**1. Crea la skill vuota in console** (browser, meglio in "versione desktop")
- <https://developer.amazon.com/alexa/console/ask> → **Create Skill**
- Nome `Raccolta Persico Dosimo` · lingua **Italiano (IT)** · tipo **Custom** ·
  hosting **Alexa-hosted (Node.js)** · regione europea → Create
- Copia l'**ID della skill** (`amzn1.ask.skill....`, si vede nella lista skill)

**2. Apri un Codespace su questo repository**
- github.com → questo repo → **Code** → **Codespaces** → **Create codespace on main**
- Attendi che finisca l'installazione (ASK CLI viene installato da solo)

**3. Nel terminale del Codespace lancia**
```bash
./scripts/accesso.sh
```
Lo script:
1. ti mostra un link Amazon: aprilo, accedi, copia il codice e incollalo
   (alla domanda su **AWS** rispondi **no**);
2. ti chiede l'ID della skill e lo salva nel file `skill-id`;
3. salva le credenziali come secret `ASK_CLI_CONFIG` (se serve, ti chiede
   un'autorizzazione GitHub con un codice);
4. carica la skill.

Fatto questo puoi chiudere il Codespace: non servira' piu'.

---

## Uso quotidiano — dal telefono

GitHub (app o sito) → **Actions** → **Skill Alexa** → **Run workflow** → scegli:

| Azione | Cosa fa |
|---|---|
| `aggiorna` | Carica codice, modello vocale, descrizioni e icone |
| `stato` | Stato della build |
| `valida` | Validazione Amazon |
| `beta` | Valida, crea e avvia il beta test con le email del secret **BETA_TESTERS** |
| `pubblica` | Valida e invia in certificazione per lo store |

Ogni modifica a `lambda/` o `skill-package/` sul branch `main` esegue
`aggiorna` da sola.

**Beta per i tester:** usa l'**email del loro account Amazon** (quella di
Alexa). Se l'invito non arriva: console → Distribution → Availability →
Beta Test → copia il link d'invito e mandalo (va aperto dal telefono).

---

## Prima di `beta` e `pubblica`

In console completa una volta **Distribution → Skill Preview** e
**Privacy & Compliance** (i testi sono gia' nel manifest e vengono caricati
con `aggiorna`).

La privacy policy e' in `docs/privacy.html` e il manifest punta gia' a
<https://simonedallasta1.github.io/persico-dosimo-trash-skill-alexa/privacy.html>.
Per metterla online gratis con GitHub Pages:
1. Settings → General → Danger Zone → **Change visibility → Public**
   (il repository non contiene segreti: le credenziali stanno nel secret);
2. Settings → **Pages** → Source: *Deploy from a branch* → Branch **main**,
   cartella **/docs** → Save. Dopo un minuto il link funziona.

In alternativa pubblica la pagina altrove e aggiorna `privacyPolicyUrl` in
`skill-package/skill.json`.

---

## Struttura
```
lambda/                    codice della skill (Node.js)
skill-package/             manifest, modello vocale it-IT, icone
assets/                    icone sorgente
docs/                      privacy policy (GitHub Pages)
scripts/                   automazione (ASK CLI)
.github/workflows/         GitHub Actions
.devcontainer/             ambiente Codespace con ASK CLI
skill-id                   ID della skill (non segreto)
```

## Manutenzione
- Calendario: `lambda/index.js` → `CALENDARIO`, con le date ufficiali da febbraio
  2026 a gennaio 2027 (verde e festivita' comprese). Con il nuovo calendario
  Casalasca si sostituisce questa tabella e si aggiornano `CAL_START`/`CAL_END`.
- Fuori dal periodo coperto la skill usa lo schema settimanale (senza verde) e
  avvisa di verificare il nuovo calendario.
- Tra mezzanotte e le 6 "cosa metto fuori" risponde con la raccolta di oggi.
- Fuso orario: `Europe/Rome`.

Le credenziali Amazon stanno solo nel secret `ASK_CLI_CONFIG`: per revocarle
eliminalo da Settings → Secrets and variables → Actions.
