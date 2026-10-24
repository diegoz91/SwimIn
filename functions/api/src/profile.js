/**
 * Profili e pagine struttura: tutte le scritture passano da qui.
 * Il client non ha permessi di modifica sui profili, così non può alterare campi
 * che il resto del sistema considera affidabili (collegamenti, tipo di account,
 * bollini di verifica dei brevetti) e i dati vengono sempre validati.
 */
import { ID, Permission, Role } from 'node-appwrite';
import { readFileSync } from 'node:fs';

let ANAGRAFICA = null;
/** Province e comuni ISTAT (generati da scripts/anagrafica, copiati nella Function). */
const anagrafica = () => {
  if (ANAGRAFICA) return ANAGRAFICA;
  try {
    ANAGRAFICA = JSON.parse(readFileSync(new URL('./data/comuni.json', import.meta.url), 'utf8'));
  } catch {
    ANAGRAFICA = {}; // senza file: si controlla solo il formato della sigla
  }
  return ANAGRAFICA;
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase().trim();
const isMonth = (v) => /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(v);
const isDay = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const todayIso = () => new Date().toISOString().slice(0, 10);

export const SLOTS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].flatMap((d) => ['mattina', 'pomeriggio', 'sera'].map((p) => `${d}-${p}`));
export const PERSON_TYPES = ['professional', 'enthusiast'];
const POOL_SETTINGS = ['coperta', 'scoperta', 'entrambe'];
const CERT_CATEGORIES = ['salvamento', 'istruzione', 'allenamento', 'primo_soccorso', 'sicurezza', 'specializzazione', 'manutenzione', 'altro'];

