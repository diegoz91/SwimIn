/**
 * Profili pubblici: la scheda visibile anche senza account (link condivisi,
 * anteprime social, motori di ricerca). Le strutture sono pubbliche; le persone
 * solo se lo hanno scelto (`publicProfile`). Restituisce solo dati non sensibili.
 */
const parse = (list) => (list || []).flatMap((raw) => { try { return [JSON.parse(raw)]; } catch { return []; } });
const clip = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const today = () => new Date().toISOString().slice(0, 10);

export const PUBLIC_ACTIONS = ['publicProfile', 'publicSitemap', 'publicJob', 'publicJobs'];

export function publicActions({ find, listAll, list, fail, C, Query }) {
  const rating = (row) => (row.ratingCount ? { average: Math.round((row.ratingSum / row.ratingCount) * 10) / 10, count: row.ratingCount } : null);

  const personCard = (p) => {
    const certs = parse(p.certificationsList).filter((c) => c && c.name && (!c.expiry || c.expiry >= today()));
    return {
      kind: 'person',
      id: p.$id,
      name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Utente SwimIn',
      headline: clip(p.title, 100) || (p.personType === 'enthusiast' ? 'Appassionato di nuoto' : 'Professionista del nuoto'),
      enthusiast: p.personType === 'enthusiast',
      city: p.city || '',
      province: p.province || '',
      avatar: p.avatar || '',
      cover: p.cover || '',
      bio: clip(p.bio, 600),
      skills: (p.skills || []).slice(0, 12),
      languages: (p.languages || []).slice(0, 6),
      experiences: parse(p.experienceList).slice(0, 6).map((e) => ({ title: clip(e.title, 100), company: clip(e.company, 100), startDate: e.startDate || '', endDate: e.endDate || '', current: !!e.current })),
      certifications: certs.slice(0, 12).map((c) => ({ name: clip(c.name, 100), issuer: clip(c.issuer, 100), category: c.category || '', verified: !!c.verified })),
      connections: (p.connections || []).length,
    };
  };

  const structureCard = (p) => ({
    kind: 'structure',
    id: p.$id,
    name: p.structureName || 'Struttura',
    headline: p.structureType || 'Piscina',
    city: p.city || '',
    province: p.province || '',
    avatar: p.logo || '',
    cover: p.cover || '',
    bio: clip(p.bio, 1000),
    address: clip(p.address, 160),
    website: p.website || '',
    phone: p.phone || '',
    services: (p.services || []).slice(0, 20),
    poolLength: p.poolLength || null,
    lanes: p.lanes || null,
    poolSetting: p.poolSetting || null,
    rating: rating(p),
  });

  const facilityCard = (f) => ({
    kind: 'structure',
    id: f.$id,
    name: f.name,
    headline: f.type || 'Piscina',
    city: f.city || '',
    province: f.province || '',
    avatar: f.logo || '',
    cover: f.cover || '',
    bio: clip(f.bio, 1000),
    services: [],
    rating: rating(f),
  });

  /** Annuncio visibile senza account (pagina /offerte/:id e Google Jobs): niente candidati né dati interni. */
  const jobOpen = (j) => j && j.isActive !== false && (!j.expiresAt || j.expiresAt >= today());
  const jobCard = (j) => ({
    id: j.$id,
    title: clip(j.title, 255),
    description: clip(j.description, 4000),
    role: clip(j.role, 100),
    contractType: j.contractType || '',
    city: j.city || '',
    province: j.province || '',
    salaryMin: Number.isFinite(j.salaryMin) ? j.salaryMin : null,
    salaryMax: Number.isFinite(j.salaryMax) ? j.salaryMax : null,
    workingHours: clip(j.workingHours, 255),
    requirements: (j.requirements || []).slice(0, 20).map((r) => clip(r, 500)),
    qualifications: (j.qualificationsRequired || []).slice(0, 20).map((r) => clip(r, 500)),
    isSOS: !!j.isSOS,
    sosDate: j.sosDate || '',
    sosShift: j.sosShift || '',
    structureId: j.structureId,
    structureName: j.structureName || 'Struttura',
    structureLogo: /^https:\/\//.test(j.facilityLogo || '') ? j.facilityLogo : '',
    postedAt: j.$createdAt || '',
    expiresAt: j.expiresAt || '',
  });

  return {
    async publicJob(_me, { id } = {}) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,36}$/.test(id)) fail(400, 'Annuncio non valido.');
      const job = await find(C.jobs, id);
      if (!job) fail(404, 'Annuncio non trovato.');
      if (!jobOpen(job)) fail(410, 'Questa offerta non è più disponibile.');
      return jobCard(job);
    },

    /** Annunci aperti per la sitemap (i più recenti). */
    async publicJobs() {
      const { documents } = await list(C.jobs, [Query.equal('isActive', true), Query.orderDesc('$createdAt'), Query.limit(1000)]);
      return documents.filter(jobOpen).map((j) => ({ id: j.$id, updatedAt: j.$updatedAt || j.$createdAt || '' }));
    },

    async publicProfile(_me, { id } = {}) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_.-]{1,36}$/.test(id)) fail(400, 'Profilo non valido.');
      const profile = await find(C.profiles, id);
      if (profile && !profile.suspended) {
        if (profile.userType === 'structure') return structureCard(profile);
        if (profile.publicProfile) return personCard(profile);
        fail(403, 'Questo profilo è visibile solo agli iscritti a SwimIn.');
      }
      const facility = !profile ? await find(C.facilities, id) : null;
      if (facility) return facilityCard(facility);
      fail(404, 'Profilo non trovato.');
    },

    /** Indirizzi da indicizzare: strutture, pagine e persone che hanno reso pubblico il profilo. */
    async publicSitemap() {
      const [structures, people, facilities] = await Promise.all([
        listAll(C.profiles, [Query.equal('userType', 'structure')]),
        listAll(C.profiles, [Query.equal('publicProfile', true)]),
        list(C.facilities, [Query.limit(500)]).then((r) => r.documents),
      ]);
      return [...structures, ...people, ...facilities]
        .filter((r) => !r.suspended)
        .slice(0, 5000)
        .map((r) => ({ id: r.$id, updatedAt: r.$updatedAt || r.$createdAt || '' }));
    },
  };
}
