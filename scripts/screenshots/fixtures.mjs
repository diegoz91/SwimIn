/**
 * Dati di esempio per le schermate generate in CI (nessun dato reale).
 * Le chiamate ad Appwrite vengono intercettate e servite da qui.
 */
const now = Date.now();
const iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

const doc = (collection, id, data, minutesAgo = 600) => ({
    $id: id,
    $collectionId: collection,
    $databaseId: 'swimwaveup_db',
    $createdAt: iso(minutesAgo),
    $updatedAt: iso(minutesAgo),
    $permissions: [`read("users")`, `update("user:${data.authorId || data.userId || id}")`],
    $sequence: 1,
    ...data,
});

export const ME = 'u_giulia';

const exp = (role, facility, period, description, extra = {}) => JSON.stringify({ role, facility, period, description, ...extra });
const cert = (name, issuer, category, expiry, extra = {}) => JSON.stringify({ name, issuer, category, expiry, ...extra });
const DAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const allToday = ['mattina', 'pomeriggio', 'sera'].map((p) => `${['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'][new Date(now).getDay()]}-${p}`);

const session = (id, minutesAgo, extra) => ({
    $id: id, $createdAt: iso(minutesAgo), $updatedAt: iso(minutesAgo), userId: ME, expire: iso(-60 * 24 * 300), provider: 'email',
    providerUid: 'giulia.ferri@example.com', ip: '0.0.0.0', osCode: '', osVersion: '', clientType: 'browser', clientCode: '', clientVersion: '',
    clientEngine: '', clientEngineVersion: '', deviceBrand: '', deviceModel: '', countryCode: 'it', countryName: 'Italia', current: false,
    factors: ['password'], secret: '', mfaUpdatedAt: '', ...extra,
});
/** Dispositivi collegati e attività dell'account (Accesso e sicurezza). */
export const sessions = [
    session('s1', 30, { clientName: 'Chrome', osName: 'Windows', deviceName: 'desktop', current: true }),
    session('s2', 60 * 26, { clientName: 'Safari', osName: 'iOS', deviceName: 'smartphone', deviceBrand: 'Apple', deviceModel: 'iPhone' }),
    session('s3', 60 * 24 * 9, { clientName: 'Firefox', osName: 'Mac', deviceName: 'desktop' }),
];
const log = (event, minutesAgo, clientName, osName) => ({ event, userId: ME, userEmail: '', userName: '', mode: 'default', ip: '0.0.0.0', time: iso(minutesAgo), osCode: '', osName, osVersion: '', clientType: 'browser', clientCode: '', clientName, clientVersion: '', clientEngine: '', clientEngineVersion: '', deviceName: '', deviceBrand: '', deviceModel: '', countryCode: 'it', countryName: 'Italia' });
export const accountLogs = [
    log('session.create', 30, 'Chrome', 'Windows'),
    log('session.create', 60 * 26, 'Safari', 'iOS'),
    log('user.update.password', 60 * 24 * 3, 'Chrome', 'Windows'),
    log('session.create', 60 * 24 * 9, 'Firefox', 'Mac'),
];

export const account = {
    $id: ME,
    $createdAt: iso(60 * 24 * 90),
    $updatedAt: iso(10),
    name: 'Giulia Ferri',
    registration: iso(60 * 24 * 90),
    status: true,
    labels: [],
    passwordUpdate: iso(60 * 24 * 90),
    email: 'giulia.ferri@example.com',
    phone: '',
    emailVerification: true,
    phoneVerification: false,
    mfa: false,
    prefs: {},
    targets: [],
    accessedAt: iso(1),
};

