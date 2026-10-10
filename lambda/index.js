'use strict';

/**
 * Skill Alexa "Raccolta Persico Dosimo" — Persico Dosimo (Casalasca Servizi).
 *
 * Usa le date esatte del calendario ufficiale 2026/2027 (febbraio 2026 - gennaio 2027),
 * compresi verde e festivita'. Fuori da quel periodo applica lo schema settimanale
 * (martedi' umido+plastica+carta/vetro alternati, venerdi' umido+secco) e avvisa
 * di verificare il nuovo calendario.
 *
 * Tra mezzanotte e le 6 la domanda "cosa metto fuori" risponde con cio' che passa OGGI.
 *
 * Promemoria vocali: con il permesso Reminders, la skill crea un promemoria
 * per ogni sera-di-raccolta dei prossimi 14 giorni all'orario scelto, e li
 * rigenera ad ogni apertura della skill.
 */

const Alexa = require('ask-sdk-core');

// Persistenza (S3, fornita dalle Alexa-hosted skill). Caricata in modo difensivo.
let S3PersistenceAdapter = null;
try { S3PersistenceAdapter = require('ask-sdk-s3-persistence-adapter').S3PersistenceAdapter; } catch (e) { /* opzionale */ }

const REMINDERS_PERMISSION = 'alexa::alerts:reminders:skill:readwrite';
const TZ = 'Europe/Rome';

// ---------- modello dati ----------
const STREAMS = {
  umido:    { say: 'umido',           reminder: 'L\'umido va nei sacchetti biodegradabili.' },
  plastica: { say: 'plastica',        reminder: 'La plastica in sacchi legati, sfusa, niente sacchi neri.' },
  carta:    { say: 'carta',           reminder: 'La carta in scatole o sacchetti di carta, non di plastica.' },
  vetro:    { say: 'vetro con le lattine', reminder: 'Vetro e lattine negli appositi contenitori.' },
  secco:    { say: 'secco',           reminder: 'Il secco solo in sacchi trasparenti, i sacchi neri non vengono ritirati.' },
  verde:    { say: 'verde',           reminder: 'Il verde in sacchi a perdere aperti, le ramaglie in fascine.' }
};

const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];

