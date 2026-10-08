'use strict';

/**
 * Skill Alexa "Raccolta Persico Dosimo" — Persico Dosimo (Casalasca Servizi).
 *
 * Regola settimanale (espone la sera prima):
 *   - Martedì raccolta:  Umido + Plastica + (Carta o Vetro/Lattine, alternati ogni martedì)
 *   - Venerdì raccolta:  Umido + Secco
 *   - Lunedì raccolta:   Verde (settimanale in primavera/estate, ridotto in inverno)
 *
 * Ancora alternanza Carta/Vetro:  martedì 16 giugno 2026 = Vetro/Lattine.
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
  vetro:    { say: 'vetro e lattine', reminder: 'Vetro e lattine negli appositi contenitori.' },
  secco:    { say: 'secco',           reminder: 'Il secco solo in sacchi trasparenti, i sacchi neri non vengono ritirati.' },
  verde:    { say: 'verde',           reminder: 'Il verde in sacchi a perdere aperti, le ramaglie in fascine.' }
};

const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];

// ---------- logica calendario ----------
function tuesdayExtra(y, m, d) {
  const anchor = Date.UTC(2026, 5, 16, 12); // 16 giugno 2026 = Vetro
  const t = Date.UTC(y, m, d, 12);
  const weeks = Math.round((t - anchor) / (7 * 86400000));
  return (((weeks % 2) + 2) % 2 === 0) ? 'vetro' : 'carta';
}

function exposeForEvening(y, m, d) {
  const tomorrow = new Date(Date.UTC(y, m, d, 12) + 86400000);
  const ny = tomorrow.getUTCFullYear();
  const nm = tomorrow.getUTCMonth();
  const nd = tomorrow.getUTCDate();
  const wd = tomorrow.getUTCDay();

  let streams = [];
  let winterVerde = false;
  if (wd === 2) {
    streams = ['umido', 'plastica', tuesdayExtra(ny, nm, nd)];
  } else if (wd === 5) {
    streams = ['umido', 'secco'];
  } else if (wd === 1) {
    streams = ['verde'];
    winterVerde = [11, 0, 1, 2].includes(nm);
  }
  return { streams, winterVerde, next: { y: ny, m: nm, d: nd, wd } };
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

function speakEvening(p, label) {
  const res = exposeForEvening(p.y, p.m, p.d);
  if (res.streams.length === 0) {
    return `${label} non devi mettere fuori niente: domani non c'è raccolta.`;
  }
  const names = res.streams.map(k => STREAMS[k].say);
  let s = `${label} devi mettere fuori ${joinIt(names)}.`;
  let rem = '';
  if (res.streams.includes('secco')) rem = STREAMS.secco.reminder;
  else if (res.streams.includes('verde')) rem = STREAMS.verde.reminder;
  else if (res.streams.includes('plastica')) rem = STREAMS.plastica.reminder;
  if (rem) s += ' ' + rem;
  if (res.winterVerde) s += ' Attenzione: in inverno il verde passa più di rado, controlla il calendario.';
  return s;
}

// ---------- promemoria ----------
function pad(n) { return String(n).padStart(2, '0'); }

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
    const speak = speakEvening(romeParts(h), 'Stasera');
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
    const speak = speakEvening(romeParts(h), 'Stasera');
    return h.responseBuilder.speak(speak).withSimpleCard('Raccolta Persico Dosimo', speak).getResponse();
  }
};

const CosaDomaniHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'CosaDomaniIntent';
  },
  handle(h) {
    const speak = speakEvening(addDays(romeParts(h), 1), 'Domani sera');
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
    const speak = 'Posso dirti cosa esporre la sera prima della raccolta. Prova: cosa metto fuori stasera. Oppure: ricordamelo ogni giorno alle 19.';
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
    const speak = 'Non ho capito. Puoi chiedermi cosa mettere fuori stasera, o dire: ricordamelo ogni giorno alle 19.';
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