const profiles = [
    doc('profiles', ME, {
        userId: ME, userType: 'professional', email: account.email,
        firstName: 'Giulia', lastName: 'Ferri', title: 'Istruttrice FIN di nuoto e acquaticità',
        city: 'Milano', province: 'MI', isOnline: true, readReceipts: true, availableForEmergencies: true,
        bio: 'Insegno nuoto da otto anni, dai corsi neonatali alla preparazione agonistica giovanile. Mi interessano la didattica per bambini con disabilità e l\'analisi video della tecnica.',
        connections: ['u_marco', 'u_sara', 'u_lido'],
        phone: '+39 333 123 4567', website: 'https://giuliaferri.example', languages: ['Italiano', 'Inglese', 'Spagnolo'],
        availability: [...DAYS.slice(0, 5).map((d) => `${d}-pomeriggio`), 'sab-mattina'],
        skills: ['Scuola nuoto bambini', 'Acquaticità neonatale', 'Nuoto agonistico', 'Primo soccorso BLSD'],
        experienceList: [
            exp('Istruttrice di nuoto', 'Piscina Lido di Milano', '', 'Corsi bambini 4-10 anni e preagonistica.', { startDate: '2021-09', current: true, employmentType: 'collaborazione', city: 'Milano' }),
            exp('Assistente bagnante', 'Centro Sportivo Saini', '', 'Sorveglianza vasca olimpionica, turni estivi.', { startDate: '2017-06', endDate: '2021-08', employmentType: 'stagionale' }),
            exp('Istruttrice estiva', 'Camp Nuoto Lago di Como', 'Estati 2015 e 2016', ''),
        ],
        certificationsList: [
            cert('Istruttore di nuoto 2° livello', 'FIN – Federazione Italiana Nuoto', 'istruzione', undefined, { id: 'c_fin2', issueDate: '2019-05-12', credentialId: 'FIN-IS2-48211', verified: true, verificationStatus: 'approved' }),
            cert('Brevetto Assistente Bagnanti', 'Società Nazionale di Salvamento', 'salvamento', new Date(now + 20 * 86400000).toISOString().slice(0, 10), { id: 'c_snsb', issueDate: '2023-11-14', verificationStatus: 'pending' }),
            cert('BLSD esecutore', 'IRC', 'Primo soccorso', '2026-03-01'),
        ],
        managedFacilities: [],
    }, 60 * 24 * 90),
    doc('profiles', 'u_marco', {
        userId: 'u_marco', userType: 'professional', premiumUntil: new Date(now + 20 * 86400000).toISOString(), email: 'marco@example.com', firstName: 'Marco', lastName: 'Bellini',
        title: 'Allenatore squadra master', city: 'Monza', province: 'MB', isOnline: true, connections: [ME], availability: allToday,
        skills: ['Nuoto master', 'Preparazione atletica a secco'],
    }),
    doc('profiles', 'u_sara', {
        userId: 'u_sara', userType: 'professional', email: 'sara@example.com', firstName: 'Sara', lastName: 'Colombo',
        title: 'Assistente bagnanti e istruttrice aquagym', city: 'Milano', province: 'MI', connections: [ME], availability: allToday.slice(1),
    }),
    doc('profiles', 'u_luca', {
        userId: 'u_luca', userType: 'professional', email: 'luca@example.com', firstName: 'Luca', lastName: 'Rinaldi',
        title: 'Allenatore pallanuoto under 16', city: 'Bergamo', province: 'BG', connections: [],
    }),
    doc('profiles', 'u_paolo', {
        userId: 'u_paolo', userType: 'professional', personType: 'enthusiast', email: 'paolo@example.com', firstName: 'Paolo', lastName: 'Riva',
        title: 'Nuotatore master', city: 'Milano', province: 'MI', connections: [ME], sports: ['Nuoto master', 'Nuoto in acque libere', 'Triathlon'],
        bio: 'Nuoto tre volte a settimana alla Lido, d’estate traversate al lago.',
    }),
    doc('profiles', 'u_elena', {
        userId: 'u_elena', userType: 'professional', email: 'elena@example.com', firstName: 'Elena', lastName: 'Marchi',
        title: 'Coordinatrice scuola nuoto', city: 'Milano', province: 'MI', connections: [],
    }),
    doc('profiles', 'u_lido', {
        userId: 'u_lido', userType: 'structure', email: 'info@lido.example', structureName: 'Piscina Lido di Milano',
        structureType: 'Piscina comunale', city: 'Milano', province: 'MI', connections: [ME], staff: [ME, 'u_sara'],
        bio: 'Vasca olimpionica scoperta, vasca coperta da 25 m e vasca didattica. Corsi per tutte le età.',
        address: 'Piazza Lombardia 1', postalCode: '20131', phone: '02 1234567', website: 'https://piscinalido.example',
        poolLength: 50, lanes: 8, poolSetting: 'entrambe', ratingSum: 13, ratingCount: 3, services: ['Scuola nuoto', 'Nuoto libero', 'Agonismo', 'Acquafitness', 'Corsi di salvamento'],
        openingHours: ['07:00-22:00', '07:00-22:00', '07:00-13:00,15:00-22:00', '07:00-22:00', '07:00-22:00', '09:00-19:00', 'chiuso'],
    }),
    doc('profiles', 'u_aquae', {
        userId: 'u_aquae', userType: 'structure', email: 'staff@aquae.example', structureName: 'Aquae Sport Center',
        structureType: 'Centro sportivo', city: 'Sesto San Giovanni', province: 'MI', connections: [],
    }),
];