// ---------- logica calendario ----------
// Calendario ufficiale: giorno di RACCOLTA -> rifiuti ritirati quel giorno.
const U = 'umido', P = 'plastica', C = 'carta', V = 'vetro', S = 'secco', G = 'verde';
const CAL_START = '2026-02-01';
const CAL_END = '2027-01-31';
const CALENDARIO = {
  '2026-02-03': [U,C,P],
  '2026-02-06': [U,S],
  '2026-02-10': [U,V,P],
  '2026-02-13': [U,S],
  '2026-02-16': [G],
  '2026-02-17': [U,C,P],
  '2026-02-20': [U,S],
  '2026-02-24': [U,V,P],
  '2026-02-27': [U,S],
  '2026-03-03': [U,C,P],
  '2026-03-06': [U,S],
  '2026-03-10': [U,V,P],
  '2026-03-13': [U,S],
  '2026-03-16': [G],
  '2026-03-17': [U,C,P],
  '2026-03-20': [U,S],
  '2026-03-24': [U,V,P],
  '2026-03-27': [U,S],
  '2026-03-30': [G],
  '2026-03-31': [U,C,P],
  '2026-04-03': [U,S],
  '2026-04-07': [U,V,P],
  '2026-04-10': [U,S],
  '2026-04-13': [G],
  '2026-04-14': [U,C,P],
  '2026-04-17': [U,S],
  '2026-04-20': [G],
  '2026-04-21': [U,V,P],
  '2026-04-24': [U,S],
  '2026-04-27': [G],
  '2026-04-28': [U,C,P],
  '2026-05-01': [S],
  '2026-05-04': [G],
  '2026-05-05': [U,V,P],
  '2026-05-08': [U,S],
  '2026-05-11': [G],
  '2026-05-12': [U,C,P],
  '2026-05-15': [U,S],
  '2026-05-18': [G],
  '2026-05-19': [U,V,P],
  '2026-05-22': [U,S],
  '2026-05-25': [G],
  '2026-05-26': [U,C,P],
  '2026-05-29': [U,S],
  '2026-06-01': [G],
  '2026-06-02': [V,P],
  '2026-06-05': [U,S],
  '2026-06-08': [G],
  '2026-06-09': [U,C,P],
  '2026-06-12': [U,S],
  '2026-06-15': [G],
  '2026-06-16': [U,V,P],
  '2026-06-19': [U,S],
  '2026-06-22': [G],
  '2026-06-23': [U,C,P],
  '2026-06-26': [U,S],
  '2026-06-30': [U,V,P],
  '2026-07-03': [U,S],
  '2026-07-06': [G],
  '2026-07-07': [U,C,P],
  '2026-07-10': [U,S],
  '2026-07-13': [G],
  '2026-07-14': [U,V,P],
  '2026-07-17': [U,S],
  '2026-07-21': [U,C,P],
  '2026-07-24': [U,S],
  '2026-07-27': [G],
  '2026-07-28': [U,V,P],
  '2026-07-31': [U,S],
  '2026-08-03': [G],
  '2026-08-04': [U,C,P],
  '2026-08-07': [U,S],
  '2026-08-10': [G],
  '2026-08-11': [U,V,P],
  '2026-08-14': [U,S],
  '2026-08-18': [U,C,P],
  '2026-08-21': [U,S],
  '2026-08-24': [G],
  '2026-08-25': [U,V,P],
  '2026-08-28': [U,S],
  '2026-09-01': [U,C,P],
  '2026-09-04': [U,S],
  '2026-09-07': [G],
  '2026-09-08': [U,V,P],
  '2026-09-11': [U,S],
  '2026-09-14': [G],
  '2026-09-15': [U,C,P],
  '2026-09-18': [U,S],
  '2026-09-22': [U,V,P],
  '2026-09-25': [U,S],
  '2026-09-28': [G],
  '2026-09-29': [U,C,P],
  '2026-10-02': [U,S],
  '2026-10-05': [G],
  '2026-10-06': [U,V,P],
  '2026-10-09': [U,S],
  '2026-10-13': [U,C,P],
  '2026-10-16': [U,S],
  '2026-10-19': [G],
  '2026-10-20': [U,V,P],
  '2026-10-23': [U,S],
  '2026-10-26': [G],
  '2026-10-27': [U,C,P],
  '2026-10-30': [U,S],
  '2026-11-02': [G],
  '2026-11-03': [U,V,P],
  '2026-11-06': [U,S],
  '2026-11-10': [U,C,P],
  '2026-11-13': [U,S],
  '2026-11-16': [G],
  '2026-11-17': [U,V,P],
  '2026-11-20': [U,S],
  '2026-11-24': [U,C,P],
  '2026-11-27': [U,S],
  '2026-11-30': [G],
  '2026-12-01': [U,V,P],
  '2026-12-04': [U,S],
  '2026-12-07': [G],
  '2026-12-08': [C,P],
  '2026-12-11': [U,S],
  '2026-12-15': [U,V,P],
  '2026-12-18': [U,S],
  '2026-12-21': [G],
  '2026-12-22': [U,C,P],
  '2026-12-26': [S],
  '2026-12-29': [U,V,P],
  '2027-01-02': [S],
  '2027-01-05': [U,C,P],
  '2027-01-08': [U,S],
  '2027-01-12': [U,V,P],
  '2027-01-15': [U,S],
  '2027-01-19': [U,C,P],
  '2027-01-22': [U,S],
  '2027-01-26': [U,V,P],
  '2027-01-29': [U,S],
};

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

// Schema settimanale di riserva (fuori dal calendario ufficiale; senza verde).
function tuesdayExtra(y, m, d) {
  const anchor = Date.UTC(2026, 5, 16, 12); // 16 giugno 2026 = Vetro
  const t = Date.UTC(y, m, d, 12);
  const weeks = Math.round((t - anchor) / (7 * 86400000));
  return (((weeks % 2) + 2) % 2 === 0) ? 'vetro' : 'carta';
}
function weeklyRule(y, m, d) {
  const wd = new Date(Date.UTC(y, m, d, 12)).getUTCDay();
  if (wd === 2) return [U, P, tuesdayExtra(y, m, d)];
  if (wd === 5) return [U, S];
  return [];
}

// Cosa passa il giorno (y, m, d).
function collectionOn(y, m, d) {
  const k = dateKey(y, m, d);
  if (k >= CAL_START && k <= CAL_END) {
    return { streams: CALENDARIO[k] || [], fromCalendar: true };
  }
  return { streams: weeklyRule(y, m, d), fromCalendar: false };
}

