/**
 * Messaggi più ricchi: allegati (foto e documenti) in un bucket privato, risposte
 * a un messaggio, reazioni ed eliminazione "per tutti".
 *
 * Gli allegati li carica il client con permesso di lettura solo per sé; all'invio la
 * Function verifica che il file sia suo e lo rende leggibile anche al destinatario.
 * Nessun altro può vederli.
 */
export const CHAT_BUCKET = 'chat_files';
export const MAX_ATTACHMENTS = 4;
export const MAX_CHAT_FILE_MB = 10;
export const CHAT_MIME = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
/** Reazioni ai messaggi (le stesse dei post, in versione compatta). */
export const MESSAGE_REACTIONS = ['consiglio', 'adoro', 'felice', 'applauso', 'interessante', 'sostegno'];

const parse = (raw, fallback) => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };

export function chatActions({ get, update, fail, C, storage, Permission, Role, beforeDelete = async () => {} }) {
  const participantOf = (msg, me) => msg.senderId === me || msg.receiverId === me;

  return {
    /** Verifica gli allegati e li rende leggibili al destinatario. Restituisce i JSON da salvare. */
    async _attach(me, receiverId, attachments) {
      if (attachments == null) return [];
      if (!Array.isArray(attachments)) fail(400, 'Allegati non validi.');
      if (attachments.length > MAX_ATTACHMENTS) fail(400, `Puoi allegare al massimo ${MAX_ATTACHMENTS} file.`);
      if (!attachments.length) return [];
      if (!storage) fail(500, 'Archivio non disponibile.');
      const out = [];
      for (const a of attachments) {
        const fileId = typeof a === 'string' ? a : a?.fileId;
        if (typeof fileId !== 'string' || !/^[A-Za-z0-9._-]{1,36}$/.test(fileId)) fail(400, 'Allegato non valido.');
        const file = await storage.getFile({ bucketId: CHAT_BUCKET, fileId }).catch(() => null);
        // Il file deve essere stato caricato da chi scrive (permesso di lettura personale).
        if (!file || !(file.$permissions || []).includes(`read("user:${me}")`)) fail(403, 'Allegato non valido.');
        if (!CHAT_MIME.includes(file.mimeType)) fail(400, 'Puoi allegare foto (JPG, PNG, WebP), PDF, Word o Excel.');
        if (file.sizeOriginal > MAX_CHAT_FILE_MB * 1024 * 1024) fail(400, `Ogni allegato può pesare al massimo ${MAX_CHAT_FILE_MB} MB.`);
        await storage.updateFile({
          bucketId: CHAT_BUCKET, fileId, name: file.name,
          permissions: [Permission.read(Role.user(me)), Permission.read(Role.user(receiverId)), Permission.delete(Role.user(me))],
        });
        out.push(JSON.stringify({ fileId, name: String(file.name).slice(0, 120), mime: file.mimeType, size: file.sizeOriginal }));
      }
      return out;
    },

    /** Anteprima del messaggio a cui si risponde (stessa conversazione). */
    async _replyPreview(me, conversationId, replyToId) {
      if (!replyToId) return null;
      if (typeof replyToId !== 'string' || replyToId.length > 36) fail(400, 'Risposta non valida.');
      const original = await get(C.messages, replyToId);
      if (original.conversationId !== conversationId || !participantOf(original, me)) fail(400, 'Risposta non valida.');
      const files = (original.attachments || []).length;
      const text = original.deleted ? 'Messaggio eliminato' : (original.content || '').slice(0, 140) || (files ? (files === 1 ? 'Allegato' : `${files} allegati`) : '');
      return JSON.stringify({ id: original.$id, senderId: original.senderId, text });
    },

    /** Reazione a un messaggio della propria conversazione (null la toglie). */
    async reactMessage(me, { messageId, reaction = null } = {}) {
      if (typeof messageId !== 'string' || !messageId) fail(400, 'Messaggio non valido.');
      if (reaction !== null && !MESSAGE_REACTIONS.includes(reaction)) fail(400, 'Reazione non valida.');
      const msg = await get(C.messages, messageId);
      if (!participantOf(msg, me)) fail(403, 'Non fai parte di questa conversazione.');
      if (msg.deleted) fail(409, 'Il messaggio è stato eliminato.');
      const reactions = parse(msg.reactions, {});
      if (reaction) reactions[me] = reaction;
      else delete reactions[me];
      const saved = await update(C.messages, messageId, { reactions: JSON.stringify(reactions) });
      return { reactions: parse(saved.reactions, {}) };
    },

    /** Elimina per tutti un proprio messaggio: testo e allegati spariscono. */
    async deleteMessage(me, { messageId } = {}) {
      if (typeof messageId !== 'string' || !messageId) fail(400, 'Messaggio non valido.');
      const msg = await get(C.messages, messageId);
      if (msg.senderId !== me) fail(403, 'Puoi eliminare solo i tuoi messaggi.');
      // Conservazione su ordine dell'autorità: prima di cancellare resta una copia sigillata.
      await beforeDelete(msg);
      if (storage) {
        for (const raw of msg.attachments || []) {
          const a = parse(raw, null);
          if (a?.fileId) await storage.deleteFile({ bucketId: CHAT_BUCKET, fileId: a.fileId }).catch(() => null);
        }
      }
      await update(C.messages, messageId, { deleted: true, content: '', attachments: [], reactions: null, replyPreview: null });
      return { deleted: true };
    },
  };
}