const posts = [
    doc('posts', 'p1', {
        authorId: 'u_marco', authorType: 'professional', postType: 'text', visibility: 'public', category: 'allenamento',
        content: 'Serie della settimana per il gruppo #master: 10x100 stile libero partenza 1\'40", con gli ultimi 25 in apnea controllata. Grazie a @[Sara Colombo](u_sara) per l\'idea!\n\nFeedback sulle vostre serie di #soglia?', hashtags: ['master', 'soglia'], mentions: ['u_sara'],
        likesCount: 24, commentsCount: 6, media: [], reactionCounts: JSON.stringify({ consiglio: 14, applauso: 7, interessante: 3 }), repostsCount: 2,
    }, 45),
    doc('posts', 'p5', {
        authorId: 'u_elena', authorType: 'professional', postType: 'text', visibility: 'public', category: 'tecnica',
        content: 'Corsi bambini: preferite la lezione da 45 minuti o da un\'ora? #scuolanuoto', hashtags: ['scuolanuoto'],
        likesCount: 5, commentsCount: 0, media: [], pollOptions: ['45 minuti', 'Un\'ora', 'Dipende dall\'età'], pollEndsAt: new Date(now + 2 * 86400000).toISOString(), pollCounts: JSON.stringify([12, 7, 9]),
    }, 20),
    doc('posts', 'p4', {
        authorId: 'u_sara', authorType: 'professional', postType: 'repost', visibility: 'public', category: 'generale', repostOf: 'p2',
        content: 'Ottima notizia per chi lavora in zona: la vasca coperta del Lido è tra le più belle di Milano.',
        likesCount: 3, commentsCount: 0, media: [], reactionCounts: JSON.stringify({ adoro: 2, consiglio: 1 }),
    }, 30),
    doc('posts', 'p2', {
        authorId: 'u_lido', authorType: 'structure', postType: 'text', visibility: 'public', category: 'normative',
        content: 'Dal 1° novembre riapre la vasca coperta da 25 metri dopo la sostituzione dell\'impianto di trattamento acqua. Stiamo cercando due assistenti bagnanti per i turni serali: trovate l\'annuncio nella bacheca lavoro.',
        likesCount: 41, commentsCount: 3, media: [], reactionCounts: JSON.stringify({ consiglio: 30, sostegno: 6, felice: 5 }),
    }, 180),
    doc('posts', 'p3', {
        authorId: 'u_sara', authorType: 'professional', postType: 'text', visibility: 'public', category: 'tecnica',
        content: 'Ho finalmente rinnovato il brevetto BLSD. Promemoria per tutti i colleghi: controllate le scadenze prima dell\'estate, i corsi si riempiono in fretta.',
        likesCount: 12, commentsCount: 2, media: [],
    }, 60 * 26),
];

posts.push(
    doc('posts', 'p6', {
        authorId: 'u_marco', authorType: 'professional', postType: 'text', visibility: 'public', category: 'generale', groupId: 'g1',
        content: 'Domenica gara regionale master a Monza: chi viene? Organizziamo le macchine dal Lido alle 7. #master',
        hashtags: ['master'], likesCount: 6, commentsCount: 2, media: [], reactionCounts: JSON.stringify({ consiglio: 4, felice: 2 }),
    }, 90),
);

const groups = [
    doc('groups', 'g1', {
        name: 'Master Lombardia', category: 'master', privacy: 'approval', province: 'MI', creatorId: 'u_marco', admins: ['u_marco', ME], membersCount: 3, postsCount: 1,
        description: 'Allenamenti, gare e trasferte per chi nuota master in Lombardia. Ci si scambia serie, risultati e passaggi per le gare.',
        rules: 'Rispetto per tutti, niente pubblicità. Annunci di lavoro solo nella bacheca Lavoro.',
    }, 60 * 24 * 40),
    doc('groups', 'g2', {
        name: 'Bagnini d’estate', category: 'salvamento', privacy: 'open', creatorId: 'u_sara', admins: ['u_sara'], membersCount: 128, postsCount: 42,
        description: 'Turni, brevetti, rinnovi e consigli per chi lavora negli stabilimenti e nelle piscine all’aperto.',
    }, 60 * 24 * 80),
    doc('groups', 'g3', {
        name: 'Istruttori FIN Milano', category: 'istruttori', privacy: 'open', province: 'MI', creatorId: 'u_elena', admins: ['u_elena'], membersCount: 64, postsCount: 17,
        description: 'Didattica, progressioni per i corsi bambini e aggiornamenti dai corsi federali.',
    }, 60 * 24 * 20),
];
const group_members = [
    doc('group_members', 'gm1', { groupId: 'g1', userId: 'u_marco', role: 'admin', status: 'active' }, 60 * 24 * 40),
    doc('group_members', 'gm2', { groupId: 'g1', userId: ME, role: 'admin', status: 'active' }, 60 * 24 * 30),
    doc('group_members', 'gm3', { groupId: 'g1', userId: 'u_sara', role: 'member', status: 'active' }, 60 * 24 * 10),
    doc('group_members', 'gm4', { groupId: 'g1', userId: 'u_luca', role: 'member', status: 'pending' }, 60 * 3),
];

