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

export function teamActions({ find, get, list, listAll, create, update, remove, removeAll, count = async () => 0, fail, notify, deliver = async () => null, C, Query, displayName }) {
  /** Amministratori e staff della struttura (pagina Facility o profilo Struttura). */
  const teamOf = async (structureId) => {
    if (typeof structureId !== 'string' || !structureId) fail(400, 'Parametro mancante: structureId');
    const facility = await find(C.facilities, structureId);
    if (facility) return { kind: 'facility', row: facility, name: facility.name, admins: facility.admins || [], staff: facility.staff || [] };
    const profile = await find(C.profiles, structureId);
    if (!profile || profile.userType !== 'structure') fail(404, 'Struttura non trovata.');
    return { kind: 'profile', row: profile, name: profile.structureName || 'Struttura', admins: [profile.$id], staff: profile.staff || [] };
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

  const setStaff = (team, staff) =>
    update(team.kind === 'facility' ? C.facilities : C.profiles, team.row.$id, { staff });

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

  return {
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
        members: members.map(memberCard),
        announcements: announcements.documents,
        // Lo staff vede tutti i turni della squadra (serve per gli scambi), non solo i propri.
        shifts: shifts.documents,
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

    async deleteShift(me, { shiftId } = {}) {
      const shift = await get(C.shifts, shiftId);
      await requireRole(me, shift.structureId, 'admin');
      await remove(C.shifts, shift.$id);
      if (shift.userId !== me) await notify(shift.userId, 'shift', `Il turno del ${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)} (${shift.shiftTime}) è stato annullato.`, shift.structureId);
      return { deleted: true };
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

    /** Strutture di cui faccio parte (staff o amministratore), per "Le mie strutture". */
    async listMyTeams(me) {
      const [profiles, facilities] = await Promise.all([
        listAll(C.profiles, [Query.contains('staff', [me])]),
        listAll(C.facilities, [Query.contains('staff', [me])]),
      ]);
      const admin = await listAll(C.facilities, [Query.contains('admins', [me])]);
      const rows = [
        ...profiles.filter((p) => p.userType === 'structure').map((p) => ({ structureId: p.$id, name: p.structureName || 'Struttura', logo: p.logo || '', city: p.city || '', role: 'staff' })),
        ...facilities.map((f) => ({ structureId: f.$id, name: f.name, logo: f.logo || '', city: f.city || '', role: (f.admins || []).includes(me) ? 'admin' : 'staff' })),
        ...admin.filter((f) => !(f.staff || []).includes(me)).map((f) => ({ structureId: f.$id, name: f.name, logo: f.logo || '', city: f.city || '', role: 'admin' })),
      ];
      return rows;
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
      const row = await update(C.shifts, shift.$id, {
        ...next,
        ...(person ? { userName: displayName(person).slice(0, 255), role: String(person.title || shift.role || 'Staff').slice(0, 100) } : {}),
        status: 'scheduled',
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
}
