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

export function teamActions({ find, get, list, listAll, create, update, remove, removeAll, fail, notify, C, Query, displayName }) {
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

  return {
    /** Tutto ciò che serve all'area staff, solo per chi ne fa parte. */
    async getTeamBoard(me, { structureId } = {}) {
      const { team, role } = await requireRole(me, structureId, 'staff');
      const ids = [...new Set(team.staff)].slice(0, 100);
      const [members, announcements, shifts] = await Promise.all([
        ids.length ? listAll(C.profiles, [Query.equal('$id', ids)]) : [],
        list(C.announcements, [Query.equal('structureId', structureId), Query.orderDesc('$createdAt'), Query.limit(50)]),
        list(C.shifts, [Query.equal('structureId', structureId), Query.greaterThanEqual('date', isoDay(Date.now() - 7 * 86_400_000)), Query.orderAsc('date'), Query.limit(200)]),
      ]);
      return {
        role,
        members: members.map(memberCard),
        announcements: announcements.documents,
        // Lo staff vede tutti i turni della squadra (serve per gli scambi), non solo i propri.
        shifts: shifts.documents,
      };
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