const inDays = (n) => new Date(now + n * 86400000).toISOString().slice(0, 10);
const swim_meets = [
    doc('swim_meets', 'e1', {
        type: 'corso', title: 'Corso BLSD per assistenti bagnanti', creatorId: 'u_lido', status: 'upcoming',
        description: 'Rianimazione cardiopolmonare e uso del defibrillatore, con prova pratica e attestato valido per il rinnovo del brevetto.\n\nPortare un documento e abbigliamento comodo.',
        date: inDays(9), time: '09:00', endTime: '13:00', city: 'Milano', province: 'MI', address: 'Lido di Milano, piazzale Lotto 15',
        price: 60, maxParticipants: 4, participants: ['u_lido', 'u_marco', 'u_sara', 'u_elena'], waitlist: ['u_luca'],
    }, 60 * 24 * 2),
    doc('swim_meets', 'e2', {
        type: 'allenamento', title: 'Allenamento master condiviso in vasca lunga', creatorId: 'u_marco', status: 'upcoming', groupId: 'g1',
        description: 'Serie aerobiche e tecnica di virata per chi prepara le gare invernali. Corsie divise per livello.',
        date: inDays(3), time: '19:30', endTime: '21:00', city: 'Milano', province: 'MI', address: 'Piscina Cozzi, viale Tunisia 35',
        price: 0, participants: ['u_marco', ME, 'u_sara'], waitlist: [],
    }, 60 * 24),
    doc('swim_meets', 'e3', {
        type: 'webinar', title: 'Didattica per i corsi 4–6 anni', creatorId: 'u_elena', status: 'upcoming', isOnline: true, onlineUrl: 'https://meet.example.com/didattica',
        description: 'Giochi e progressioni per l’acquaticità dei più piccoli, con domande finali.',
        date: inDays(12), time: '21:00', city: 'Online', price: 0, participants: ['u_elena', 'u_luca'], waitlist: [],
    }, 60 * 5),
];

const jobs = [
    doc('jobs', 'j1', {
        structureId: 'u_lido', structureName: 'Piscina Lido di Milano', title: 'Assistente bagnanti turni serali', role: 'Bagnino',
        description: 'Sorveglianza della vasca coperta dal lunedì al venerdì, 18:00–22:00.', contractType: 'Part-time', city: 'Milano', province: 'MI',
        salaryMin: 1100, salaryMax: 1300, isActive: true, isSOS: false, requirements: ['Brevetto SNS o FIN'], qualificationsRequired: ['Brevetto Salvamento'], candidates: [],
    }, 200),
    doc('jobs', 'j2', {
        structureId: 'u_aquae', structureName: 'Aquae Sport Center', title: 'Istruttore scuola nuoto bambini', role: 'Istruttore',
        description: 'Corsi pomeridiani 4-10 anni.', contractType: 'Collaborazione sportiva', city: 'Sesto San Giovanni', province: 'MI',
        salaryMin: 15, salaryMax: 18, isActive: true, isSOS: false, requirements: [], qualificationsRequired: ['Istruttore FIN'], candidates: [],
    }, 60 * 30),
    doc('jobs', 'j3', {
        structureId: 'u_aquae', structureName: 'Aquae Sport Center', title: '🚨 SOS SOSTITUZIONE URGENTE: Bagnino', role: 'bagnino',
        description: 'Sostituzione per malattia.', contractType: 'collaborazione', city: 'Sesto San Giovanni', province: 'MI',
        salaryMin: 90, salaryMax: 90, isActive: true, isSOS: true, sosDate: 'Domani', sosShift: '14:00 – 20:00', requirements: [], qualificationsRequired: ['Brevetto Salvamento'], candidates: [],
    }, 30),
    // Annuncio chiuso (candidatura di Giulia non selezionata).
    doc('jobs', 'j4', {
        structureId: 'u_lido', structureName: 'Piscina Lido di Milano', title: 'Istruttrice acquagym mattino', role: 'acquafitness',
        description: 'Corsi di acquagym il martedì e giovedì mattina.', contractType: 'part-time', city: 'Milano', province: 'MI',
        isActive: false, isSOS: false, requirements: [], qualificationsRequired: [], candidates: [ME],
    }, 60 * 24 * 20),
];

/** Candidature: di Giulia (percorso a tappe) e quelle ricevute da j1 (vista della struttura). */
const applications = [
    doc('applications', 'a1', { jobId: 'j2', applicantId: ME, status: 'accepted', coverLetter: 'Insegno ai bambini da sei anni, anche corsi di acquaticità 3-5 anni.' }, 60 * 24 * 2),
    doc('applications', 'a2', { jobId: 'j4', applicantId: ME, status: 'rejected' }, 60 * 24 * 18),
    doc('applications', 'a3', { jobId: 'j1', applicantId: 'u_marco', status: 'pending', priority: true, coverLetter: 'Brevetto FIN di salvamento rinnovato a settembre, disponibile tutte le sere.' }, 60 * 3),
    doc('applications', 'a4', { jobId: 'j1', applicantId: 'u_sara', status: 'pending' }, 60 * 26),
    doc('applications', 'a5', { jobId: 'j1', applicantId: 'u_luca', status: 'reviewed' }, 60 * 50),
];