// Cosa esporre la sera del giorno (y, m, d): la raccolta del giorno dopo.
function exposeForEvening(y, m, d) {
  const t = new Date(Date.UTC(y, m, d, 12) + 86400000);
  const next = { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay() };
  const c = collectionOn(next.y, next.m, next.d);
  return { streams: c.streams, fromCalendar: c.fromCalendar, next };
}

// ---------- helper data/ora (Europe/Rome) ----------
function romeParts(handlerInput) {
  const ts = Alexa.getRequest(handlerInput.requestEnvelope).timestamp || new Date().toISOString();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(new Date(ts)).split('-').map(Number);
  return { y, m: m - 1, d };
}

function romeNowMinutes(handlerInput) {
  const ts = Alexa.getRequest(handlerInput.requestEnvelope).timestamp || new Date().toISOString();
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  const [hh, mm] = fmt.format(new Date(ts)).split(':').map(Number);
  return hh * 60 + mm;
}

function addDays(p, n) {
  const t = new Date(Date.UTC(p.y, p.m, p.d, 12) + n * 86400000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay() };
}

function joinIt(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
}

function fmtDay(p) {
  return `${GIORNI[new Date(Date.UTC(p.y, p.m, p.d, 12)).getUTCDay()]} ${p.d} ${MESI[p.m]}`;
}

const NOTTE_FINO_A = 6 * 60; // fino alle 6:00 si parla della raccolta di oggi
function isNight(handlerInput) { return romeNowMinutes(handlerInput) < NOTTE_FINO_A; }

function oneReminder(streams) {
  if (streams.includes('secco')) return STREAMS.secco.reminder;
  if (streams.includes('verde')) return STREAMS.verde.reminder;
  if (streams.includes('plastica')) return STREAMS.plastica.reminder;
  return '';
}
const FUORI_CALENDARIO = ' Il calendario che conosco arriva fino a gennaio 2027: verifica quello nuovo di Casalasca Servizi.';

function speakEvening(p, label) {
  const res = exposeForEvening(p.y, p.m, p.d);
  let s;
  if (res.streams.length === 0) {
    s = `${label} non devi mettere fuori niente: ${fmtDay(res.next)} non c'è raccolta.`;
  } else {
    s = `${label} devi mettere fuori ${joinIt(res.streams.map(k => STREAMS[k].say))}.`;
    const rem = oneReminder(res.streams);
    if (rem) s += ' ' + rem;
  }
  if (!res.fromCalendar) s += FUORI_CALENDARIO;
  return s;
}

// Raccolta di oggi (usata di notte).
function speakToday(p) {
  const c = collectionOn(p.y, p.m, p.d);
  let s;
  if (c.streams.length === 0) {
    s = `Oggi, ${fmtDay(p)}, non passa nessuna raccolta.`;
  } else {
    s = `Oggi, ${fmtDay(p)}, passa ${joinIt(c.streams.map(k => STREAMS[k].say))}. Se non l'hai ancora fatto, mettili fuori adesso.`;
    const rem = oneReminder(c.streams);
    if (rem) s += ' ' + rem;
  }
  if (!c.fromCalendar) s += FUORI_CALENDARIO;
  return s;
}

// Risposta alla domanda "cosa metto fuori" adesso: di notte la raccolta di oggi, altrimenti stasera.
function speakNow(handlerInput) {
  const today = romeParts(handlerInput);
  return isNight(handlerInput) ? speakToday(today) : speakEvening(today, 'Stasera');
}

// ---------- promemoria ----------

function buildReminderRequest(p, timeHHMM, text) {
  const scheduledTime = `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${timeHHMM}:00`;
  return {
    requestTime: new Date().toISOString().substring(0, 19),
    trigger: {
      type: 'SCHEDULED_ABSOLUTE',
      scheduledTime,
      timeZoneId: TZ
    },
    alertInfo: {
      spokenInfo: { content: [{ locale: 'it-IT', text }] }
    },
    pushNotification: { status: 'ENABLED' }
  };
}

