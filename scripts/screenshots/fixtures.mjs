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

const exp = (role, facility, period, description) => JSON.stringify({ role, facility, period, description });
const cert = (name, issuer, category, expiry) => JSON.stringify({ name, issuer, category, expiry });

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
        skills: ['Scuola nuoto bambini', 'Acquaticità neonatale', 'Nuoto agonistico', 'Primo soccorso BLSD'],
        experienceList: [
            exp('Istruttrice di nuoto', 'Piscina Lido di Milano', '2021 – oggi', 'Corsi bambini 4-10 anni e preagonistica.'),
            exp('Assistente bagnante', 'Centro Sportivo Saini', '2017 – 2021', 'Sorveglianza vasca olimpionica, turni estivi.'),
        ],
        certificationsList: [
            cert('Istruttore di nuoto 2° livello', 'FIN – Federazione Italiana Nuoto', 'Didattica', '2027-06-30'),
            cert('Brevetto Assistente Bagnanti', 'Società Nazionale di Salvamento', 'Salvamento', new Date(now + 20 * 86400000).toISOString().slice(0, 10)),
            cert('BLSD esecutore', 'IRC', 'Primo soccorso', '2026-03-01'),
        ],
        managedFacilities: [],
    }, 60 * 24 * 90),
    doc('profiles', 'u_marco', {
        userId: 'u_marco', userType: 'professional', email: 'marco@example.com', firstName: 'Marco', lastName: 'Bellini',
        title: 'Allenatore squadra master', city: 'Monza', province: 'MB', isOnline: true, connections: [ME],
        skills: ['Nuoto master', 'Preparazione atletica a secco'],
    }),
    doc('profiles', 'u_sara', {
        userId: 'u_sara', userType: 'professional', email: 'sara@example.com', firstName: 'Sara', lastName: 'Colombo',
        title: 'Assistente bagnanti e istruttrice aquagym', city: 'Milano', province: 'MI', connections: [ME],
    }),
    doc('profiles', 'u_luca', {
        userId: 'u_luca', userType: 'professional', email: 'luca@example.com', firstName: 'Luca', lastName: 'Rinaldi',
        title: 'Allenatore pallanuoto under 16', city: 'Bergamo', province: 'BG', connections: [],
    }),
    doc('profiles', 'u_elena', {
        userId: 'u_elena', userType: 'professional', email: 'elena@example.com', firstName: 'Elena', lastName: 'Marchi',
        title: 'Coordinatrice scuola nuoto', city: 'Milano', province: 'MI', connections: [],
    }),
    doc('profiles', 'u_lido', {
        userId: 'u_lido', userType: 'structure', email: 'info@lido.example', structureName: 'Piscina Lido di Milano',
        structureType: 'Piscina comunale', city: 'Milano', province: 'MI', connections: [ME],
        bio: 'Vasca olimpionica scoperta, vasca coperta da 25 m e vasca didattica. Corsi per tutte le età.',
    }),
    doc('profiles', 'u_aquae', {
        userId: 'u_aquae', userType: 'structure', email: 'staff@aquae.example', structureName: 'Aquae Sport Center',
        structureType: 'Centro sportivo', city: 'Sesto San Giovanni', province: 'MI', connections: [],
    }),
];

const posts = [
    doc('posts', 'p1', {
        authorId: 'u_marco', authorType: 'professional', postType: 'text', visibility: 'public', category: 'allenamento',
        content: 'Serie della settimana per il gruppo master: 10x100 stile libero partenza 1\'40", con gli ultimi 25 in apnea controllata. Chi vuole la versione per principianti mi scriva.\n\nFeedback sulle vostre serie di soglia?',
        likesCount: 24, commentsCount: 6, media: [],
    }, 45),
    doc('posts', 'p2', {
        authorId: 'u_lido', authorType: 'structure', postType: 'text', visibility: 'public', category: 'normative',
        content: 'Dal 1° novembre riapre la vasca coperta da 25 metri dopo la sostituzione dell\'impianto di trattamento acqua. Stiamo cercando due assistenti bagnanti per i turni serali: trovate l\'annuncio nella bacheca lavoro.',
        likesCount: 41, commentsCount: 3, media: [],
    }, 180),
    doc('posts', 'p3', {
        authorId: 'u_sara', authorType: 'professional', postType: 'text', visibility: 'public', category: 'tecnica',
        content: 'Ho finalmente rinnovato il brevetto BLSD. Promemoria per tutti i colleghi: controllate le scadenze prima dell\'estate, i corsi si riempiono in fretta.',
        likesCount: 12, commentsCount: 2, media: [],
    }, 60 * 26),
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
    comments: [],
    applications: [],
    facilities: [],
    live_rooms: [
        doc('live_rooms', 'r1', { title: 'Didattica in vasca piccola: giochi per i 4-5 anni', hostId: 'u_elena', status: 'active', speakers: ['u_elena', 'u_sara'], listeners: ['u_marco', 'u_luca'], startedAt: iso(15) }, 15),
    ],
    live_messages: [
        doc('live_messages', 'lm1', { roomId: 'r1', authorId: 'u_elena', content: 'Benvenuti! Oggi parliamo dei giochi per l\'acquaticità dei 4-5 anni.', kind: 'message' }, 14),
        doc('live_messages', 'lm2', { roomId: 'r1', authorId: 'u_marco', content: 'Come gestite i bambini che hanno paura di mettere la testa sott\'acqua?', kind: 'question' }, 10),
        doc('live_messages', 'lm3', { roomId: 'r1', authorId: 'u_luca', content: '✋', kind: 'hand' }, 6),
    ],
    swim_meets: [],
    announcements: [],
    shifts: [],
};