const notifications = [
    doc('notifications', 'n1', { userId: ME, type: 'like', content: 'Marco Bellini ha consigliato il tuo post.', relatedId: 'p1', isRead: false }, 12),
    doc('notifications', 'n2', { userId: ME, type: 'endorsement', content: 'Sara Colombo ha confermato la tua competenza "Scuola nuoto bambini".', relatedId: 'u_sara', isRead: false }, 90),
    doc('notifications', 'n3', { userId: ME, type: 'connection', content: 'Luca Rinaldi vuole collegarsi con te.', relatedId: 'u_luca', isRead: true }, 60 * 30),
];

const endorsements = [
    doc('endorsements', 'e1', { profileId: ME, endorserId: 'u_sara', skill: 'Scuola nuoto bambini' }),
    doc('endorsements', 'e2', { profileId: ME, endorserId: 'u_marco', skill: 'Scuola nuoto bambini' }),
    doc('endorsements', 'e3', { profileId: ME, endorserId: 'u_marco', skill: 'Nuoto agonistico' }),
];

const connections = [doc('connections', 'c1', { senderId: 'u_luca', receiverId: ME, status: 'pending' }, 60 * 30)];

const messages = [
    doc('messages', 'm0a', { conversationId: [ME, 'u_marco'].sort().join('_'), senderId: ME, receiverId: 'u_marco', content: 'Ciao Marco, ti giro il calendario dei turni di novembre.', isRead: true, attachments: [JSON.stringify({ fileId: 'f1', name: 'turni-novembre.pdf', mime: 'application/pdf', size: 248000 })] }, 60 * 26),
    doc('messages', 'm0b', { conversationId: [ME, 'u_marco'].sort().join('_'), senderId: 'u_marco', receiverId: ME, content: '', isRead: true, deleted: true }, 60 * 25),
    doc('messages', 'm0c', { conversationId: [ME, 'u_marco'].sort().join('_'), senderId: 'u_marco', receiverId: ME, content: 'Grazie! Lo stampo per lo staff.', isRead: true, reactions: JSON.stringify({ [ME]: 'adoro' }), replyToId: 'm0a', replyPreview: JSON.stringify({ id: 'm0a', senderId: ME, text: 'Ciao Marco, ti giro il calendario dei turni di novembre.' }) }, 60 * 24),
    doc('messages', 'm1', { conversationId: [ME, 'u_marco'].sort().join('_'), senderId: 'u_marco', receiverId: ME, content: 'Ciao Giulia! Sabato riesci a coprire il turno delle 9?', isRead: false }, 20),
    doc('messages', 'm2', { conversationId: [ME, 'u_sara'].sort().join('_'), senderId: ME, receiverId: 'u_sara', content: 'Perfetto, ci vediamo al corso BLSD.', isRead: true }, 60 * 5),
];

export const collections = {
    profiles,
    posts,
    jobs,
    notifications,
    endorsements,
    connections,
    messages,
    likes: [],
    comments: [
        doc('comments', 'c1', { postId: 'p1', authorId: 'u_marco', content: 'Confermo, ci porto il gruppo master il giovedì: corsie larghe e acqua sempre a temperatura.', likesCount: 3 }, 20),
        doc('comments', 'c2', { postId: 'p1', authorId: 'u_sara', content: 'Io la faccio con le pinne corte: ottima per la gambata.', likesCount: 1 }, 12),
        doc('comments', 'c3', { postId: 'p1', authorId: 'u_marco', content: 'Ottima idea, la proviamo giovedì.', parentCommentId: 'c2' }, 8),
    ],
    applications,
    facilities: [],
    live_rooms: [
        doc('live_rooms', 'r1', { title: 'Didattica in vasca piccola: giochi per i 4-5 anni', hostId: 'u_elena', status: 'active', speakers: ['u_elena', 'u_sara'], listeners: ['u_marco', 'u_luca'], startedAt: iso(15) }, 15),
    ],
    live_messages: [
        doc('live_messages', 'lm1', { roomId: 'r1', authorId: 'u_elena', content: 'Benvenuti! Oggi parliamo dei giochi per l\'acquaticità dei 4-5 anni.', kind: 'message' }, 14),
        doc('live_messages', 'lm2', { roomId: 'r1', authorId: 'u_marco', content: 'Come gestite i bambini che hanno paura di mettere la testa sott\'acqua?', kind: 'question' }, 10),
        doc('live_messages', 'lm3', { roomId: 'r1', authorId: 'u_luca', content: '✋', kind: 'hand' }, 6),
    ],
    reviews: [
        doc('reviews', 'r1', { structureId: 'u_lido', authorId: 'u_paolo', rating: 5, content: 'Vasca da 50 sempre ben organizzata per corsie di velocità, acqua pulita e personale gentile. Il martedì sera c’è un bel gruppo master.', visitedAt: '2026-09', status: 'published', reply: 'Grazie Paolo, ci vediamo in vasca!', replyAt: iso(60 * 20) }, 60 * 24 * 3),
        doc('reviews', 'r2', { structureId: 'u_lido', authorId: 'u_sara', rating: 4, content: 'Ottimi corsi di acquafitness, spogliatoi un po’ affollati nelle ore di punta.', status: 'published' }, 60 * 24 * 9),
        doc('reviews', 'r3', { structureId: 'u_lido', authorId: 'u_marco', rating: 4, content: 'Ci alleno il gruppo master da due stagioni: orari comodi e corsie dedicate.', status: 'published' }, 60 * 24 * 20),
    ],
    saves: [doc('saves', 's1', { userId: ME, targetType: 'post', targetId: 'p1' }), doc('saves', 's2', { userId: ME, targetType: 'job', targetId: 'j2' })],
    swim_meets,
    groups,
    group_members,
    announcements: [],
    shifts: [],
};

