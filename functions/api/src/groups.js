/**
 * Gruppi e community: tematici (es. "Master Lombardia", "Istruttori FIN"), con
 * iscritti, amministratori e una bacheca di discussione.
 *  - "aperto": chiunque si iscrive subito;
 *  - "su approvazione": la richiesta va approvata da un amministratore.
 * I post del gruppo sono visibili agli iscritti a SwimIn; pubblicano solo i membri.
 */
export const GROUP_CATEGORIES = ['master', 'istruttori', 'salvamento', 'allenatori', 'appassionati', 'strutture', 'territorio', 'altro'];
export const GROUP_PRIVACY = ['open', 'approval'];

export function groupActions({ find, get, list, listAll, create, update, remove, removeAll, count, fail, notify, C, Query, Permission, Role, displayName, storageUrl = (v) => v || '', onGroupDeleted = async () => {} }) {
  const text = (v, label, min, max, required = true) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t && !required) return '';
    if (t.length < min) fail(400, `${label}: almeno ${min} caratteri.`);
    if (t.length > max) fail(400, `${label}: massimo ${max} caratteri.`);
    return t;
  };

  const memberRow = async (groupId, userId) =>
    (await list(C.groupMembers, [Query.equal('groupId', groupId), Query.equal('userId', userId), Query.limit(2)])).documents[0] || null;

  const isGroupAdmin = (group, me) => (group.admins || []).includes(me);

  const requireAdmin = async (groupId, me) => {
    const group = await get(C.groups, groupId);
    if (!isGroupAdmin(group, me)) fail(403, 'Solo gli amministratori del gruppo possono farlo.');
    return group;
  };

  const recount = async (groupId) => {
    const membersCount = await count(C.groupMembers, [Query.equal('groupId', groupId), Query.equal('status', 'active')]);
    await update(C.groups, groupId, { membersCount });
    return membersCount;
  };

  return {
    async createGroup(me, data = {}) {
      const profile = await get(C.profiles, me);
      if (profile.suspended) fail(403, 'Account sospeso.');
      const mine = await count(C.groups, [Query.equal('creatorId', me)]);
      if (mine >= 10) fail(409, 'Puoi creare al massimo 10 gruppi.');
      const group = await create(
        C.groups,
        {
          name: text(data.name, 'Nome', 3, 80),
          description: text(data.description, 'Descrizione', 20, 2000),
          rules: text(data.rules, 'Regole', 0, 2000, false),
          category: GROUP_CATEGORIES.includes(data.category) ? data.category : 'altro',
          privacy: GROUP_PRIVACY.includes(data.privacy) ? data.privacy : 'open',
          province: typeof data.province === 'string' && /^[A-Z]{2}$/.test(data.province.toUpperCase()) ? data.province.toUpperCase() : '',
          cover: storageUrl(data.cover, 'Copertina'),
          creatorId: me,
          admins: [me],
          membersCount: 1,
          postsCount: 0,
        },
        [Permission.read(Role.users())]
      );
      await create(C.groupMembers, { groupId: group.$id, userId: me, role: 'admin', status: 'active' }, [Permission.read(Role.users())]);
      return group;
    },

    async updateGroup(me, { groupId, ...data } = {}) {
      await requireAdmin(groupId, me);
      const patch = {};
      if ('name' in data) patch.name = text(data.name, 'Nome', 3, 80);
      if ('description' in data) patch.description = text(data.description, 'Descrizione', 20, 2000);
      if ('rules' in data) patch.rules = text(data.rules, 'Regole', 0, 2000, false);
      if ('category' in data) patch.category = GROUP_CATEGORIES.includes(data.category) ? data.category : 'altro';
      if ('privacy' in data) patch.privacy = GROUP_PRIVACY.includes(data.privacy) ? data.privacy : 'open';
      if ('cover' in data) patch.cover = storageUrl(data.cover, 'Copertina');
      return update(C.groups, groupId, patch);
    },

    /** Iscrizione: subito nei gruppi aperti, su richiesta in quelli con approvazione. */
    async joinGroup(me, { groupId } = {}) {
      const group = await get(C.groups, groupId);
      const existing = await memberRow(groupId, me);
      if (existing?.status === 'active') return { status: 'active' };
      if (existing?.status === 'banned') fail(403, 'Non puoi iscriverti a questo gruppo.');
      if (existing?.status === 'pending') return { status: 'pending' };
      const status = group.privacy === 'approval' ? 'pending' : 'active';
      await create(C.groupMembers, { groupId, userId: me, role: 'member', status }, [Permission.read(Role.users())]);
      if (status === 'active') await recount(groupId);
      else {
        const who = await find(C.profiles, me);
        for (const admin of group.admins || []) await notify(admin, 'group', `${who ? displayName(who) : 'Qualcuno'} chiede di entrare in "${group.name}".`, groupId);
      }
      return { status };
    },

    async leaveGroup(me, { groupId } = {}) {
      const group = await get(C.groups, groupId);
      const row = await memberRow(groupId, me);
      if (!row) return { left: false };
      if (isGroupAdmin(group, me) && (group.admins || []).length === 1 && (group.membersCount || 0) > 1) {
        fail(409, 'Sei l’unico amministratore: nomina un altro amministratore prima di uscire.');
      }
      await remove(C.groupMembers, row.$id);
      if (isGroupAdmin(group, me)) await update(C.groups, groupId, { admins: group.admins.filter((a) => a !== me) });
      await recount(groupId);
      return { left: true };
    },

    /** Amministratori: approva o rifiuta una richiesta, rimuovi o blocca un membro, nomina amministratore. */
    async moderateMember(me, { groupId, userId, action } = {}) {
      const group = await requireAdmin(groupId, me);
      const row = await memberRow(groupId, userId);
      if (!row) fail(404, 'Persona non trovata nel gruppo.');
      if (userId === me && action !== 'approve') fail(400, 'Per uscire usa "Lascia il gruppo".');
      if (action === 'approve') {
        await update(C.groupMembers, row.$id, { status: 'active' });
        await notify(userId, 'group', `Sei entrato nel gruppo "${group.name}".`, groupId);
      } else if (action === 'reject' || action === 'remove') {
        await remove(C.groupMembers, row.$id);
        if (isGroupAdmin(group, userId)) await update(C.groups, groupId, { admins: group.admins.filter((a) => a !== userId) });
      } else if (action === 'ban') {
        await update(C.groupMembers, row.$id, { status: 'banned', role: 'member' });
        if (isGroupAdmin(group, userId)) await update(C.groups, groupId, { admins: group.admins.filter((a) => a !== userId) });
      } else if (action === 'promote') {
        if (row.status !== 'active') fail(400, 'Prima approva la richiesta.');
        await update(C.groupMembers, row.$id, { role: 'admin' });
        await update(C.groups, groupId, { admins: [...new Set([...(group.admins || []), userId])] });
        await notify(userId, 'group', `Ora sei amministratore del gruppo "${group.name}".`, groupId);
      } else if (action === 'demote') {
        if ((group.admins || []).length <= 1) fail(409, 'Il gruppo deve avere almeno un amministratore.');
        await update(C.groupMembers, row.$id, { role: 'member' });
        await update(C.groups, groupId, { admins: group.admins.filter((a) => a !== userId) });
      } else fail(400, 'Azione non valida.');
      return { membersCount: await recount(groupId) };
    },

    /** Elimina il gruppo con i suoi post (solo amministratori). */
    async deleteGroup(me, { groupId } = {}) {
      await requireAdmin(groupId, me);
      for (const post of await listAll(C.posts, [Query.equal('groupId', groupId)])) {
        for (const t of [C.likes, C.comments, C.commentLikes, C.pollVotes]) await removeAll(t, [Query.equal('postId', post.$id)]);
        await remove(C.posts, post.$id);
      }
      await removeAll(C.groupMembers, [Query.equal('groupId', groupId)]);
      await onGroupDeleted(groupId);
      await remove(C.groups, groupId);
      return { deleted: true };
    },

    /** Usati da createPost / deletePost. */
    _assertCanPost: async (me, groupId) => {
      const group = await get(C.groups, groupId);
      const row = await memberRow(groupId, me);
      if (row?.status !== 'active') fail(403, 'Per pubblicare nel gruppo devi esserne membro.');
      return group;
    },
    _isGroupAdmin: async (groupId, me) => {
      const group = await find(C.groups, groupId);
      return !!group && isGroupAdmin(group, me);
    },
    _recountPosts: async (groupId) => {
      const postsCount = await count(C.posts, [Query.equal('groupId', groupId)]);
      await update(C.groups, groupId, { postsCount }).catch(() => null);
    },
    _leaveAll: async (me) => {
      for (const row of await listAll(C.groupMembers, [Query.equal('userId', me)])) {
        await remove(C.groupMembers, row.$id);
        const group = await find(C.groups, row.groupId);
        if (!group) continue;
        const admins = (group.admins || []).filter((a) => a !== me);
        if (admins.length === 0) {
          // Nessun altro amministratore: il membro più anziano lo diventa, oppure il gruppo vuoto si elimina.
          const next = (await list(C.groupMembers, [Query.equal('groupId', group.$id), Query.equal('status', 'active'), Query.orderAsc('$createdAt'), Query.limit(1)])).documents[0];
          if (next) {
            await update(C.groupMembers, next.$id, { role: 'admin' });
            admins.push(next.userId);
          } else {
            await remove(C.groups, group.$id);
            continue;
          }
        }
        await update(C.groups, group.$id, { admins });
        await recount(group.$id);
      }
    },
  };
}
