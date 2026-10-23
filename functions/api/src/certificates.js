/**
 * Verifica dei brevetti. Il professionista carica il documento in un bucket privato
 * (leggibile solo da lui) e chiede la verifica; un amministratore lo esamina
 * tramite la Function e approva o respinge. Solo il server scrive i campi di verifica.
 */
export const CERT_BUCKET = 'certificates';

export function certificateActions({ get, update, list, fail, storage, notify, C, isAdmin, Query }) {
  const parse = (list) => (list || []).map((raw) => { try { return JSON.parse(raw); } catch { return null; } });

  const requireAdmin = async (me) => {
    if (!(await isAdmin(me))) fail(403, 'Area riservata agli amministratori.');
  };

  /** Riscrive un brevetto del profilo e ricalcola il flag "in attesa di verifica". */
  const patchCert = async (profile, certId, patch) => {
    const certs = parse(profile.certificationsList);
    const i = certs.findIndex((c) => c && c.id === certId);
    if (i < 0) fail(404, 'Brevetto non trovato.');
    certs[i] = { ...certs[i], ...patch };
    for (const k of Object.keys(certs[i])) if (certs[i][k] === undefined) delete certs[i][k];
    const pendingVerification = certs.some((c) => c && c.verificationStatus === 'pending');
    await update(C.profiles, profile.$id, { certificationsList: certs.filter(Boolean).map((c) => JSON.stringify(c)), pendingVerification });
    return certs[i];
  };

  return {
    /** Allega il documento a un proprio brevetto e lo mette in coda di verifica. */
    async requestCertVerification(me, { certId, fileId } = {}) {
      if (typeof certId !== 'string' || !certId) fail(400, 'Parametro mancante: certId');
      if (typeof fileId !== 'string' || !fileId || fileId.length > 36) fail(400, 'Parametro mancante: fileId');
      if (!storage) fail(500, 'Archivio non disponibile.');
      const file = await storage.getFile({ bucketId: CERT_BUCKET, fileId }).catch(() => null);
      // Il file deve essere stato caricato da chi chiede la verifica (permesso di lettura personale).
      if (!file || !(file.$permissions || []).includes(`read("user:${me}")`)) fail(403, 'Documento non valido.');
      const profile = await get(C.profiles, me);
      const cert = parse(profile.certificationsList).find((c) => c && c.id === certId);
      if (!cert) fail(404, 'Brevetto non trovato.');
      if (cert.documentFileId && cert.documentFileId !== fileId) {
        await storage.deleteFile({ bucketId: CERT_BUCKET, fileId: cert.documentFileId }).catch(() => null);
      }
      return patchCert(profile, certId, { documentFileId: fileId, verificationStatus: 'pending', verified: undefined, verifiedAt: undefined, verifiedBy: undefined, verificationNote: undefined });
    },

    async adminListPendingCerts(me) {
      await requireAdmin(me);
      const { documents } = await list(C.profiles, [Query.equal('pendingVerification', true), Query.limit(50)]);
      return documents.flatMap((p) =>
        parse(p.certificationsList)
          .filter((c) => c && c.verificationStatus === 'pending')
          .map((cert) => ({ profileId: p.$id, name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Utente', city: p.city || '', cert }))
      );
    },

    /** Il documento allegato, come data URL (solo amministratori). */
    async adminGetCertDocument(me, { profileId, certId } = {}) {
      await requireAdmin(me);
      const profile = await get(C.profiles, profileId);
      const cert = parse(profile.certificationsList).find((c) => c && c.id === certId);
      if (!cert?.documentFileId) fail(404, 'Nessun documento allegato.');
      const file = await storage.getFile({ bucketId: CERT_BUCKET, fileId: cert.documentFileId });
      const data = await storage.getFileView({ bucketId: CERT_BUCKET, fileId: cert.documentFileId });
      const buf = Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      return { mimeType: file.mimeType, name: file.name, dataUrl: `data:${file.mimeType};base64,${buf.toString('base64')}` };
    },

    async adminVerifyCert(me, { profileId, certId, approve, note = '' } = {}) {
      await requireAdmin(me);
      if (typeof profileId !== 'string' || typeof certId !== 'string') fail(400, 'Parametri mancanti.');
      const profile = await get(C.profiles, profileId);
      const text = String(note).trim().slice(0, 300);
      if (!approve && !text) fail(400, 'Indica il motivo del rifiuto: lo vedrà l’utente.');
      const cert = await patchCert(
        profile,
        certId,
        approve
          ? { verified: true, verifiedAt: new Date().toISOString(), verifiedBy: me, verificationStatus: 'approved', verificationNote: undefined }
          : { verified: undefined, verificationStatus: 'rejected', verificationNote: text }
      );
      await notify(
        profileId,
        'general',
        approve ? `Il brevetto "${cert.name}" è stato verificato.` : `La verifica del brevetto "${cert.name}" non è andata a buon fine: ${text}`,
        profileId
      );
      return cert;
    },
  };
}