/** Risposte della Function `api` per azione (le altre restituiscono un oggetto vuoto). */
export const apiResponses = {
    publicJob: () => ({
        id: 'j1', title: 'Assistente bagnanti turni serali', role: 'assistente bagnanti', contractType: 'part-time', city: 'Milano', province: 'MI',
        description: 'Cerchiamo due assistenti bagnanti per i turni serali (18–22) nella vasca coperta da 25 metri, da novembre a maggio.\nAmbiente giovane, turni concordati con anticipo.',
        salaryMin: 900, salaryMax: 1100, workingHours: 'Lun–ven 18:00–22:00', requirements: ['Disponibilità serale', 'Esperienza in impianti coperti'],
        qualifications: ['Brevetto Assistente Bagnanti FIN', 'BLSD'], isSOS: false, sosDate: '', sosShift: '', structureId: 'u_lido', structureName: 'Piscina Lido di Milano',
        structureLogo: '', postedAt: new Date(now - 86400000).toISOString(), expiresAt: new Date(now + 29 * 86400000).toISOString().slice(0, 10),
    }),
    listRecommendations: ({ profileId } = {}) => {
        const sara = { $id: 'u_sara', name: 'Sara Colombo', avatar: '', headline: 'Assistente bagnanti e istruttrice aquagym' };
        const lido = { $id: 'u_lido', name: 'Piscina Lido di Milano', avatar: '', headline: 'Piscina comunale' };
        const published = { $id: 'rc1', $createdAt: new Date(now - 20 * 86400000).toISOString(), profileId, authorId: 'u_sara', relationship: 'collega', status: 'published', author: sara,
            content: 'Abbiamo lavorato insieme due stagioni al Lido: sempre puntuale, attentissima alla sicurezza in vasca e capace di tenere un gruppo di bambini di cinque anni come pochi. Quando c’è da coprire un turno all’ultimo momento è la prima a rispondere.' };
        const pending = { $id: 'rc2', $createdAt: new Date(now - 86400000).toISOString(), profileId, authorId: 'u_lido', relationship: 'struttura', status: 'pending', author: lido,
            content: 'Giulia ha seguito i corsi di acquaticità del sabato per tutto l’anno: genitori soddisfatti, iscrizioni in crescita e zero problemi di organizzazione.' };
        // Sul profilo di Marco: la referenza scritta da Giulia, in attesa (la vede solo come stato, senza Pubblica).
        const mine = { $id: 'rc3', $createdAt: new Date(now - 3600000).toISOString(), profileId, authorId: ME, relationship: 'collega', status: 'pending', author: { $id: ME, name: 'Giulia Ferri', avatar: '', headline: 'Istruttrice FIN di nuoto e acquaticità' },
            content: 'Marco prepara gli allenamenti master con una cura rara: serie chiare, obiettivi per ognuno e sempre un occhio alla tecnica.' };
        return profileId === ME ? [pending, published] : profileId === 'u_marco' ? [published, mine] : [published];
    },
    listJobAlerts: () => [
        { $id: 'al1', $createdAt: new Date(now - 3 * 86400000).toISOString(), userId: ME, query: 'istruttore', province: 'MI', contractType: '', sosOnly: false },
        { $id: 'al2', $createdAt: new Date(now - 9 * 86400000).toISOString(), userId: ME, query: '', province: 'MB', contractType: '', sosOnly: true },
    ],
    getTrends: () => [{ tag: 'master', posts: 8 }, { tag: 'salvamento', posts: 5 }, { tag: 'scuolanuoto', posts: 4 }, { tag: 'soglia', posts: 2 }],
    getBillingStatus: () => ({ premium: false, premiumUntil: null, source: null, trialAvailable: true, trialDays: 30, audience: 'person', prices: { month: 499, year: 4790 }, providers: { stripe: true, paypal: true }, inmailCredits: 0, subscription: null }),
    adminOverview: () => ({ people: 1284, structures: 96, posts: 5310, openReports: 2, errors24h: 0, pendingCerts: 3 }),
    adminGetPlans: () => {
        const plan = (audience, period, amount, defaultAmount, subscribers) => ({ key: `${audience}_${period}`, audience, period, amount, defaultAmount, updatedAt: amount !== defaultAmount ? new Date(now - 3 * 86400000).toISOString() : null, subscribers, stripe: true, paypal: true });
        return {
            plans: [plan('person', 'month', 499, 499, 41), plan('person', 'year', 4790, 4790, 18), plan('enthusiast', 'month', 199, 199, 23), plan('enthusiast', 'year', 1900, 1900, 7), plan('structure', 'month', 1490, 1900, 12), plan('structure', 'year', 14900, 17900, 9)],
            providers: { stripe: true, paypal: true },
            limits: { min: 99, max: 99900 },
        };
    },
    adminUpdatePlans: ({ prices = {} } = {}) => {
        const d = apiResponses.adminGetPlans();
        return { ...d, plans: d.plans.map((p) => (p.key in prices ? { ...p, amount: prices[p.key], updatedAt: new Date().toISOString() } : p)), changed: Object.keys(prices), warnings: [] };
    },
    listStructureJobs: () => collections.jobs.filter((j) => ['j1', 'j4'].includes(j.$id)).map((j) => ({
        ...j,
        applications: j.$id === 'j1' ? { total: 3, pending: 2, reviewed: 1, accepted: 0, hired: 0, rejected: 0 } : { total: 4, pending: 0, reviewed: 1, accepted: 0, hired: 1, rejected: 2 },
    })),
    updateApplicationStatus: ({ applicationId, status } = {}) => ({ ...collections.applications.find((a) => a.$id === applicationId), status }),
    listMyStaffInvites: () => [{ structureId: 'u_aquae', name: 'Aquae Sport Center', logo: '', city: 'Sesto San Giovanni', invitedAt: new Date(now - 3 * 3600000).toISOString() }],
    getMyResume: () => null,
    setMyResume: ({ fileId }) => ({ fileId, name: 'Giulia Ferri CV.pdf', size: 184000, updatedAt: new Date().toISOString() }),
    deleteMyResume: () => ({ deleted: true }),
    listMyTeams: () => [
        { structureId: 'u_lido', name: 'Piscina Lido di Milano', logo: '', city: 'Milano', role: 'staff' },
        { structureId: 'u_rozzano', name: 'Centro Nuoto Rozzano', logo: '', city: 'Rozzano', role: 'staff' },
    ],
    getMyStats: () => ({
        viewsLast30: 64,
        viewsPerDay: Array.from({ length: 30 }, (_, i) => ({ day: new Date(now - (29 - i) * 86400000).toISOString().slice(0, 10), views: [1, 2, 0, 3, 2, 4, 1, 2, 5, 3, 1, 0, 2, 3, 6, 2, 1, 3, 2, 4, 2, 1, 3, 2, 1, 0, 2, 3, 2, 1][i] })),
        viewersByKind: { strutture: 21, professionisti: 30, appassionati: 9 },
        anonymousViews: 4,
        posts: [
            { id: 'p1', createdAt: iso(45), text: 'Serie della settimana per il gruppo #master: 10x100 stile libero partenza 1’40”, con gli ultimi 25 in apnea controllata. Grazie a @Sara Colombo per l’idea!', reactions: 24, comments: 6, reposts: 2 },
            { id: 'p2', createdAt: iso(60 * 24 * 3), text: '@[Marco Bellini](u_marco) ci vediamo sabato al Lido per il corso BLSD?', reactions: 9, comments: 3, reposts: 0 },
            { id: 'p3', createdAt: iso(60 * 24 * 8), text: '', reactions: 15, comments: 1, reposts: 1 },
        ],
        totals: { reactions: 48, comments: 10, reposts: 3 },
    }),
    listProfileViews: () => ({
        premium: false, locked: 5,
        total: 7,
        viewers: [
            { id: 'u_lido', name: 'Piscina Lido di Milano', headline: 'Piscina comunale', avatar: '', viewedAt: new Date(now - 2 * 3600000).toISOString() },
            { id: null, name: 'Utente di SwimIn', headline: 'Ha scelto di navigare in modo anonimo', avatar: '', viewedAt: new Date(now - 26 * 3600000).toISOString() },
        ],
    }),
    listBlockRelations: () => ({ blocked: [], muted: [], blockedBy: [], isAdmin: false }),
    getContactInfo: () => ({ phone: '+39 333 123 4567', email: 'giulia@example.com', allowed: true }),
    getTeamBoard: () => ({
        role: 'staff', announcements: [], shifts: [], chatUnread: 2,
        members: [
            { $id: ME, userId: ME, firstName: 'Giulia', lastName: 'Ferri', title: 'Istruttrice FIN di nuoto e acquaticità', avatar: '', city: 'Milano', isOnline: true, certificationsList: [JSON.stringify({ name: 'Istruttore di nuoto 1° livello', issuer: 'FIN', category: 'istruttore', expiry: '2027-09-30' })] },
            { $id: 'u_sara', userId: 'u_sara', firstName: 'Sara', lastName: 'Colombo', title: 'Assistente bagnanti', avatar: '', city: 'Milano', isOnline: false, certificationsList: [JSON.stringify({ name: 'Brevetto assistente bagnanti', issuer: 'FIN', category: 'salvamento', expiry: new Date(now + 12 * 86400000).toISOString().slice(0, 10) })] },
        ],
    }),
    listStaffMessages: ({ after } = {}) => (after ? { messages: [], hasMore: false } : {
        hasMore: false,
        members: [
            { $id: 'u_lido', name: 'Piscina Lido di Milano', avatar: '', role: 'admin' },
            { $id: ME, name: 'Giulia Ferri', avatar: '', role: 'staff' },
            { $id: 'u_sara', name: 'Sara Colombo', avatar: '', role: 'staff' },
        ],
        messages: [
            { $id: 'sm1', $createdAt: iso(60 * 20), structureId: 'u_lido', authorId: 'u_lido', content: 'Domani la vasca coperta apre alle 10 per la manutenzione del filtro: spostate i corsi delle 8 in vasca olimpionica.' },
            { $id: 'sm2', $createdAt: iso(60 * 19), structureId: 'u_lido', authorId: 'u_sara', content: 'Ricevuto, avviso i genitori del corso bambini.' },
            { $id: 'sm3', $createdAt: iso(30), structureId: 'u_lido', authorId: ME, content: 'Io copro il turno delle 14 al posto di Luca.' },
            { $id: 'sm4', $createdAt: iso(12), structureId: 'u_lido', authorId: 'u_lido', content: 'Grazie Giulia!' },
        ],
    }),
    listMyShifts: () => {
        const day = (n) => new Date(now + n * 86400000).toISOString().slice(0, 10);
        return [
            { $id: 'sh1', structureId: 'u_lido', structureName: 'Piscina Lido di Milano', userId: ME, userName: 'Giulia Ferri', date: day(1), shiftTime: '07:00–13:00', role: 'Assistente bagnante', status: 'scheduled' },
            { $id: 'sh2', structureId: 'u_lido', structureName: 'Piscina Lido di Milano', userId: ME, userName: 'Giulia Ferri', date: day(3), shiftTime: '16:00–20:00', role: 'Istruttrice', status: 'confirmed' },
            { $id: 'sh3', structureId: 'u_rozzano', structureName: 'Centro Nuoto Rozzano', userId: ME, userName: 'Giulia Ferri', date: day(1), shiftTime: '12:30–15:00', role: 'Istruttrice', status: 'confirmed' },
            { $id: 'sh4', structureId: 'u_rozzano', structureName: 'Centro Nuoto Rozzano', userId: ME, userName: 'Giulia Ferri', date: day(5), shiftTime: '09:00–12:00', role: 'Assistente bagnante', status: 'scheduled' },
        ];
    },
    publicProfile: () => ({
        kind: 'person', id: ME, name: 'Giulia Ferri', headline: 'Istruttrice di nuoto FIN e assistente bagnante', city: 'Milano', province: 'MI',
        avatar: '', cover: '', bio: 'Insegno ai bambini dai 4 anni e alleno la preagonistica. Brevetto di salvamento sempre aggiornato.',
        skills: ['Scuola nuoto bambini', 'Preagonistica', 'Salvamento'], languages: ['Italiano', 'Inglese'], connections: 48,
        experiences: [{ title: 'Istruttrice di nuoto', company: 'Piscina Lido di Milano', startDate: '2021-09', endDate: '', current: true }],
        certifications: [{ name: 'Istruttore di nuoto 2° livello', issuer: 'FIN – Federazione Italiana Nuoto', category: 'istruzione', verified: true }, { name: 'Brevetto Assistente Bagnanti', issuer: 'Società Nazionale di Salvamento', category: 'salvamento', verified: false }],
    }),
    getPushConfig: () => ({
        publicKey: 'BExampleVapidKeyForScreenshotsOnly',
        emailAvailable: true,
        devices: 1,
        prefs: {
            messages: { push: true, email: true }, connections: { push: true, email: false }, social: { push: true, email: false },
            jobs: { push: true, email: true }, sos: { push: true, email: false }, general: { push: true, email: false }, digest: { push: false, email: true },
        },
        categories: ['messages', 'connections', 'social', 'jobs', 'sos', 'general', 'digest'],
    }),
};
