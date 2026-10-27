import { createHash } from 'node:crypto';
import { BASE_STAFF, isPremium } from './billing.js';

/**
 * Area staff di una struttura: bacheca comunicazioni, turni, membri.
 * Vi accedono solo gli amministratori della struttura e i membri dello staff
 * (chi è stato assunto da un suo annuncio o aggiunto da un amministratore).
 * Le tabelle non hanno permessi per i client: tutto passa da qui, così
 * l'appartenenza al team si verifica a ogni lettura.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_TIME = /^([01]\d|2[0-3]):[0-5]\d–([01]\d|2[0-3]):[0-5]\d$/;
const SHIFT_STATUSES = ['scheduled', 'confirmed', 'declined'];

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** Giorno della settimana di una data ISO: lunedì = 0 … domenica = 6. */
const weekdayOf = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const addDays = (iso, n) => isoDay(new Date(`${iso}T12:00:00Z`).getTime() + n * 86_400_000);
const DAY_SHORT = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MAX_SERIES = 90;
const MAX_TEMPLATES = 20;
const MAX_SLOTS = 60;

export const MAX_CO_ADMINS = 5;

export function teamActions({ find, get, list, listAll, create, update, remove, removeAll, count = async () => 0, fail, notify, deliver = async () => null, C, Query, displayName }) {
  /**
   * Amministratori e staff di una struttura (account Struttura). Gli amministratori sono l'account
   * stesso (titolare) e i co-amministratori scelti dallo staff (`coAdmins`, al massimo MAX_CO_ADMINS).
   */
  const teamOf = async (structureId) => {
    if (typeof structureId !== 'string' || !structureId) fail(400, 'Parametro mancante: structureId');
    const profile = await find(C.profiles, structureId);
    if (!profile || profile.userType !== 'structure') fail(404, 'Struttura non trovata.');
    const coAdmins = (profile.coAdmins || []).filter((id) => (profile.staff || []).includes(id));
    return { kind: 'profile', row: profile, name: profile.structureName || 'Struttura', owner: profile.$id, coAdmins, admins: [profile.$id, ...coAdmins], staff: profile.staff || [] };
  };

  const roleIn = (team, me) => (team.admins.includes(me) ? 'admin' : team.staff.includes(me) ? 'staff' : null);

  const requireRole = async (me, structureId, needed) => {
    const team = await teamOf(structureId);
    const role = roleIn(team, me);
    if (!role || (needed === 'admin' && role !== 'admin')) {
      fail(403, needed === 'admin' ? 'Solo gli amministratori della struttura possono farlo.' : 'Area riservata allo staff della struttura.');
    }
    return { team, role };
  };

  // Chi esce dallo staff smette anche di essere co-amministratore.
  const setStaff = (team, staff) => update(C.profiles, team.row.$id, { staff, coAdmins: team.coAdmins.filter((id) => staff.includes(id)) });

  /** Ultima lettura della chat staff di una persona (riga con id deterministico). */
  const readKey = (structureId, userId) => createHash('sha256').update(`${structureId}:${userId}`).digest('hex').slice(0, 32);
  const unreadChat = async (structureId, me) => {
    const read = await find(C.staffChatReads, readKey(structureId, me));
    const queries = [Query.equal('structureId', structureId), Query.notEqual('authorId', me)];
    if (read?.lastReadAt) queries.push(Query.greaterThan('$createdAt', read.lastReadAt));
    return count(C.staffMessages, queries);
  };
  const markChatRead = async (structureId, me) => {
    const id = readKey(structureId, me);
    const data = { structureId, userId: me, lastReadAt: new Date().toISOString() };
    if (await find(C.staffChatReads, id)) await update(C.staffChatReads, id, data);
    else await create(C.staffChatReads, data, [], id);
  };

  const memberCard = (p) => ({
    $id: p.$id,
    userId: p.$id,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    title: p.title || '',
    avatar: p.avatar || '',
    city: p.city || '',
    isOnline: !!p.isOnline,
    // Per il radar delle scadenze dei brevetti (dati già pubblici sul profilo).
    certificationsList: p.certificationsList || [],
  });

  /** Piano Base: staff (più inviti in sospeso) fino a BASE_STAFF persone, salvo un amministratore Premium. */
  const staffLimit = async (team) => {
    const admins = await Promise.all(team.admins.slice(0, 10).map((id) => find(C.profiles, id)));
    return admins.some((p) => isPremium(p)) ? null : BASE_STAFF;
  };
  const pendingInvites = async (structureId) => listAll(C.staffInvites, [Query.equal('structureId', structureId), Query.equal('status', 'pending')]);
  const inviteKey = (structureId, userId) => createHash('sha256').update(`invite:${structureId}:${userId}`).digest('hex').slice(0, 32);
  const logoOf = (team) => team.row.logo || '';

  const checkTime = (shiftTime) => {
    if (!SHIFT_TIME.test(shiftTime || '')) fail(400, 'Orario non valido.');
    const [start, end] = shiftTime.split('–');
    if (end <= start) fail(400, 'La fine del turno deve essere dopo l’inizio.');
  };
  const templateOut = (t) => {
    let slots = [];
    try { slots = JSON.parse(t.slots || '[]'); } catch { slots = []; }
    return { $id: t.$id, structureId: t.structureId, name: t.name, slots, $updatedAt: t.$updatedAt };
  };
  /** Turno annullato o spostato: le richieste di cambio in sospeso non valgono più. */
  const cancelSwapsFor = async (shiftId) => {
    const open = await listAll(C.shiftSwaps, [Query.equal('shiftId', shiftId), Query.equal('status', 'pending')]).catch(() => []);
    for (const w of open) await update(C.shiftSwaps, w.$id, { status: 'cancelled' });
  };
  let this_listMyTeams = async (_me) => [];

  const api = {
    /** Tutto ciò che serve all'area staff, solo per chi ne fa parte. */
    async getTeamBoard(me, { structureId } = {}) {
      const { team, role } = await requireRole(me, structureId, 'staff');
      const ids = [...new Set(team.staff)].slice(0, 100);
      const [members, announcements, shifts, chatUnread] = await Promise.all([
        ids.length ? listAll(C.profiles, [Query.equal('$id', ids)]) : [],
        list(C.announcements, [Query.equal('structureId', structureId), Query.orderDesc('$createdAt'), Query.limit(50)]),
        list(C.shifts, [Query.equal('structureId', structureId), Query.greaterThanEqual('date', isoDay(Date.now() - 7 * 86_400_000)), Query.orderAsc('date'), Query.limit(200)]),
        unreadChat(structureId, me).catch(() => 0),
      ]);
      // Solo per gli amministratori: limite del piano Base e inviti in attesa di risposta.
      let limit = null;
      let invites = [];
      if (role === 'admin') {
        limit = await staffLimit(team);
        const pending = await pendingInvites(structureId);
        const people = pending.length ? await listAll(C.profiles, [Query.equal('$id', pending.map((i) => i.userId).slice(0, 100))]) : [];
        invites = pending.map((i) => {
          const p = people.find((x) => x.$id === i.userId);
          return { userId: i.userId, name: p ? displayName(p) : 'Utente', avatar: p?.avatar || '', title: p?.title || '', invitedAt: i.$createdAt };
        });
      }
      return {
        role,
        staffLimit: limit,
        invites,
        members: members.map((p) => ({ ...memberCard(p), coAdmin: team.coAdmins.includes(p.$id) })),
        isOwner: me === team.owner,
        announcements: announcements.documents,
        // Lo staff vede tutti i turni della squadra (serve per gli scambi), non solo i propri.
        shifts: shifts.documents,
        // Scambi in sospeso: quelli aperti a tutto lo staff e quelli che mi riguardano (agli amministratori tutti).
        swaps: (await listAll(C.shiftSwaps, [Query.equal('structureId', structureId), Query.equal('status', 'pending')]).catch(() => []))
          .filter((w) => role === 'admin' || !w.toUserId || w.toUserId === me || w.fromUserId === me),
        chatUnread,
      };
    },

    // ---------------- CHAT STAFF ----------------
    /**
     * Messaggi della chat staff (dal più vecchio). Con `after` (data ISO) solo i nuovi:
     * il client la interroga a intervalli mentre è aperta. Leggerla la segna come letta.
     */
    async listStaffMessages(me, { structureId, after = null, before = null } = {}) {
      const { team } = await requireRole(me, structureId, 'staff');
      const queries = [Query.equal('structureId', structureId)];
      if (typeof after === 'string' && after) queries.push(Query.greaterThan('$createdAt', after), Query.orderAsc('$createdAt'), Query.limit(100));
      else {
        if (typeof before === 'string' && before) queries.push(Query.lessThan('$createdAt', before));
        queries.push(Query.orderDesc('$createdAt'), Query.limit(60));
      }
      const { documents } = await list(C.staffMessages, queries);
      const rows = after ? documents : [...documents].reverse();
      if (!after || rows.length) await markChatRead(structureId, me);
      const ids = [...new Set([...team.admins, ...team.staff])].slice(0, 100);
      return {
        messages: rows,
        // Nomi e foto del team, per mostrare chi scrive (anche chi ha lasciato lo staff resta riconoscibile).
        members: after ? undefined : (ids.length ? await listAll(C.profiles, [Query.equal('$id', ids)]) : []).map((p) => ({ $id: p.$id, name: displayName(p), avatar: p.avatar || p.logo || '', role: team.admins.includes(p.$id) ? 'admin' : 'staff' })),
        hasMore: !after && documents.length === 60,
      };
    },

    async sendStaffMessage(me, { structureId, content } = {}) {
      const { team } = await requireRole(me, structureId, 'staff');
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) fail(400, 'Scrivi un messaggio.');
      if (text.length > 2000) fail(400, 'Massimo 2000 caratteri.');
      const recent = await count(C.staffMessages, [Query.equal('structureId', structureId), Query.equal('authorId', me), Query.greaterThan('$createdAt', new Date(Date.now() - 60_000).toISOString())]);
      if (recent >= 20) fail(429, 'Stai scrivendo troppo velocemente: aspetta qualche secondo.');
      const row = await create(C.staffMessages, { structureId, authorId: me, content: text }, []);
      await markChatRead(structureId, me);
      const author = await find(C.profiles, me);
      const title = `${team.name} · ${author ? displayName(author) : 'Staff'}`;
      for (const id of new Set([...team.admins, ...team.staff])) {
        if (id !== me) await deliver(id, 'staff_chat', text.slice(0, 140), structureId, { title, channels: ['push'] });
      }
      return row;
    },

    /** L'autore o un amministratore della struttura eliminano un messaggio. */
    async deleteStaffMessage(me, { messageId } = {}) {
      if (typeof messageId !== 'string' || !messageId) fail(400, 'Messaggio non valido.');
      const msg = await get(C.staffMessages, messageId);
      const { role } = await requireRole(me, msg.structureId, 'staff');
      if (msg.authorId !== me && role !== 'admin') fail(403, 'Puoi eliminare solo i tuoi messaggi.');
      await remove(C.staffMessages, messageId);
      return { deleted: true };
    },

    async createAnnouncement(me, { structureId, content, isImportant = false } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      const text = typeof content === 'string' ? content.trim() : '';
      if (text.length < 2) fail(400, 'Scrivi la comunicazione.');
      if (text.length > 4000) fail(400, 'Massimo 4000 caratteri.');
      const row = await create(C.announcements, { structureId, content: text, isImportant: !!isImportant, readBy: [me] }, []);
      if (isImportant) {
        for (const id of team.staff) if (id !== me) await notify(id, 'general', `${team.name}: nuova comunicazione importante in bacheca.`, structureId);
      }
      return row;
    },

    async deleteAnnouncement(me, { announcementId } = {}) {
      const ann = await get(C.announcements, announcementId);
      await requireRole(me, ann.structureId, 'admin');
      await remove(C.announcements, ann.$id);
      return { deleted: true };
    },

    async markAnnouncementsRead(me, { structureId } = {}) {
      await requireRole(me, structureId, 'staff');
      const { documents } = await list(C.announcements, [Query.equal('structureId', structureId), Query.limit(50)]);
      const unread = documents.filter((a) => !(a.readBy || []).includes(me));
      await Promise.all(unread.map((a) => update(C.announcements, a.$id, { readBy: [...(a.readBy || []), me] })));
      return { updated: unread.length };
    },

    /**
     * Turni ricorrenti: lo stesso orario nei giorni della settimana scelti, da una data a un'altra
     * (al massimo 6 mesi avanti e 90 turni). Tutti con lo stesso `seriesId`, annullabili insieme.
     */
    async createShiftSeries(me, { structureId, userId, startDate, endDate, weekdays = [], shiftTime, role = '' } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      if (!team.staff.includes(userId)) fail(400, 'Puoi assegnare turni solo ai membri dello staff.');
      if (!ISO_DATE.test(startDate || '') || !ISO_DATE.test(endDate || '')) fail(400, 'Date non valide.');
      if (startDate < isoDay(Date.now() - 86_400_000)) fail(400, 'La prima data è già passata.');
      if (endDate > isoDay(Date.now() + 180 * 86_400_000)) fail(400, 'La serie può arrivare al massimo a 6 mesi da oggi.');
      if (endDate < startDate) fail(400, 'La data di fine deve essere dopo quella di inizio.');
      const days = [...new Set((Array.isArray(weekdays) ? weekdays : []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (!days.length) fail(400, 'Scegli almeno un giorno della settimana.');
      checkTime(shiftTime);
      const dates = [];
      for (let d = startDate; d <= endDate; d = addDays(d, 1)) if (days.includes(weekdayOf(d))) dates.push(d);
      if (!dates.length) fail(400, 'Nel periodo scelto non c’è nessuno dei giorni indicati.');
      if (dates.length > MAX_SERIES) fail(400, `Al massimo ${MAX_SERIES} turni per volta: accorcia il periodo.`);
      const person = await get(C.profiles, userId);
      const seriesId = createHash('sha256').update(`${structureId}:${userId}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 24);
      const base = { structureId, userId, userName: displayName(person).slice(0, 255), shiftTime, role: String(role || person.title || 'Staff').trim().slice(0, 100), status: 'scheduled', seriesId };
      const created = [];
      for (const date of dates) created.push(await create(C.shifts, { ...base, date }, []));
      const which = days.sort().map((d) => DAY_SHORT[d]).join(', ');
      await notify(userId, 'shift', `${team.name} ti ha assegnato ${created.length} turni (${which}) dal ${ddmm(dates[0])} al ${ddmm(dates[dates.length - 1])}, ${shiftTime}.`, structureId);
      return { created, seriesId };
    },

    async createShift(me, { structureId, userId, date, shiftTime, role = '' } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      if (!team.staff.includes(userId)) fail(400, 'Puoi assegnare turni solo ai membri dello staff.');
      if (!ISO_DATE.test(date || '')) fail(400, 'Data non valida.');
      if (date < isoDay(Date.now() - 86_400_000) || date > isoDay(Date.now() + 180 * 86_400_000)) fail(400, 'La data deve essere entro i prossimi 6 mesi.');
      if (!SHIFT_TIME.test(shiftTime || '')) fail(400, 'Orario non valido.');
      const [start, end] = shiftTime.split('–');
      if (end <= start) fail(400, 'La fine del turno deve essere dopo l’inizio.');
      const person = await get(C.profiles, userId);
      const row = await create(
        C.shifts,
        {
          structureId,
          userId,
          userName: displayName(person).slice(0, 255),
          date,
          shiftTime,
          role: String(role || person.title || 'Staff').trim().slice(0, 100),
          status: 'scheduled',
        },
        []
      );
      await notify(userId, 'shift', `${team.name} ti ha assegnato un turno il ${date.slice(8, 10)}/${date.slice(5, 7)}, ${shiftTime}.`, structureId);
      return row;
    },

    /** Annulla un turno; con `scope: 'series'` anche i successivi della stessa serie. */
    async deleteShift(me, { shiftId, scope = 'one' } = {}) {
      const shift = await get(C.shifts, shiftId);
      await requireRole(me, shift.structureId, 'admin');
      const targets = scope === 'series' && shift.seriesId
        ? (await listAll(C.shifts, [Query.equal('structureId', shift.structureId), Query.equal('seriesId', shift.seriesId)])).filter((x) => x.date >= shift.date)
        : [shift];
      for (const t of targets) {
        await remove(C.shifts, t.$id);
        await cancelSwapsFor(t.$id);
      }
      if (shift.userId !== me) {
        await notify(shift.userId, 'shift', targets.length > 1
          ? `${targets.length} turni dal ${ddmm(shift.date)} (${shift.shiftTime}) sono stati annullati.`
          : `Il turno del ${ddmm(shift.date)} (${shift.shiftTime}) è stato annullato.`, shift.structureId);
      }
      return { deleted: targets.length };
    },

    // ---------------- MODELLI SETTIMANALI ----------------
    /** Modelli di settimana della struttura (solo amministratori). */
    async listShiftTemplates(me, { structureId } = {}) {
      await requireRole(me, structureId, 'admin');
      const rows = await listAll(C.shiftTemplates, [Query.equal('structureId', structureId)]);
      return rows.map(templateOut);
    },

    async saveShiftTemplate(me, { structureId, templateId = null, name, slots = [] } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      const title = String(name || '').trim();
      if (title.length < 2 || title.length > 60) fail(400, 'Dai al modello un nome tra 2 e 60 caratteri.');
      if (!Array.isArray(slots) || !slots.length) fail(400, 'Il modello è vuoto: aggiungi almeno un turno.');
      if (slots.length > MAX_SLOTS) fail(400, `Al massimo ${MAX_SLOTS} turni per modello.`);
      const clean = slots.map((x) => {
        const weekday = Number(x?.weekday);
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) fail(400, 'Giorno della settimana non valido.');
        checkTime(x?.shiftTime);
        if (!team.staff.includes(x?.userId)) fail(400, 'Nel modello ci sono persone che non fanno parte dello staff.');
        return { weekday, shiftTime: x.shiftTime, userId: x.userId, role: String(x.role || '').trim().slice(0, 100) };
      });
      const data = { structureId, name: title, slots: JSON.stringify(clean), createdBy: me };
      if (templateId) {
        const existing = await get(C.shiftTemplates, templateId);
        if (existing.structureId !== structureId) fail(404, 'Modello non trovato.');
        return templateOut(await update(C.shiftTemplates, templateId, data));
      }
      if ((await count(C.shiftTemplates, [Query.equal('structureId', structureId)])) >= MAX_TEMPLATES) fail(409, `Al massimo ${MAX_TEMPLATES} modelli: eliminane uno che non usi più.`);
      return templateOut(await create(C.shiftTemplates, data, []));
    },

    async deleteShiftTemplate(me, { templateId } = {}) {
      const t = await get(C.shiftTemplates, templateId);
      await requireRole(me, t.structureId, 'admin');
      await remove(C.shiftTemplates, t.$id);
      return { deleted: true };
    },

    /**
     * Applica un modello alla settimana che inizia il lunedì `weekStart`: crea i turni (senza
     * doppioni) per chi è ancora nello staff; ognuno riceve un solo avviso con il numero di turni.
     */
    async applyShiftTemplate(me, { templateId, weekStart } = {}) {
      const t = await get(C.shiftTemplates, templateId);
      const { team } = await requireRole(me, t.structureId, 'admin');
      if (!ISO_DATE.test(weekStart || '') || weekdayOf(weekStart) !== 0) fail(400, 'Scegli il lunedì della settimana.');
      if (addDays(weekStart, 6) < isoDay(Date.now())) fail(400, 'Questa settimana è già passata.');
      if (weekStart > isoDay(Date.now() + 180 * 86_400_000)) fail(400, 'Al massimo 6 mesi in anticipo.');
      const slots = templateOut(t).slots;
      const existing = await listAll(C.shifts, [Query.equal('structureId', t.structureId), Query.greaterThanEqual('date', weekStart), Query.lessThanEqual('date', addDays(weekStart, 6))]);
      const has = new Set(existing.map((x) => `${x.userId}|${x.date}|${x.shiftTime}`));
      const people = {};
      const created = [];
      let skipped = 0;
      for (const slot of slots) {
        const date = addDays(weekStart, slot.weekday);
        if (!team.staff.includes(slot.userId) || date < isoDay(Date.now()) || has.has(`${slot.userId}|${date}|${slot.shiftTime}`)) { skipped += 1; continue; }
        people[slot.userId] ??= await find(C.profiles, slot.userId);
        const person = people[slot.userId];
        if (!person) { skipped += 1; continue; }
        created.push(await create(C.shifts, { structureId: t.structureId, userId: slot.userId, userName: displayName(person).slice(0, 255), date, shiftTime: slot.shiftTime, role: (slot.role || person.title || 'Staff').slice(0, 100), status: 'scheduled' }, []));
        has.add(`${slot.userId}|${date}|${slot.shiftTime}`);
      }
      const perPerson = {};
      for (const c of created) perPerson[c.userId] = (perPerson[c.userId] || 0) + 1;
      for (const [uid, n] of Object.entries(perPerson)) {
        await notify(uid, 'shift', `${team.name} ti ha assegnato ${n === 1 ? 'un turno' : `${n} turni`} nella settimana del ${ddmm(weekStart)}. Confermali nell’area staff.`, t.structureId);
      }
      return { created, skipped };
    },

    // ---------------- SCAMBI TRA COLLEGHI ----------------
    /**
     * Chi ha un turno lo propone a un collega (`toUserId`) o a tutto lo staff (senza destinatario):
     * il primo che accetta lo prende ed è già confermato; gli amministratori vengono avvisati.
     */
    async proposeShiftSwap(me, { shiftId, toUserId = null, message = '' } = {}) {
      const shift = await get(C.shifts, shiftId);
      if (shift.userId !== me) fail(403, 'Puoi cedere solo i tuoi turni.');
      const { team } = await requireRole(me, shift.structureId, 'staff');
      if (shift.date < isoDay(Date.now())) fail(400, 'Il turno è già passato.');
      if (toUserId && (toUserId === me || !team.staff.includes(toUserId))) fail(400, 'Puoi chiedere solo a un collega dello staff.');
      const open = await listAll(C.shiftSwaps, [Query.equal('shiftId', shiftId), Query.equal('status', 'pending')]);
      if (open.length) fail(409, 'Hai già chiesto un cambio per questo turno: annullalo per farne un altro.');
      const note = String(message || '').trim().slice(0, 300);
      const row = await create(C.shiftSwaps, { structureId: shift.structureId, shiftId, fromUserId: me, toUserId: toUserId || '', status: 'pending', message: note }, []);
      const who = displayName(await get(C.profiles, me));
      const text = `${who} cerca qualcuno per il turno del ${ddmm(shift.date)}, ${shift.shiftTime}${note ? `: «${note}»` : '.'}`;
      const recipients = toUserId ? [toUserId] : team.staff.filter((id) => id !== me).slice(0, 50);
      for (const id of recipients) await notify(id, 'shift', toUserId ? `${who} ti chiede di coprire il turno del ${ddmm(shift.date)}, ${shift.shiftTime}${note ? `: «${note}»` : '.'}` : text, shift.structureId);
      return row;
    },

    async respondShiftSwap(me, { swapId, accept } = {}) {
      const swap = await get(C.shiftSwaps, swapId);
      if (swap.status !== 'pending') fail(409, 'Questa richiesta non è più valida.');
      const { team } = await requireRole(me, swap.structureId, 'staff');
      if (swap.fromUserId === me) fail(400, 'È una tua richiesta: puoi annullarla.');
      if (swap.toUserId && swap.toUserId !== me) fail(403, 'Questa richiesta è per un altro collega.');
      const from = displayName(await get(C.profiles, swap.fromUserId));
      if (!accept) {
        // Una richiesta aperta a tutti resta aperta per gli altri.
        if (!swap.toUserId) return { declined: true };
        await update(C.shiftSwaps, swapId, { status: 'declined' });
        await notify(swap.fromUserId, 'shift', `${displayName(await get(C.profiles, me))} non può coprire il tuo turno.`, swap.structureId);
        return { declined: true };
      }
      const shift = await find(C.shifts, swap.shiftId);
      if (!shift || shift.userId !== swap.fromUserId || shift.date < isoDay(Date.now())) {
        await update(C.shiftSwaps, swapId, { status: 'cancelled' });
        fail(409, 'Il turno è cambiato nel frattempo: la richiesta non è più valida.');
      }
      const meProfile = await get(C.profiles, me);
      const row = await update(C.shifts, shift.$id, { userId: me, userName: displayName(meProfile).slice(0, 255), status: 'confirmed', reminderSentAt: '' });
      await update(C.shiftSwaps, swapId, { status: 'accepted', takenBy: me });
      const who = displayName(meProfile);
      await notify(swap.fromUserId, 'shift', `${who} coprirà il tuo turno del ${ddmm(shift.date)}, ${shift.shiftTime}.`, swap.structureId);
      for (const id of team.admins) if (id !== me) await notify(id, 'shift', `Cambio turno: ${who} copre il turno di ${from} del ${ddmm(shift.date)}, ${shift.shiftTime}.`, swap.structureId);
      return { accepted: true, shift: row };
    },

    async cancelShiftSwap(me, { swapId } = {}) {
      const swap = await get(C.shiftSwaps, swapId);
      if (swap.fromUserId !== me) fail(403, 'Puoi annullare solo le tue richieste.');
      if (swap.status !== 'pending') fail(409, 'La richiesta è già stata gestita.');
      await update(C.shiftSwaps, swapId, { status: 'cancelled' });
      return { cancelled: true };
    },

    /** Richieste di cambio che mi riguardano in tutte le strutture: per me, aperte a tutti, mie. */
    async listMySwaps(me) {
      const teams = await this_listMyTeams(me);
      const out = [];
      for (const t of teams) {
        const rows = await listAll(C.shiftSwaps, [Query.equal('structureId', t.structureId), Query.equal('status', 'pending')]).catch(() => []);
        for (const w of rows) {
          if (!(w.fromUserId === me || w.toUserId === me || (!w.toUserId && w.fromUserId !== me))) continue;
          const shift = await find(C.shifts, w.shiftId);
          if (!shift || shift.date < isoDay(Date.now())) continue;
          const from = await find(C.profiles, w.fromUserId);
          out.push({ ...w, structureName: t.name, fromName: from ? displayName(from) : 'Un collega', shift: { date: shift.date, shiftTime: shift.shiftTime, role: shift.role } });
        }
      }
      return out;
    },

    /** Chi ha il turno lo conferma o segnala che non può coprirlo. */
    async respondShift(me, { shiftId, status } = {}) {
      if (!SHIFT_STATUSES.includes(status) || status === 'scheduled') fail(400, 'Risposta non valida.');
      const shift = await get(C.shifts, shiftId);
      if (shift.userId !== me) fail(403, 'Puoi rispondere solo ai tuoi turni.');
      const { team } = await requireRole(me, shift.structureId, 'staff');
      const row = await update(C.shifts, shift.$id, { status });
      if (status === 'declined') {
        const who = displayName(await get(C.profiles, me));
        for (const id of team.admins) await notify(id, 'general', `${who} non può coprire il turno del ${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)} (${shift.shiftTime}).`, shift.structureId);
      }
      return row;
    },

    /** Un amministratore toglie qualcuno dallo staff, oppure un membro lascia il team. */
    async removeStaffMember(me, { structureId, staffId } = {}) {
      const team = await teamOf(structureId);
      const role = roleIn(team, me);
      if (!(role === 'admin' || (role === 'staff' && staffId === me))) fail(403, 'Non puoi modificare lo staff di questa struttura.');
      if (!team.staff.includes(staffId)) fail(404, 'Non fa parte dello staff.');
      // Un co-amministratore lo toglie solo il titolare (o lascia lui stesso).
      if (team.coAdmins.includes(staffId) && staffId !== me && me !== team.owner) fail(403, 'Solo il titolare della struttura può togliere un co-amministratore.');
      await setStaff(team, team.staff.filter((id) => id !== staffId));
      // I suoi turni futuri non hanno più senso.
      await removeAll(C.shifts, [Query.equal('structureId', structureId), Query.equal('userId', staffId), Query.greaterThanEqual('date', isoDay(Date.now()))]);
      if (staffId !== me) await notify(staffId, 'general', `Non fai più parte dello staff di ${team.name}.`, structureId);
      return { removed: true };
    },

    /**
     * Un amministratore invita nello staff chi lavora già nella struttura (senza passare da un annuncio).
     * La persona entra solo se accetta; fino ad allora l'invito conta per il limite del piano Base.
     */
    async inviteStaff(me, { structureId, userId } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      if (typeof userId !== 'string' || !userId) fail(400, 'Scegli chi invitare.');
      if (team.staff.includes(userId)) fail(409, 'Fa già parte dello staff.');
      if (team.admins.includes(userId)) fail(409, 'È già amministratore della struttura.');
      const person = await find(C.profiles, userId);
      if (!person || person.userType !== 'professional' || person.suspended) fail(404, 'Persona non trovata.');
      const id = inviteKey(structureId, userId);
      const existing = await find(C.staffInvites, id);
      if (existing?.status === 'pending') return { invited: true, already: true };
      const pending = await pendingInvites(structureId);
      if (pending.length >= 30) fail(429, 'Hai già 30 inviti in attesa: aspetta che qualcuno risponda.');
      const limit = await staffLimit(team);
      if (limit !== null && team.staff.length + pending.length >= limit) {
        fail(402, `Con il piano Base l'area staff arriva a ${limit} persone (inviti compresi). Passa a Premium per una squadra senza limiti.`, 'premium_required');
      }
      const row = { structureId, userId, invitedBy: me, status: 'pending' };
      if (existing) await update(C.staffInvites, id, row);
      else await create(C.staffInvites, row, [], id);
      await notify(userId, 'staff_invite', `${team.name} ti invita nel suo staff su SwimIn: bacheca, turni e chat della squadra.`, structureId);
      return { invited: true };
    },

    /** L'amministratore ritira un invito non ancora accettato. */
    async cancelStaffInvite(me, { structureId, userId } = {}) {
      await requireRole(me, structureId, 'admin');
      const id = inviteKey(structureId, userId);
      const invite = await find(C.staffInvites, id);
      if (!invite || invite.status !== 'pending') fail(404, 'Invito non trovato.');
      await remove(C.staffInvites, id);
      return { cancelled: true };
    },

    /** Inviti nello staff ricevuti e non ancora risposti. */
    async listMyStaffInvites(me) {
      const rows = await listAll(C.staffInvites, [Query.equal('userId', me), Query.equal('status', 'pending')]);
      const out = [];
      for (const i of rows) {
        const team = await teamOf(i.structureId).catch(() => null);
        if (team) out.push({ structureId: i.structureId, name: team.name, logo: logoOf(team), city: team.row.city || '', invitedAt: i.$createdAt });
      }
      return out;
    },

    /** La persona invitata accetta (entra nello staff) o rifiuta. */
    async respondStaffInvite(me, { structureId, accept } = {}) {
      const id = inviteKey(structureId, me);
      const invite = await find(C.staffInvites, id);
      if (!invite || invite.status !== 'pending') fail(404, 'Invito non trovato o già gestito.');
      const team = await teamOf(structureId);
      const who = displayName(await get(C.profiles, me));
      if (!accept) {
        await update(C.staffInvites, id, { status: 'declined' });
        await notify(invite.invitedBy, 'general', `${who} ha rifiutato l’invito nello staff di ${team.name}.`, structureId);
        return { joined: false };
      }
      if (!team.staff.includes(me)) await setStaff(team, [...team.staff, me]);
      await update(C.staffInvites, id, { status: 'accepted' });
      for (const admin of team.admins) await notify(admin, 'general', `${who} è entrato nello staff di ${team.name}.`, structureId);
      return { joined: true, structureId };
    },

    /** Strutture in cui lavoro ("Lavori presso"): staff, oppure co-amministratore. */
    async listMyTeams(me) {
      const profiles = await listAll(C.profiles, [Query.contains('staff', [me])]);
      return profiles
        .filter((p) => p.userType === 'structure')
        .map((p) => ({ structureId: p.$id, name: p.structureName || 'Struttura', logo: p.logo || '', city: p.city || '', role: (p.coAdmins || []).includes(me) ? 'admin' : 'staff' }));
    },

    /**
     * Il titolare dell'account Struttura sceglie dallo staff chi lo aiuta a gestirla: annunci e
     * candidati, staff, turni e bacheca. Il profilo della struttura lo modifica solo il titolare.
     */
    async setCoAdmin(me, { structureId, userId, admin } = {}) {
      const team = await teamOf(structureId);
      if (me !== team.owner) fail(403, 'Solo il titolare della struttura sceglie i co-amministratori.');
      if (typeof userId !== 'string' || !team.staff.includes(userId)) fail(400, 'Puoi scegliere solo una persona dello staff.');
      const has = team.coAdmins.includes(userId);
      if (!!admin === has) return { coAdmins: team.coAdmins };
      if (admin && team.coAdmins.length >= MAX_CO_ADMINS) fail(409, `Puoi avere al massimo ${MAX_CO_ADMINS} co-amministratori.`);
      const coAdmins = admin ? [...team.coAdmins, userId] : team.coAdmins.filter((id) => id !== userId);
      await update(C.profiles, structureId, { coAdmins });
      await notify(
        userId,
        'general',
        admin ? `${team.name} ti ha nominato co-amministratore: puoi gestire annunci, candidati, staff e turni.` : `Non sei più co-amministratore di ${team.name}: resti nello staff.`,
        structureId
      );
      return { coAdmins };
    },

    /** Un amministratore sposta o riassegna un turno: chi lo aveva e chi lo riceve vengono avvisati. */
    async updateShift(me, { shiftId, userId, date, shiftTime } = {}) {
      const shift = await get(C.shifts, shiftId);
      const { team } = await requireRole(me, shift.structureId, 'admin');
      const next = { userId: userId || shift.userId, date: date || shift.date, shiftTime: shiftTime || shift.shiftTime };
      if (!team.staff.includes(next.userId)) fail(400, 'Puoi assegnare turni solo ai membri dello staff.');
      if (!ISO_DATE.test(next.date)) fail(400, 'Data non valida.');
      if (next.date < isoDay(Date.now() - 86_400_000) || next.date > isoDay(Date.now() + 180 * 86_400_000)) fail(400, 'La data deve essere entro i prossimi 6 mesi.');
      if (!SHIFT_TIME.test(next.shiftTime)) fail(400, 'Orario non valido.');
      const [start, end] = next.shiftTime.split('–');
      if (end <= start) fail(400, 'La fine del turno deve essere dopo l’inizio.');
      const changedPerson = next.userId !== shift.userId;
      const person = changedPerson ? await get(C.profiles, next.userId) : null;
      await cancelSwapsFor(shift.$id);
      const row = await update(C.shifts, shift.$id, {
        ...next,
        ...(person ? { userName: displayName(person).slice(0, 255), role: String(person.title || shift.role || 'Staff').slice(0, 100) } : {}),
        status: 'scheduled',
        reminderSentAt: '', // nuovo giorno o nuova persona: il promemoria va rimandato
      });
      const when = `${next.date.slice(8, 10)}/${next.date.slice(5, 7)}, ${next.shiftTime}`;
      if (changedPerson) {
        await notify(shift.userId, 'shift', `Il turno del ${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)} (${shift.shiftTime}) è stato assegnato a un collega.`, shift.structureId);
        await notify(next.userId, 'shift', `${team.name} ti ha assegnato un turno il ${when}.`, shift.structureId);
      } else {
        await notify(next.userId, 'shift', `${team.name} ha modificato il tuo turno: ora è il ${when}. Confermalo nell’area staff.`, shift.structureId);
      }
      return row;
    },

    /**
     * Turni di un mese per le paghe (solo amministratori della struttura): righe ordinate per
     * giorno e orario, con le ore di ogni turno. Il file CSV lo compone il client.
     */
    async exportShifts(me, { structureId, month } = {}) {
      const { team } = await requireRole(me, structureId, 'admin');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) fail(400, 'Mese non valido.');
      const rows = await listAll(C.shifts, [Query.equal('structureId', structureId), Query.greaterThanEqual('date', `${month}-01`), Query.lessThanEqual('date', `${month}-31`)]);
      const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const shifts = rows
        .filter((x) => String(x.date || '').startsWith(month))
        .map((x) => {
          const [start = '', end = ''] = String(x.shiftTime || '').split('–');
          const hours = start && end ? Math.max(0, minutes(end) - minutes(start)) / 60 : 0;
          return { id: x.$id, date: x.date, start, end, hours: Math.round(hours * 100) / 100, userId: x.userId, userName: x.userName || 'Staff', role: x.role || '', status: x.status || 'scheduled' };
        })
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start) || a.userName.localeCompare(b.userName));
      return { structureName: team.name, month, shifts };
    },

    /** I miei turni in tutte le strutture (dalla settimana scorsa in avanti). */
    async listMyShifts(me) {
      const { documents } = await list(C.shifts, [Query.equal('userId', me), Query.greaterThanEqual('date', isoDay(Date.now() - 7 * 86_400_000)), Query.orderAsc('date'), Query.limit(200)]);
      const names = {};
      for (const id of [...new Set(documents.map((s) => s.structureId))]) {
        const team = await teamOf(id).catch(() => null);
        // Turni di strutture di cui non faccio più parte: non li mostro.
        names[id] = team && roleIn(team, me) ? team.name : null;
      }
      return documents.filter((s) => names[s.structureId]).map((s) => ({ ...s, structureName: names[s.structureId] }));
    },

    _teamOf: teamOf,
    _addStaff: async (structureId, userId) => {
      const team = await teamOf(structureId);
      if (!team.staff.includes(userId)) await setStaff(team, [...team.staff, userId]);
      return team;
    },
  };
  this_listMyTeams = (me) => api.listMyTeams(me);
  return api;
}
