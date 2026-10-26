/**
 * Eventi (ex Swim-Meet): allenamenti condivisi, gare, corsi, open day, webinar.
 * L'organizzatore è chi chiama; iscrizioni con posti limitati e lista d'attesa:
 * quando qualcuno rinuncia, il primo in attesa entra e riceve una notifica.
 */
import { isPremium } from './billing.js';

export const EVENT_TYPES = ['allenamento', 'gara', 'corso', 'open_day', 'webinar', 'incontro', 'altro'];
const TYPE_LABEL = { allenamento: "L'allenamento", gara: 'La gara', corso: 'Il corso', open_day: "L'open day", webinar: 'Il webinar', incontro: "L'incontro", altro: "L'evento" };

export function eventActions({ assertClean = () => {}, get, list, listAll, create, update, remove = async () => null, fail, notify, C, Query, Permission, Role, displayName, find, isoDay, groups, storageUrl = (v) => v || '' }) {
  const text = (v, label, min, max, required = true) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t && !required) return undefined;
    if (t.length < min) fail(400, `${label}: almeno ${min} caratteri.`);
    if (t.length > max) fail(400, `${label}: massimo ${max} caratteri.`);
    assertClean(t, 'text');
    return t;
  };
  const label = (meet) => {
    const d = typeof meet.date === 'string' && meet.date.length >= 10 ? ` del ${meet.date.slice(8, 10)}/${meet.date.slice(5, 7)}` : '';
    return `${TYPE_LABEL[meet.type] || "L'evento"} "${meet.title || ''}"${d}`;
  };
  const lower = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const without = (arr = [], v) => arr.filter((x) => x !== v);

  /** Campi modificabili, validati (create = tutti obbligatori dove serve). */
  const clean = (data, { partial = false } = {}) => {
    const out = {};
    const has = (k) => !partial || k in data;
    if (has('title')) out.title = text(data.title, 'Titolo', 3, 120);
    if (has('description')) out.description = text(data.description, 'Descrizione', 10, 2000);
    if (has('date')) {
      const date = String(data.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, 'Data non valida.');
      if (date < isoDay(Date.now()) || date > isoDay(Date.now() + 365 * 86_400_000)) fail(400, 'La data deve essere entro i prossimi 12 mesi.');
      out.date = date;
    }
    if (has('time')) {
      const time = String(data.time || '');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400, 'Orario non valido.');
      out.time = time;
    }
    if (has('endTime')) {
      const end = data.endTime ? String(data.endTime) : '';
      if (end && !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) fail(400, 'Orario di fine non valido.');
      out.endTime = end || null;
    }
    if (has('type')) out.type = EVENT_TYPES.includes(data.type) ? data.type : 'incontro';
    if (has('isOnline')) out.isOnline = !!data.isOnline;
    const online = 'isOnline' in out ? out.isOnline : !!data.isOnline;
    if (has('onlineUrl')) {
      const url = typeof data.onlineUrl === 'string' ? data.onlineUrl.trim() : '';
      if (url && (!/^https:\/\/[^\s]+$/.test(url) || url.length > 500)) fail(400, 'Il link deve iniziare con https://');
      if (online && !url && !partial) fail(400, 'Indica il link per partecipare online.');
      out.onlineUrl = url || null;
    }
    if (has('city')) out.city = online ? text(data.city, 'Città', 0, 80, false) || 'Online' : text(data.city, 'Città', 2, 80);
    if (has('province')) {
      const p = typeof data.province === 'string' ? data.province.trim().toUpperCase() : '';
      out.province = /^[A-Z]{2}$/.test(p) ? p : null;
    }
    if (has('address')) out.address = text(data.address, 'Indirizzo', 1, 200, false) ?? null;
    if (has('price')) {
      const price = data.price === undefined || data.price === null || data.price === '' ? 0 : Number(data.price);
      if (!Number.isInteger(price) || price < 0 || price > 5000) fail(400, 'Quota: da 0 a 5000 € (0 = gratuito).');
      out.price = price;
    }
    if (has('maxParticipants')) {
      const max = data.maxParticipants === undefined || data.maxParticipants === null || data.maxParticipants === '' ? null : Number(data.maxParticipants);
      if (max !== null && (!Number.isInteger(max) || max < 2 || max > 500)) fail(400, 'Partecipanti: da 2 a 500.');
      out.maxParticipants = max;
    }
    if (has('cover')) out.cover = storageUrl(data.cover, 'Copertina') || null;
    return out;
  };

  /**
   * Chi è in attesa entra finché ci sono posti; ognuno riceve una notifica.
   * Gli iscritti Premium hanno la precedenza (tra loro, e tra gli altri, vale l'ordine di arrivo).
   */
  const fillFromWaitlist = async (meet) => {
    let participants = meet.participants || [];
    let waitlist = meet.waitlist || [];
    const free = meet.maxParticipants ? meet.maxParticipants - participants.length : waitlist.length;
    if (free > 0 && waitlist.length > free) {
      const profiles = await listAll(C.profiles, [Query.equal('$id', waitlist.slice(0, 100))]).catch(() => []);
      const premium = new Set(profiles.filter((p) => isPremium(p)).map((p) => p.$id));
      waitlist = [...waitlist.filter((id) => premium.has(id)), ...waitlist.filter((id) => !premium.has(id))];
    }
    const promoted = [];
    while (waitlist.length && (!meet.maxParticipants || participants.length < meet.maxParticipants)) {
      const next = waitlist[0];
      waitlist = waitlist.slice(1);
      participants = [...participants, next];
      promoted.push(next);
    }
    if (!promoted.length) return meet;
    const saved = await update(C.swimMeets, meet.$id, { participants, waitlist });
    for (const id of promoted) await notify(id, 'event', `Si è liberato un posto: ora partecipi a ${lower(label(meet))}.`, meet.$id);
    return saved;
  };

  /** Il link per collegarsi non sta sulla riga pubblica: lo legge solo la Function. */
  const savePrivateLink = async (meetId, url) => {
    const existing = await find(C.eventPrivate, meetId);
    if (!url) { if (existing) await remove(C.eventPrivate, meetId); return; }
    if (existing) await update(C.eventPrivate, meetId, { onlineUrl: url });
    else await create(C.eventPrivate, { onlineUrl: url }, [], meetId);
  };

  return {
    /** Link dell'evento online: solo per l'organizzatore e gli iscritti (non per chi è in attesa). */
    async getEventLink(me, { meetId } = {}) {
      if (typeof meetId !== 'string' || !meetId) fail(400, 'Evento non valido.');
      const meet = await get(C.swimMeets, meetId);
      if (meet.creatorId !== me && !(meet.participants || []).includes(me)) fail(403, 'Il link è riservato agli iscritti.');
      const priv = await find(C.eventPrivate, meetId);
      return { onlineUrl: priv?.onlineUrl || meet.onlineUrl || null };
    },

    /** Nuovo evento: l'organizzatore è chi chiama (non un campo del client). */
    async createSwimMeet(me, data = {}) {
      const fields = clean(data);
      let groupId;
      if (data.groupId) groupId = (await groups._assertCanPost(me, String(data.groupId).slice(0, 36))).$id;
      const { onlineUrl, ...publicFields } = fields;
      const meet = { ...publicFields, creatorId: me, participants: [me], waitlist: [], status: 'upcoming', ...(groupId ? { groupId } : {}) };
      for (const k of Object.keys(meet)) if (meet[k] === undefined || meet[k] === null) delete meet[k];
      const created = await create(C.swimMeets, meet, [Permission.read(Role.users())]);
      if (onlineUrl) await savePrivateLink(created.$id, onlineUrl);
      return created;
    },

    /** Modifica (solo l'organizzatore): gli iscritti vengono avvisati se cambiano data, ora o luogo. */
    async updateSwimMeet(me, { meetId, ...data } = {}) {
      if (typeof meetId !== 'string' || !meetId) fail(400, 'Evento non valido.');
      const meet = await get(C.swimMeets, meetId);
      if (meet.creatorId !== me) fail(403, "Solo l'organizzatore può modificare l'evento.");
      if (meet.status !== 'upcoming') fail(409, "L'evento non è più modificabile.");
      const patch = clean({ isOnline: meet.isOnline, ...data }, { partial: true });
      if (patch.maxParticipants && patch.maxParticipants < (meet.participants || []).length) {
        fail(400, `Ci sono già ${(meet.participants || []).length} iscritti: non puoi scendere sotto.`);
      }
      let linkChanged = false;
      if ('onlineUrl' in patch || patch.isOnline === false) {
        const before = (await find(C.eventPrivate, meetId))?.onlineUrl || meet.onlineUrl || null;
        const next = patch.isOnline === false ? null : patch.onlineUrl ?? before;
        linkChanged = (next || null) !== (before || null);
        await savePrivateLink(meetId, next);
        delete patch.onlineUrl;
        if (meet.onlineUrl) patch.onlineUrl = null; // eventi creati prima: il link esce dalla riga pubblica
      }
      let saved = await update(C.swimMeets, meetId, patch);
      saved = await fillFromWaitlist(saved);
      const moved = linkChanged || ['date', 'time', 'city', 'address'].some((k) => k in patch && (patch[k] || null) !== (meet[k] || null));
      if (moved) {
        for (const id of saved.participants || []) {
          if (id !== me) await notify(id, 'event', `${label(saved)} è cambiato: controlla data, ora e luogo.`, meetId);
        }
      }
      return saved;
    },

    async cancelSwimMeet(me, { meetId } = {}) {
      if (typeof meetId !== 'string' || !meetId) fail(400, 'Evento non valido.');
      const meet = await get(C.swimMeets, meetId);
      if (meet.creatorId !== me) fail(403, "Solo l'organizzatore può annullare l'evento.");
      if (meet.status === 'cancelled') return meet;
      const updated = await update(C.swimMeets, meetId, { status: 'cancelled' });
      for (const id of [...(meet.participants || []), ...(meet.waitlist || [])]) {
        if (id !== me) await notify(id, 'event', `${label(meet)} è stato annullato.`, meetId);
      }
      return updated;
    },

    /** Iscrizione; se i posti sono finiti si entra in lista d'attesa. */
    async joinSwimMeet(me, { meetId } = {}) {
      if (typeof meetId !== 'string' || !meetId) fail(400, 'Evento non valido.');
      const meet = await get(C.swimMeets, meetId);
      if (meet.status !== 'upcoming') fail(409, "L'evento non è più aperto.");
      if (meet.date < isoDay(Date.now())) fail(409, "L'evento è già passato.");
      const participants = meet.participants || [];
      const waitlist = meet.waitlist || [];
      if (participants.includes(me)) return { ...meet, myStatus: 'going' };
      if (waitlist.includes(me)) return { ...meet, myStatus: 'waitlist' };
      if (meet.groupId) {
        const group = await find(C.groups, meet.groupId);
        if (group && group.privacy === 'approval') await groups._assertCanPost(me, meet.groupId).catch(() => fail(403, 'Questo evento è riservato ai membri del gruppo.'));
      }
      if (meet.maxParticipants && participants.length >= meet.maxParticipants) {
        if (waitlist.length >= 200) fail(409, "L'evento è al completo.");
        const saved = await update(C.swimMeets, meetId, { waitlist: [...waitlist, me] });
        return { ...saved, myStatus: 'waitlist' };
      }
      const saved = await update(C.swimMeets, meetId, { participants: [...participants, me] });
      const who = await find(C.profiles, me);
      await notify(meet.creatorId, 'event', `${who ? displayName(who) : 'Qualcuno'} parteciperà a "${meet.title}".`, meetId);
      return { ...saved, myStatus: 'going' };
    },

    async leaveSwimMeet(me, { meetId } = {}) {
      if (typeof meetId !== 'string' || !meetId) fail(400, 'Evento non valido.');
      const meet = await get(C.swimMeets, meetId);
      if (meet.creatorId === me) fail(400, "Sei l'organizzatore: puoi annullare l'evento invece di lasciarlo.");
      const saved = await update(C.swimMeets, meetId, { participants: without(meet.participants, me), waitlist: without(meet.waitlist, me) });
      return meet.status === 'upcoming' ? fillFromWaitlist(saved) : saved;
    },

    /** Eliminazione dell'account: annulla i propri eventi ed esce dagli altri. */
    async _leaveAllEvents(me) {
      for (const meet of await listAll(C.swimMeets, [Query.equal('creatorId', me)])) {
        await update(C.swimMeets, meet.$id, { status: 'cancelled', participants: [], waitlist: [] });
      }
      for (const field of ['participants', 'waitlist']) {
        for (const meet of await listAll(C.swimMeets, [Query.contains(field, [me])])) {
          const current = await find(C.swimMeets, meet.$id);
          if (!current) continue;
          const saved = await update(C.swimMeets, meet.$id, { participants: without(current.participants, me), waitlist: without(current.waitlist, me) });
          if (saved.status === 'upcoming') await fillFromWaitlist(saved);
        }
      }
    },

    /** Eliminazione di un gruppo: i suoi eventi futuri vengono annullati. */
    async _cancelGroupEvents(groupId) {
      for (const meet of await listAll(C.swimMeets, [Query.equal('groupId', groupId), Query.equal('status', 'upcoming')])) {
        await update(C.swimMeets, meet.$id, { status: 'cancelled' });
        for (const id of meet.participants || []) if (id !== meet.creatorId) await notify(id, 'event', `${label(meet)} è stato annullato.`, meet.$id);
      }
    },
  };
}