// Cancella i promemoria della skill e ricrea le sere-di-raccolta dei prossimi 14 giorni.
async function syncReminders(handlerInput, timeHHMM) {
  const rm = handlerInput.serviceClientFactory.getReminderManagementServiceClient();

  // pulizia (solo i promemoria creati da questa skill sono visibili)
  try {
    const existing = await rm.getReminders();
    const alerts = (existing && existing.alerts) || [];
    for (const a of alerts) {
      try { await rm.deleteReminder(a.alertToken); } catch (e) { /* continua */ }
    }
  } catch (e) { /* se non c'è permesso, l'errore esce dal createReminder sotto */ }

  const start = romeParts(handlerInput);
  const nowMin = romeNowMinutes(handlerInput);
  const [hh, mi] = timeHHMM.split(':').map(Number);
  const targetMin = hh * 60 + mi;

  let count = 0;
  for (let i = 0; i < 14; i++) {
    const p = addDays(start, i);
    const res = exposeForEvening(p.y, p.m, p.d);
    if (res.streams.length === 0) continue;
    if (i === 0 && targetMin <= nowMin) continue; // oggi l'orario è già passato
    const names = res.streams.map(k => STREAMS[k].say);
    const text = `Raccolta Persico Dosimo. Stasera metti fuori ${joinIt(names)}.`;
    await rm.createReminder(buildReminderRequest(p, timeHHMM, text));
    count++;
  }
  return count;
}

function isPermissionError(err) {
  const code = err && (err.statusCode || (err.response && err.response.status));
  return code === 401 || code === 403;
}

async function loadPrefs(handlerInput) {
  try {
    const a = await handlerInput.attributesManager.getPersistentAttributes();
    return a || {};
  } catch (e) { return {}; }
}
async function savePrefs(handlerInput, prefs) {
  try {
    handlerInput.attributesManager.setPersistentAttributes(prefs);
    await handlerInput.attributesManager.savePersistentAttributes();
  } catch (e) { /* persistenza non disponibile: ignora */ }
}

// ---------- handler ----------
const LaunchRequestHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest'; },
  async handle(h) {
    const speak = speakNow(h);
    // rigenera i promemoria, se attivi
    try {
      const prefs = await loadPrefs(h);
      if (prefs.enabled && prefs.reminderTime && h.serviceClientFactory) {
        await syncReminders(h, prefs.reminderTime);
      }
    } catch (e) { /* silenzioso al lancio */ }
    return h.responseBuilder
      .speak(speak + ' Vuoi sapere altro?')
      .reprompt('Puoi chiedermi cosa mettere fuori domani sera, o dire: ricordamelo ogni giorno alle 19.')
      .withSimpleCard('Raccolta Persico Dosimo', speak)
      .getResponse();
  }
};

const CosaStaseraHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'CosaStaseraIntent';
  },
  handle(h) {
    const speak = speakNow(h);
    return h.responseBuilder.speak(speak).withSimpleCard('Raccolta Persico Dosimo', speak).getResponse();
  }
};

const CosaDomaniHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'CosaDomaniIntent';
  },
  handle(h) {
    // di notte "domani sera" e' la sera del giorno appena iniziato
    const today = romeParts(h);
    const speak = isNight(h)
      ? speakEvening(today, `Questa sera, ${fmtDay(today)},`)
      : speakEvening(addDays(today, 1), 'Domani sera');
    return h.responseBuilder.speak(speak).withSimpleCard('Raccolta Persico Dosimo', speak).getResponse();
  }
};

const CosaDataHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'CosaDataIntent';
  },
  handle(h) {
    const slot = Alexa.getSlotValue(h.requestEnvelope, 'data');
    if (!slot || !/^\d{4}-\d{2}-\d{2}$/.test(slot)) {
      const speak = 'Non ho capito bene la data. Prova a dirmi un giorno preciso, ad esempio "cosa metto fuori lunedì".';
      return h.responseBuilder.speak(speak).reprompt(speak).getResponse();
    }
    const [y, m, d] = slot.split('-').map(Number);
    const p = { y, m: m - 1, d };
    const speak = speakEvening(p, `La sera di ${fmtDay(p)}`);
    return h.responseBuilder.speak(speak).withSimpleCard('Raccolta Persico Dosimo', speak).getResponse();
  }
};

const ProssimiGiorniHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'ProssimiGiorniIntent';
  },
  handle(h) {
    const start = romeParts(h);
    const parts = [];
    if (isNight(h)) {
      const c = collectionOn(start.y, start.m, start.d);
      if (c.streams.length > 0) parts.push(`oggi passa ${joinIt(c.streams.map(k => STREAMS[k].say))}`);
    }
    for (let i = 0; i < 7; i++) {
      const p = addDays(start, i);
      const res = exposeForEvening(p.y, p.m, p.d);
      if (res.streams.length > 0) {
        const names = res.streams.map(k => STREAMS[k].say);
        const label = (i === 0) ? 'stasera' : `la sera di ${fmtDay(p)}`;
        parts.push(`${label}, ${joinIt(names)}`);
      }
    }
    const speak = parts.length ? 'Nei prossimi giorni: ' + parts.join('; ') + '.'
                               : 'Nei prossimi sette giorni non risultano raccolte.';
    return h.responseBuilder.speak(speak).withSimpleCard('Prossime raccolte', speak).getResponse();
  }
};