/** Regole condivise con il client (utils/validation.ts): qui tornano messaggi d'errore. */
export const validators = {
  text(v, label, { min = 0, max = 255, required = false } = {}) {
    const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v == null ? '' : null;
    if (s === null) return [null, `${label}: valore non valido.`];
    if (!s) return required ? [null, `${label}: campo obbligatorio.`] : ['', null];
    if (s.length < min) return [null, `${label}: almeno ${min} caratteri.`];
    if (s.length > max) return [null, `${label}: massimo ${max} caratteri.`];
    return [s, null];
  },
  longText(v, label, max) {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : null;
    if (s === null) return [null, `${label}: valore non valido.`];
    return s.length > max ? [null, `${label}: massimo ${max} caratteri.`] : [s, null];
  },
  personName(v, label) {
    const [s, err] = validators.text(v, label, { min: 2, max: 50, required: true });
    if (err) return [null, err];
    return /^[\p{L}][\p{L}\p{M}'’\- .]*$/u.test(s) ? [s, null] : [null, `${label}: usa solo lettere, spazi, apostrofi o trattini.`];
  },
  phone(v) {
    if (v == null || v === '') return ['', null];
    const n = String(v).replace(/[\s.\-/()]/g, '');
    if (!/^(\+|00)?\d+$/.test(n)) return [null, 'Telefono non valido.'];
    const intl = /^(\+|00)/.test(n) && !/^(\+|00)39/.test(n);
    const digits = intl ? n.replace(/^(\+|00)/, '') : n.replace(/^(\+|00)39/, '');
    const ok = intl ? digits.length >= 7 && digits.length <= 15 : digits.length >= 6 && digits.length <= 11 && /^[03]/.test(digits);
    return ok ? [n.replace(/^0039/, '+39'), null] : [null, 'Telefono non valido.'];
  },
  url(v) {
    if (v == null || String(v).trim() === '') return ['', null];
    let s = String(v).trim();
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    try {
      const u = new URL(s);
      if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || s.length > 500) throw new Error('url');
      return [u.toString(), null];
    } catch {
      return [null, 'Indirizzo web non valido.'];
    }
  },
  vat(v) {
    if (v == null || v === '') return ['', null];
    const n = String(v).trim().replace(/^IT/i, '').replace(/\s/g, '');
    if (!/^\d{11}$/.test(n)) return [null, 'La partita IVA è formata da 11 cifre.'];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let d = Number(n[i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return (10 - (sum % 10)) % 10 === Number(n[10]) ? [n, null] : [null, 'Partita IVA non valida.'];
  },
  intOrNull(v, label, min, max) {
    if (v == null || v === '') return [null, null];
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? [n, null] : [null, `${label}: valore tra ${min} e ${max}.`];
  },
  /** Provincia (sigla) e comune che le appartiene, secondo l'anagrafica ISTAT. */
  location(city, province, { required = true } = {}) {
    const p = String(province || '').trim().toUpperCase();
    const c = String(city || '').trim().replace(/\s+/g, ' ');
    if (!p && !c) return required ? [null, 'Indica provincia e comune.'] : [{ city: '', province: '' }, null];
    if (!/^[A-Z]{2}$/.test(p)) return [null, 'Provincia non valida.'];
    const data = anagrafica();
    if (Object.keys(data).length) {
      if (!data[p]) return [null, 'Provincia non valida.'];
      const official = data[p].find((n) => norm(n) === norm(c));
      if (!official) return [null, 'Il comune non appartiene alla provincia indicata.'];
      return [{ city: official, province: p }, null];
    }
    if (c.length < 2 || c.length > 80) return [null, 'Comune non valido.'];
    return [{ city: c, province: p }, null];
  },
  stringList(v, label, { maxItems, maxLen, allowed }) {
    if (v == null) return [[], null];
    if (!Array.isArray(v)) return [null, `${label}: valore non valido.`];
    const out = [];
    for (const raw of v) {
      const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
      if (!s) continue;
      if (s.length > maxLen) return [null, `${label}: "${s.slice(0, 20)}…" è troppo lungo.`];
      if (allowed && !allowed.includes(s)) return [null, `${label}: valore non ammesso (${s}).`];
      if (!out.includes(s)) out.push(s);
    }
    if (out.length > maxItems) return [null, `${label}: massimo ${maxItems} elementi.`];
    return [out, null];
  },
};

/** Esperienze: JSON validati, ordine conservato. */
export function cleanExperiences(list) {
  if (!Array.isArray(list)) return [null, 'Esperienze: valore non valido.'];
  if (list.length > 30) return [null, 'Esperienze: massimo 30.'];
  const thisMonth = new Date().toISOString().slice(0, 7);
  const out = [];
  for (const raw of list) {
    let e;
    try { e = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return [null, 'Esperienza non leggibile.']; }
    if (!e || typeof e !== 'object') return [null, 'Esperienza non valida.'];
    const [role, e1] = validators.text(e.role, 'Ruolo', { min: 2, max: 100, required: true });
    const [facility, e2] = validators.text(e.facility, 'Struttura', { min: 2, max: 120, required: true });
    const [description, e3] = validators.longText(e.description, 'Descrizione', 1000);
    const [city, e4] = validators.text(e.city, 'Città', { max: 80 });
    const [employmentType, e5] = validators.text(e.employmentType, 'Tipo di rapporto', { max: 40 });
    const err = e1 || e2 || e3 || e4 || e5;
    if (err) return [null, err];
    const clean = { role, facility };
    if (employmentType) clean.employmentType = employmentType;
    if (city) clean.city = city;
    if (e.startDate) {
      if (!isMonth(e.startDate) || e.startDate > thisMonth) return [null, `Data di inizio non valida per "${role}".`];
      clean.startDate = e.startDate;
      if (e.current) clean.current = true;
      else {
        if (!isMonth(e.endDate) || e.endDate > thisMonth || e.endDate < e.startDate) return [null, `Data di fine non valida per "${role}".`];
        clean.endDate = e.endDate;
      }
    } else {
      const [period, e6] = validators.text(e.period, 'Periodo', { max: 60 });
      if (e6) return [null, e6];
      if (period) clean.period = period; // formato vecchio, solo lettura
    }
    if (description) clean.description = description;
    const json = JSON.stringify(clean);
    if (json.length > 2500) return [null, `Esperienza "${role}" troppo lunga.`];
    out.push(json);
  }
  return [out, null];
}

const CERT_SERVER_FIELDS = ['verified', 'verifiedAt', 'verifiedBy', 'documentFileId', 'verificationStatus', 'verificationNote'];
const certKey = (c) => [c.name, c.issuer, c.issueDate || '', c.expiry || '', c.credentialId || ''].map(norm).join('|');

/**
 * Brevetti validati. Ogni brevetto ha un id stabile; i campi di verifica li
 * scrive solo il server e restano validi solo se il brevetto non cambia.
 */
export function cleanCertifications(list, previous = []) {
  if (!Array.isArray(list)) return [null, 'Brevetti: valore non valido.'];
  if (list.length > 40) return [null, 'Brevetti: massimo 40.'];
  const prev = new Map();
  for (const raw of previous || []) {
    try { const c = JSON.parse(raw); if (c?.id) prev.set(c.id, c); } catch { /* ignorato */ }
  }
  const today = todayIso();
  const out = [];
  for (const raw of list) {
    let c;
    try { c = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return [null, 'Brevetto non leggibile.']; }
    if (!c || typeof c !== 'object') return [null, 'Brevetto non valido.'];
    const [name, e1] = validators.text(c.name, 'Nome del brevetto', { min: 3, max: 120, required: true });
    const [issuer, e2] = validators.text(c.issuer, 'Ente', { min: 2, max: 120, required: true });
    const [credentialId, e3] = validators.text(c.credentialId, 'Numero', { max: 40 });
    if (e1 || e2 || e3) return [null, e1 || e2 || e3];
    const category = CERT_CATEGORIES.includes(c.category) ? c.category : CERT_CATEGORIES.find((k) => norm(k.replace('_', ' ')) === norm(c.category)) || (c.category ? 'altro' : '');
    if (c.issueDate && (!isDay(c.issueDate) || c.issueDate > today)) return [null, `Data di rilascio non valida per "${name}".`];
    if (c.expiry && (!isDay(c.expiry) || (c.issueDate && c.expiry < c.issueDate))) return [null, `Scadenza non valida per "${name}".`];
    const clean = { id: typeof c.id === 'string' && /^[A-Za-z0-9_-]{3,36}$/.test(c.id) ? c.id : ID.unique(), name, issuer, category };
    if (c.issueDate) clean.issueDate = c.issueDate;
    if (c.expiry) clean.expiry = c.expiry;
    if (credentialId) clean.credentialId = credentialId;
    const old = prev.get(clean.id);
    if (old) {
      // documento allegato e stato di verifica: restano finché il brevetto è lo stesso
      if (old.documentFileId) clean.documentFileId = old.documentFileId;
      if (certKey(old) === certKey(clean)) {
        for (const k of CERT_SERVER_FIELDS) if (old[k] !== undefined) clean[k] = old[k];
      }
    }
    out.push(JSON.stringify(clean));
  }
  return [out, null];
}

/**
 * @param ctx helper della Function (find, get, create, update, fail, users, endpoint)
 */
/** Una riga "sta scrivendo" per persona (id = utente: ne scrive una conversazione alla volta). */
const typingKey = (userId) => userId;

export function profileActions({ find, get, create, update, remove = async () => null, fail, users, endpoint, C, isRecruiterOf = async () => false, Permission = null, Role = null }) {
  /** URL di un'immagine caricata nello storage di questo progetto (no link esterni/traccianti). */
  const storageUrl = (v, label) => {
    if (v == null || v === '') return '';
    const s = String(v);
    // Solo file del nostro storage Appwrite (niente immagini esterne o pixel traccianti).
    const host = (() => { try { return new URL(s).host; } catch { return ''; } })();
    const sameHost = host.endsWith('.appwrite.io') || host === 'appwrite.io' || (endpoint && endpoint.includes(`//${host}`));
    const ok = /^https:\/\//.test(s) && sameHost && /\/storage\/buckets\/(avatars|post_media)\/files\/[^/]+\/(view|preview)/.test(s);
    if (!ok || s.length > 2048) fail(400, `${label}: immagine non valida.`);
    return s;
  };

  const take = ([value, err]) => {
    if (err) fail(400, err);
    return value;
  };

  /** Campi modificabili e loro regole, per tipo di account. */
  const build = (profile, data) => {
    const out = {};
    const isPerson = profile.userType === 'professional';
    const has = (k) => Object.prototype.hasOwnProperty.call(data, k);

    if (has('bio')) out.bio = take(validators.longText(data.bio, 'Presentazione', 2500));
    if (has('city') || has('province')) {
      const loc = take(validators.location(has('city') ? data.city : profile.city, has('province') ? data.province : profile.province, { required: false }));
      out.city = loc.city;
      out.province = loc.province;
    }
    if (has('phone')) out.phone = take(validators.phone(data.phone));
    if (has('website')) out.website = take(validators.url(data.website));
    if (has('cover')) out.cover = storageUrl(data.cover, 'Copertina');
    if (has('readReceipts')) out.readReceipts = !!data.readReceipts;
    // Scheda pubblica (anche senza account): le persone scelgono, le strutture sono sempre pubbliche.
    if (has('publicProfile') && isPerson) out.publicProfile = !!data.publicProfile;
    // Visite ai profili altrui in forma anonima ("Qualcuno ha visualizzato il tuo profilo").
    if (has('hideProfileViews')) out.hideProfileViews = !!data.hideProfileViews;

    if (isPerson) {
      if (has('firstName')) out.firstName = take(validators.personName(data.firstName, 'Nome'));
      if (has('lastName')) out.lastName = take(validators.personName(data.lastName, 'Cognome'));
      if (has('title')) out.title = take(validators.text(data.title, 'Qualifica', { max: 100 }));
      if (has('avatar')) out.avatar = storageUrl(data.avatar, 'Foto');
      if (has('experienceList')) out.experienceList = take(cleanExperiences(data.experienceList));
      if (has('certificationsList')) out.certificationsList = take(cleanCertifications(data.certificationsList, profile.certificationsList));
      if (has('skills')) out.skills = take(validators.stringList(data.skills, 'Competenze', { maxItems: 20, maxLen: 60 }));
      if (has('languages')) out.languages = take(validators.stringList(data.languages, 'Lingue', { maxItems: 8, maxLen: 40 }));
      if (has('availability')) out.availability = SLOTS.filter((s) => Array.isArray(data.availability) && data.availability.includes(s));
      if (has('availableForEmergencies')) out.availableForEmergencies = !!data.availableForEmergencies;
      if (has('personType')) {
        if (!PERSON_TYPES.includes(data.personType)) fail(400, 'Tipo di profilo non valido.');
        out.personType = data.personType;
      }
      if (has('sports')) out.sports = take(validators.stringList(data.sports, 'Attività', { maxItems: 15, maxLen: 60 }));
    } else {
      if (has('structureName')) out.structureName = take(validators.text(data.structureName, 'Nome della struttura', { min: 2, max: 120, required: true }));
      if (has('structureType')) out.structureType = take(validators.text(data.structureType, 'Tipo', { max: 80 }));
      if (has('logo')) out.logo = storageUrl(data.logo, 'Logo');
      if (has('address')) out.address = take(validators.text(data.address, 'Indirizzo', { max: 160 }));
      if (has('postalCode')) {
        const cap = String(data.postalCode || '').trim();
        if (cap && !/^\d{5}$/.test(cap)) fail(400, 'Il CAP è formato da 5 cifre.');
        out.postalCode = cap;
      }
      if (has('vatNumber')) out.vatNumber = take(validators.vat(data.vatNumber));
      if (has('poolLength')) out.poolLength = take(validators.intOrNull(data.poolLength, 'Lunghezza vasca', 10, 100));
      if (has('lanes')) out.lanes = take(validators.intOrNull(data.lanes, 'Corsie', 1, 20));
      if (has('poolSetting')) {
        if (data.poolSetting && !POOL_SETTINGS.includes(data.poolSetting)) fail(400, 'Tipo di vasche non valido.');
        out.poolSetting = data.poolSetting || null;
      }
      if (has('services')) out.services = take(validators.stringList(data.services, 'Attività', { maxItems: 20, maxLen: 60 }));
    }
    return out;
  };

  /** Riga privata dell'utente (nessun permesso: la legge solo la Function). */
  const savePrivate = async (me, data) => {
    const existing = await find(C.privateInfo, me);
    if (existing) return update(C.privateInfo, me, data);
    return create(C.privateInfo, data, [], me);
  };

  return {
    /** Crea il profilo alla registrazione (idempotente). Email e id vengono dall'account. */
    async initProfile(me, { userType, personType, firstName, lastName, structureName }) {
      const existing = await find(C.profiles, me);
      if (existing) return existing;
      if (!['professional', 'structure'].includes(userType)) fail(400, 'Tipo di account non valido.');
      // L'email resta nell'account: il profilo è leggibile da tutti gli utenti, l'email no.
      const base = { userId: me, userType, readReceipts: true, isOnline: true, connections: [] };
      const data =
        userType === 'professional'
          ? {
              ...base,
              firstName: take(validators.personName(firstName, 'Nome')),
              lastName: take(validators.personName(lastName, 'Cognome')),
              personType: PERSON_TYPES.includes(personType) ? personType : 'professional',
              availableForEmergencies: false,
            }
          : { ...base, structureName: take(validators.text(structureName, 'Nome della struttura', { min: 2, max: 120, required: true })) };
      // Lettura per tutti gli utenti (anche dal permesso della tabella); nessuna scrittura dal client.
      return create(C.profiles, data, [Permission.read(Role.users())], me);
    },

    /** Modifica del proprio profilo: solo i campi ammessi, validati. */
    async updateMyProfile(me, data = {}) {
      const profile = await get(C.profiles, me);
      const out = build(profile, data && typeof data === 'object' ? data : {});
      // Il telefono di una persona è privato (lo vedono collegamenti e chi valuta una sua candidatura):
      // va in una tabella senza permessi di lettura, non sul profilo pubblico.
      if (profile.userType === 'professional' && Object.prototype.hasOwnProperty.call(out, 'phone')) {
        await savePrivate(me, { phone: out.phone || null });
        out.phone = null;
      }
      if (!Object.keys(out).length) return profile;
      return update(C.profiles, me, out);
    },

    /**
     * Email e telefono di un profilo, solo a chi può vederli: la persona stessa,
     * i suoi collegamenti, chi gestisce un annuncio a cui si è candidata.
     * Per le strutture il telefono è pubblico (è un recapito aziendale).
     */
    async getContactInfo(me, { profileId } = {}) {
      if (typeof profileId !== 'string' || !profileId) fail(400, 'Parametro mancante: profileId');
      const profile = await get(C.profiles, profileId);
      const allowed =
        profileId === me ||
        ((profile.connections || []).includes(me) && ((await find(C.profiles, me))?.connections || []).includes(profileId)) ||
        (await isRecruiterOf(me, profileId));
      if (profile.userType === 'structure') {
        return { phone: profile.phone || '', email: allowed && users ? (await users.get({ userId: profileId })).email || '' : '', allowed };
      }
      if (!allowed) return { phone: '', email: '', allowed: false };
      const priv = await find(C.privateInfo, profileId);
      const email = users ? (await users.get({ userId: profileId }).catch(() => ({ email: '' }))).email || '' : '';
      return { phone: priv?.phone || profile.phone || '', email, allowed: true };
    },

    /** Presenza online e "sta scrivendo…". */
    /**
     * Presenza online e "sta scrivendo…". L'indicatore non sta sul profilo (pubblico):
     * è una riga leggibile solo dal destinatario, così nessun altro sa con chi si sta parlando.
     */
    async setPresence(me, { isOnline, typingTo } = {}) {
      if (isOnline !== undefined) await update(C.profiles, me, { isOnline: !!isOnline, lastActive: new Date().toISOString() });
      if (typingTo !== undefined) {
        if (typingTo !== null && (typeof typingTo !== 'string' || !typingTo || typingTo.length > 36 || typingTo === me)) fail(400, 'Destinatario non valido.');
        const id = typingKey(me);
        const existing = await find(C.typing, id);
        if (typingTo === null) {
          if (existing) await remove(C.typing, id);
        } else {
          const data = { userId: me, targetId: typingTo, until: new Date(Date.now() + 6000).toISOString() };
          const perms = Permission && Role ? [Permission.read(Role.user(typingTo))] : [];
          // Cambio di destinatario: la riga va ricreata con i nuovi permessi.
          if (existing && existing.targetId !== typingTo) await remove(C.typing, id);
          if (existing && existing.targetId === typingTo) await update(C.typing, id, { until: data.until });
          else await create(C.typing, data, perms, id);
        }
      }
      return { ok: true };
    },

    /** Pagina struttura gestita da un professionista: l'admin è chi la crea. */
    async createFacility(me, data = {}) {
      const profile = await get(C.profiles, me);
      if (profile.userType !== 'professional') fail(403, 'Le strutture hanno già il proprio profilo.');
      if ((profile.managedFacilities || []).length >= 10) fail(409, 'Puoi gestire al massimo 10 pagine.');
      const name = take(validators.text(data.name, 'Nome della struttura', { min: 2, max: 120, required: true }));
      const type = take(validators.text(data.type, 'Tipo', { max: 80 }));
      const loc = take(validators.location(data.city, data.province));
      const facility = await create(
        C.facilities,
        { name, type, city: loc.city, province: loc.province, bio: '', admins: [me], staff: [], followers: [] },
        [Permission.read(Role.users())]
      );
      await update(C.profiles, me, { managedFacilities: [...(profile.managedFacilities || []), facility.$id] });
      return facility;
    },

    async updateFacility(me, { facilityId, ...data } = {}) {
      if (typeof facilityId !== 'string' || !facilityId) fail(400, 'Parametro mancante: facilityId');
      const facility = await get(C.facilities, facilityId);
      if (!(facility.admins || []).includes(me)) fail(403, 'Non sei amministratore di questa pagina.');
      const has = (k) => Object.prototype.hasOwnProperty.call(data, k);
      const out = {};
      if (has('name')) out.name = take(validators.text(data.name, 'Nome della struttura', { min: 2, max: 120, required: true }));
      if (has('type')) out.type = take(validators.text(data.type, 'Tipo', { max: 80 }));
      if (has('bio')) out.bio = take(validators.longText(data.bio, 'Presentazione', 2500));
      if (has('city') || has('province')) Object.assign(out, take(validators.location(has('city') ? data.city : facility.city, has('province') ? data.province : facility.province)));
      if (has('logo')) out.logo = storageUrl(data.logo, 'Logo');
      if (has('cover')) out.cover = storageUrl(data.cover, 'Copertina');
      if (!Object.keys(out).length) return facility;
      return update(C.facilities, facilityId, out);
    },
  };
}
