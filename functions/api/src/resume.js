/**
 * CV personale (PDF) nel bucket privato `resumes`.
 *
 * - Il client carica il file leggibile solo da sé; `setMyResume` controlla che sia suo, che sia
 *   un PDF entro 5 MB, lo rende di sola lettura per il proprietario e ne salva i dati in
 *   `private_info` (mai sul profilo pubblico). Il CV precedente viene eliminato.
 * - Con una candidatura (`applyForJob` con `attachResume`) la Function fa una **copia** del CV,
 *   leggibile dal candidato e da chi gestisce l'annuncio: la struttura vede la versione inviata
 *   anche se poi la persona cambia o elimina il CV. La copia sparisce con la candidatura.
 */
export const RESUME_BUCKET = 'resumes';
export const RESUME_MAX_MB = 5;
const FILE_ID = /^[A-Za-z0-9._-]{1,36}$/;

export function resumeActions({ find, create, update, fail, C, storage, Permission, Role, copyFile, log = () => {} }) {
    const meta = (row) =>
        row?.resumeFileId ? { fileId: row.resumeFileId, name: row.resumeName || 'CV.pdf', size: row.resumeSize || 0, updatedAt: row.resumeUpdatedAt || null } : null;

    const savePrivate = async (me, data) => {
        const existing = await find(C.privateInfo, me);
        if (existing) return update(C.privateInfo, me, data);
        return create(C.privateInfo, data, [], me);
    };

    const deleteFile = async (fileId) => {
        if (!fileId || !storage) return;
        await storage.deleteFile({ bucketId: RESUME_BUCKET, fileId }).catch((e) => log(`CV ${fileId} non eliminato: ${e?.message || e}`));
    };

    return {
        /** Il mio CV (nome, dimensione, data): solo per me. */
        async getMyResume(me) {
            return meta(await find(C.privateInfo, me));
        },

        async setMyResume(me, { fileId } = {}) {
            if (!storage) fail(500, 'Archivio file non disponibile.');
            if (typeof fileId !== 'string' || !FILE_ID.test(fileId)) fail(400, 'File non valido.');
            const profile = await find(C.profiles, me);
            if (!profile || profile.userType !== 'professional') fail(403, 'Il CV si aggiunge ai profili delle persone.');
            const file = await storage.getFile({ bucketId: RESUME_BUCKET, fileId }).catch(() => null);
            // Il file deve averlo caricato chi chiama (permesso di lettura personale).
            if (!file || !(file.$permissions || []).includes(`read("user:${me}")`)) fail(403, 'File non valido.');
            if (file.mimeType !== 'application/pdf') {
                await deleteFile(fileId);
                fail(400, 'Il CV deve essere un file PDF.');
            }
            if (file.sizeOriginal > RESUME_MAX_MB * 1024 * 1024) {
                await deleteFile(fileId);
                fail(400, `Il CV può pesare al massimo ${RESUME_MAX_MB} MB.`);
            }
            // Da qui in poi solo il proprietario lo legge; modifiche ed eliminazione passano dalla Function.
            await storage.updateFile({ bucketId: RESUME_BUCKET, fileId, name: file.name, permissions: [Permission.read(Role.user(me))] });
            const previous = meta(await find(C.privateInfo, me));
            const row = await savePrivate(me, {
                resumeFileId: fileId,
                resumeName: String(file.name || 'CV.pdf').slice(0, 120),
                resumeSize: file.sizeOriginal || 0,
                resumeUpdatedAt: new Date().toISOString(),
            });
            if (previous && previous.fileId !== fileId) await deleteFile(previous.fileId);
            return meta(row);
        },

        async deleteMyResume(me) {
            const current = meta(await find(C.privateInfo, me));
            if (!current) return { deleted: false };
            await update(C.privateInfo, me, { resumeFileId: null, resumeName: null, resumeSize: null, resumeUpdatedAt: null });
            await deleteFile(current.fileId);
            return { deleted: true };
        },

        /** Copia del CV per una candidatura, leggibile da candidato e selezionatori. */
        async _copyForApplication(me, readers) {
            const current = meta(await find(C.privateInfo, me));
            if (!current) fail(400, 'Non hai ancora caricato un CV: aggiungilo dal tuo profilo o candidati senza.');
            if (!copyFile) fail(500, 'Archivio file non disponibile.');
            const permissions = [...new Set([me, ...readers])].map((id) => Permission.read(Role.user(id)));
            const copyId = await copyFile(RESUME_BUCKET, current.fileId, current.name, permissions);
            return { resumeFileId: copyId, resumeName: current.name };
        },

        /** Elimina la copia allegata a una candidatura (ritiro, account o annuncio eliminati). */
        async _deleteApplicationCopy(application) {
            await deleteFile(application?.resumeFileId);
        },

        _deleteMine: async (me) => {
            const current = meta(await find(C.privateInfo, me));
            if (current) await deleteFile(current.fileId);
        },
    };
}