// "Quando passa il secco?" -> prossimo giorno di raccolta di quel rifiuto.
const RIFIUTO_IDS = ['umido', 'plastica', 'carta', 'vetro', 'secco', 'verde'];
const ARTICOLO = { umido: "l'umido", plastica: 'la plastica', carta: 'la carta', vetro: 'il vetro con le lattine', secco: 'il secco', verde: 'il verde' };
const PRONOME = { umido: 'mettilo', plastica: 'mettila', carta: 'mettila', vetro: 'mettili', secco: 'mettilo', verde: 'mettilo' };

function rifiutoFromSlot(handlerInput) {
  const slot = Alexa.getSlot(handlerInput.requestEnvelope, 'rifiuto');
  if (!slot) return null;
  try {
    const rpa = slot.resolutions.resolutionsPerAuthority.find(r => r.status.code === 'ER_SUCCESS_MATCH');
    if (rpa) return rpa.values[0].value.id;
  } catch (e) { /* nessuna risoluzione */ }
  const v = (slot.value || '').toLowerCase();
  return RIFIUTO_IDS.find(id => v.includes(id)) || null;
}

// Prossime raccolte di `stream`: di notte conta anche oggi, altrimenti da domani.
function nextCollections(handlerInput, stream, max) {
  const today = romeParts(handlerInput);
  const out = [];
  for (let i = isNight(handlerInput) ? 0 : 1; i <= 90 && out.length < max; i++) {
    const p = addDays(today, i);
    const c = collectionOn(p.y, p.m, p.d);
    if (c.streams.includes(stream)) out.push({ p, i, fromCalendar: c.fromCalendar });
  }
  return out;
}

function speakQuando(handlerInput, stream) {
  const list = nextCollections(handlerInput, stream, 2);
  const nome = ARTICOLO[stream];
  if (list.length === 0) {
    return stream === 'verde'
      ? 'Non conosco ancora le prossime date del verde: il calendario che ho arriva a gennaio 2027. Verifica quello nuovo di Casalasca Servizi.'
      : `Non trovo raccolte per ${nome} nei prossimi tre mesi. Verifica il calendario di Casalasca Servizi.`;
  }
  const first = list[0];
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1);
  let s;
  if (first.i === 0) {
    s = `${Nome} passa oggi, ${fmtDay(first.p)}: se non l'hai già fatto, ${PRONOME[stream]} fuori adesso.`;
  } else {
    const sera = first.i === 1 ? 'stasera' : `la sera di ${fmtDay(addDays(first.p, -1))}`;
    s = `${Nome} passa ${fmtDay(first.p)}: ${PRONOME[stream]} fuori ${sera}.`;
  }
  if (list[1]) s += ` La raccolta successiva è ${fmtDay(list[1].p)}.`;
  if (!first.fromCalendar) s += FUORI_CALENDARIO;
  return s;
}

const QuandoPassaHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'QuandoPassaIntent';
  },
  handle(h) {
    const stream = rifiutoFromSlot(h);
    if (!stream) {
      const ask = 'Quale rifiuto? Puoi chiedermi di umido, plastica, carta, vetro, secco o verde.';
      return h.responseBuilder.speak(ask).reprompt(ask).getResponse();
    }
    const speak = speakQuando(h, stream);
    return h.responseBuilder.speak(speak).withSimpleCard('Raccolta Persico Dosimo', speak).getResponse();
  }
};

// Imposta il promemoria giornaliero all'orario indicato.
const ImpostaPromemoriaHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'ImpostaPromemoriaIntent';
  },
  async handle(h) {
    // permesso Reminders?
    const perms = (h.requestEnvelope.context.System.user.permissions) || {};
    const consentToken = perms.consentToken;
    const timeSlot = Alexa.getSlotValue(h.requestEnvelope, 'ora');

    if (!timeSlot || !/^\d{2}:\d{2}$/.test(timeSlot)) {
      const speak = 'A che ora vuoi il promemoria? Dimmi un orario preciso, ad esempio "ricordamelo ogni giorno alle 19".';
      return h.responseBuilder.speak(speak).reprompt(speak).getResponse();
    }

    if (!consentToken) {
      return h.responseBuilder
        .speak('Per ricordarti la raccolta devo poter creare promemoria. Ti ho inviato una richiesta di autorizzazione nell\'app Alexa: abilitala e poi riprova.')
        .withAskForPermissionsConsentCard([REMINDERS_PERMISSION])
        .getResponse();
    }

    try {
      const n = await syncReminders(h, timeSlot);
      await savePrefs(h, { enabled: true, reminderTime: timeSlot });
      const speak = n > 0
        ? `Perfetto. Ti ricorderò cosa mettere fuori alle ${timeSlot.replace(':', ' e ')}, solo le sere in cui c'è raccolta. Ho già programmato i prossimi promemoria.`
        : `Va bene, promemoria attivati per le ${timeSlot.replace(':', ' e ')}. Nei prossimi giorni non ci sono raccolte, ma li creerò automaticamente quando servono.`;
      return h.responseBuilder.speak(speak).withSimpleCard('Promemoria attivati', speak).getResponse();
    } catch (err) {
      if (isPermissionError(err)) {
        return h.responseBuilder
          .speak('Non ho ancora il permesso per i promemoria. Abilitalo nell\'app Alexa e riprova.')
          .withAskForPermissionsConsentCard([REMINDERS_PERMISSION])
          .getResponse();
      }
      console.log('Errore promemoria: ' + (err && err.stack ? err.stack : err));
      const speak = 'Non sono riuscito a impostare il promemoria. Riprova più tardi.';
      return h.responseBuilder.speak(speak).getResponse();
    }
  }
};

// Disattiva i promemoria.
const DisattivaPromemoriaHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'DisattivaPromemoriaIntent';
  },
  async handle(h) {
    try {
      const rm = h.serviceClientFactory.getReminderManagementServiceClient();
      const existing = await rm.getReminders();
      for (const a of ((existing && existing.alerts) || [])) {
        try { await rm.deleteReminder(a.alertToken); } catch (e) { /* continua */ }
      }
    } catch (e) { /* se non c'è permesso non c'è nulla da cancellare */ }
    await savePrefs(h, { enabled: false });
    const speak = 'Ho disattivato i promemoria della raccolta.';
    return h.responseBuilder.speak(speak).withSimpleCard('Promemoria disattivati', speak).getResponse();
  }
};

const HelpHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(h) {
    const speak = 'Posso dirti cosa esporre la sera prima della raccolta, o quando passa un rifiuto. Prova: cosa metto fuori stasera. Oppure: quando passa il secco.';
    return h.responseBuilder.speak(speak).reprompt(speak).getResponse();
  }
};

const StopHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(Alexa.getIntentName(h.requestEnvelope));
  },
  handle(h) { return h.responseBuilder.speak('A presto!').getResponse(); }
};

const FallbackHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(h) {
    const speak = 'Non ho capito. Puoi chiedermi cosa mettere fuori stasera, o quando passa il secco.';
    return h.responseBuilder.speak(speak).reprompt(speak).getResponse();
  }
};

const SessionEndedHandler = {
  canHandle(h) { return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest'; },
  handle(h) { return h.responseBuilder.getResponse(); }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(h, error) {
    console.log('Errore: ' + (error && error.stack ? error.stack : error));
    const speak = 'Scusa, c\'è stato un problema. Riprova.';
    return h.responseBuilder.speak(speak).reprompt(speak).getResponse();
  }
};

// ---------- build ----------
let builder = Alexa.SkillBuilders.custom()
  .withApiClient(new Alexa.DefaultApiClient())
  .addRequestHandlers(
    LaunchRequestHandler,
    CosaStaseraHandler,
    CosaDomaniHandler,
    CosaDataHandler,
    ProssimiGiorniHandler,
    QuandoPassaHandler,
    ImpostaPromemoriaHandler,
    DisattivaPromemoriaHandler,
    HelpHandler,
    StopHandler,
    FallbackHandler,
    SessionEndedHandler
  )
  .addErrorHandlers(ErrorHandler);

if (S3PersistenceAdapter && process.env.S3_PERSISTENCE_BUCKET) {
  builder = builder.withPersistenceAdapter(
    new S3PersistenceAdapter({ bucketName: process.env.S3_PERSISTENCE_BUCKET })
  );
}

exports.handler = builder.lambda();
