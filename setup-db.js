/**
 * Configura il progetto Appwrite di SwimWaveUp: database, collezioni, indici,
 * bucket e la Function "api". Si può rilanciare quante volte vuoi: crea ciò
 * che manca e riallinea i permessi di ciò che esiste già.
 *
 * Uso:  npm run setup-db            (schema + deploy della Function)
 *       npm run setup-db -- --skip-function
 *
 * Usa l'API TablesDB (Appwrite 1.8+): tabelle, colonne e righe sono i nuovi
 * nomi di collezioni, attributi e documenti. I dati restano accessibili anche
 * dall'API "Databases" usata dal frontend.
 *
 * Richiede .env.setup (vedi .env.setup.example) con una API key che abbia
 * gli scope: databases.*, tables.*, columns.*, indexes.*, rows.*,
 * buckets.*, files.*, functions.*.
 */
import dotenv from 'dotenv';
import { assertNodeAppwriteVersion } from './scripts/check-sdk.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Functions, Permission, Role, Storage, TablesDB, TablesDBIndexType } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';

dotenv.config({ path: '.env.setup' });
assertNodeAppwriteVersion();

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    console.error('❌ Mancano le credenziali in .env.setup (APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY)');
    process.exit(1);
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);
const functions = new Functions(client);

const DB_ID = 'swimwaveup_db';
const FUNCTION_ID = 'api';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// PERMESSI
// A livello di collezione diamo solo lettura e creazione. Modifiche e
// cancellazioni sono decise documento per documento (documentSecurity):
// chi crea un documento ne è il proprietario. Le collezioni senza "create"
// sono scritte solo dalla Function "api", che verifica chi sta chiamando.
// ---------------------------------------------------------------------------
const READ_CREATE = [Permission.read(Role.users()), Permission.create(Role.users())];
const READ_ONLY = [Permission.read(Role.users())];
const SERVER_ONLY = []; // lettura solo tramite permessi sul singolo documento

const str = (key, size, opts = {}) => ({ type: 'string', key, size, ...opts });
const int = (key, opts = {}) => ({ type: 'integer', key, ...opts });
const bool = (key, opts = {}) => ({ type: 'boolean', key, ...opts });
const idx = (key, columns, type = TablesDBIndexType.Key) => ({ key, columns, type });

const schema = [
    {
        id: 'profiles', name: 'Profiles', permissions: READ_CREATE,
        attributes: [
            str('userId', 36, { required: true }),
            str('userType', 50, { required: true }),
            str('email', 255, { required: true }),
            str('firstName', 255), str('lastName', 255), str('structureName', 255),
            str('title', 255), str('structureType', 255), str('bio', 2500),
            str('avatar', 2048), str('logo', 2048), str('cover', 2048), str('city', 255), str('province', 10),
            str('typingTo', 36), bool('readReceipts', { default: true }),
            str('experienceList', 2500, { array: true }), str('certificationsList', 2500, { array: true }),
            str('connections', 36, { array: true }),
            bool('isOnline', { default: false }), str('lastActive', 100),
            bool('availableForEmergencies', { default: false }),
            str('managedFacilities', 36, { array: true }),
        ],
        indexes: [idx('by_user', ['userId']), idx('by_type', ['userType'])],
    },
    {
        id: 'posts', name: 'Posts', permissions: READ_CREATE,
        attributes: [
            str('authorId', 36, { required: true }), str('authorType', 50, { required: true }),
            str('content', 4000, { required: true }), str('postType', 50, { required: true }),
            str('visibility', 50, { required: true }), str('category', 100),
            str('media', 1000, { array: true }), // ogni elemento: JSON {type,url,alt}
            str('editedAt', 100), // data dell'ultima modifica del testo (non dei contatori)
            int('likesCount', { default: 0 }), int('commentsCount', { default: 0 }),
        ],
        indexes: [idx('by_author', ['authorId'])],
    },
    {
        id: 'comments', name: 'Comments', permissions: READ_ONLY,
        attributes: [
            str('postId', 36, { required: true }), str('authorId', 36, { required: true }),
            str('content', 2000, { required: true }), str('parentCommentId', 36),
        ],
        indexes: [idx('by_post', ['postId'])],
    },
    {
        id: 'likes', name: 'Likes', permissions: READ_ONLY,
        attributes: [str('postId', 36, { required: true }), str('userId', 36, { required: true })],
        indexes: [idx('by_post', ['postId']), idx('by_user', ['userId']), idx('by_post_user', ['postId', 'userId'])],
    },
    {
        id: 'jobs', name: 'Jobs', permissions: READ_CREATE,
        attributes: [
            str('structureId', 36, { required: true }), str('title', 255, { required: true }),
            str('description', 4000, { required: true }), str('role', 100, { required: true }),
            str('contractType', 100), str('city', 255, { required: true }), str('province', 10),
            int('salaryMin'), int('salaryMax'), str('workingHours', 255),
            bool('isActive', { default: true }), str('structureName', 255), str('facilityLogo', 2048),
            str('candidates', 36, { array: true }), str('requirements', 500, { array: true }),
            str('qualificationsRequired', 500, { array: true }),
            bool('isSOS', { default: false }), str('sosDate', 100), str('sosShift', 100),
        ],
        indexes: [idx('by_active', ['isActive']), idx('by_structure', ['structureId'])],
    },
    {
        id: 'applications', name: 'Applications', permissions: SERVER_ONLY,
        attributes: [
            str('jobId', 36, { required: true }), str('applicantId', 36, { required: true }),
            str('status', 50, { required: true }), str('coverLetter', 3000),
        ],
        indexes: [idx('by_job', ['jobId']), idx('by_applicant', ['applicantId'])],
    },
    {
        id: 'connections', name: 'Connections', permissions: SERVER_ONLY,
        attributes: [
            str('senderId', 36, { required: true }), str('receiverId', 36, { required: true }),
            str('status', 50, { required: true }),
        ],
        indexes: [idx('by_receiver_status', ['receiverId', 'status']), idx('by_sender', ['senderId'])],
    },
    {
        id: 'messages', name: 'Messages', permissions: SERVER_ONLY,
        attributes: [
            str('conversationId', 100, { required: true }), str('senderId', 36, { required: true }),
            str('receiverId', 36, { required: true }), str('content', 4000, { required: true }),
            bool('isRead', { default: false }),
        ],
        indexes: [idx('by_conversation', ['conversationId']), idx('by_receiver_read', ['receiverId', 'isRead'])],
    },
    {
        id: 'announcements', name: 'Announcements', permissions: READ_CREATE,
        attributes: [
            str('structureId', 36, { required: true }), str('content', 4000, { required: true }),
            bool('isImportant', { default: false }), str('readBy', 36, { array: true }),
        ],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        id: 'shifts', name: 'Shifts', permissions: READ_CREATE,
        attributes: [
            str('structureId', 36, { required: true }), str('userId', 36, { required: true }),
            str('userName', 255, { required: true }), str('date', 100, { required: true }),
            str('shiftTime', 100, { required: true }), str('role', 100, { required: true }),
            str('status', 50, { required: true }),
        ],
        indexes: [idx('by_structure', ['structureId'])],
    },
    {
        id: 'facilities', name: 'Facilities', permissions: READ_CREATE,
        attributes: [
            str('name', 255, { required: true }), str('type', 255), str('city', 255, { required: true }),
            str('province', 10), str('bio', 2500), str('logo', 2048), str('cover', 2048),
            str('admins', 36, { array: true }), str('staff', 36, { array: true }), str('followers', 36, { array: true }),
        ],
        indexes: [],
    },
    {
        id: 'notifications', name: 'Notifications', permissions: SERVER_ONLY,
        attributes: [
            str('userId', 36, { required: true }), str('type', 50, { required: true }),
            str('content', 255, { required: true }), str('relatedId', 36), bool('isRead', { default: false }),
        ],
        indexes: [idx('by_user_read', ['userId', 'isRead'])],
    },
    {
        id: 'live_rooms', name: 'Live Rooms', permissions: READ_CREATE,
        attributes: [
            str('title', 255, { required: true }), str('description', 1000), str('hostId', 36, { required: true }),
            str('facilityId', 36), str('status', 50, { required: true }),
            str('speakers', 36, { array: true }), str('listeners', 36, { array: true }),
            str('startedAt', 100, { required: true }),
        ],
        indexes: [idx('by_status', ['status'])],
    },
    {
        id: 'swim_meets', name: 'Swim Meets', permissions: READ_CREATE,
        attributes: [
            str('title', 255, { required: true }), str('description', 4000, { required: true }),
            str('date', 100, { required: true }), str('time', 100, { required: true }),
            str('city', 255, { required: true }), str('address', 500), str('creatorId', 36, { required: true }),
            str('participants', 36, { array: true }), int('maxParticipants'), str('status', 50, { required: true }),
        ],
        indexes: [idx('by_status', ['status'])],
    },
];

// Avatar e media dei post sono pubblici in lettura (vengono mostrati con <img>
// senza sessione); solo il proprietario del file può modificarlo o cancellarlo.
const buckets = [
    { id: 'avatars', name: 'Avatars', maxSizeMB: 5 },
    { id: 'post_media', name: 'Post Media', maxSizeMB: 50 },
];
const BUCKET_PERMISSIONS = [Permission.read(Role.any()), Permission.create(Role.users())];

// ---------------------------------------------------------------------------

const exists = (e) => e?.code === 409;

/**
 * Le stringhe brevi (≤ 255) diventano `varchar`, indicizzabili e salvate nella
 * riga; quelle lunghe e gli array diventano `text`, salvati fuori riga, così
 * non si supera il limite di dimensione di una riga MariaDB (~64 KB).
 */
async function createColumn(tableId, a) {
    const base = { databaseId: DB_ID, tableId, key: a.key, required: !!a.required, array: !!a.array };
    // Appwrite non accetta un default sulle colonne obbligatorie o array.
    const xdefault = a.required || a.array ? undefined : a.default;
    if (a.type === 'string') {
        return a.size <= 255 && !a.array
            ? tablesDB.createVarcharColumn({ ...base, size: a.size, xdefault })
            : tablesDB.createTextColumn({ ...base, xdefault });
    }
    if (a.type === 'integer') return tablesDB.createIntegerColumn({ ...base, min: 0, max: 1_000_000_000, xdefault });
    if (a.type === 'boolean') return tablesDB.createBooleanColumn({ ...base, xdefault });
    throw new Error(`Tipo colonna sconosciuto: ${a.type}`);
}

/** Le colonne vengono create in modo asincrono: gli indici richiedono che siano pronte. */
async function waitForColumns(tableId) {
    for (let i = 0; i < 90; i++) {
        const { columns } = await tablesDB.listColumns({ databaseId: DB_ID, tableId });
        const failed = columns.filter((c) => c.status === 'failed');
        if (failed.length) {
            throw new Error(`Colonne fallite in ${tableId}: ${failed.map((c) => `${c.key} (${c.error || 'errore'})`).join(', ')}`);
        }
        if (columns.every((c) => c.status === 'available')) return;
        await sleep(1000);
    }
    throw new Error(`Timeout in attesa delle colonne di ${tableId}`);
}

async function setupDatabase() {
    try {
        await tablesDB.create({ databaseId: DB_ID, name: 'SwimWaveUp DB' });
        console.log('✅ Database creato');
    } catch (e) {
        if (!exists(e)) throw e;
        console.log('⏩ Database già esistente');
    }

    for (const table of schema) {
        const tableArgs = {
            databaseId: DB_ID, tableId: table.id, name: table.name,
            permissions: table.permissions, rowSecurity: true,
        };
        try {
            await tablesDB.createTable(tableArgs);
            console.log(`\n✅ Tabella creata: ${table.name}`);
        } catch (e) {
            if (!exists(e)) throw e;
            await tablesDB.updateTable(tableArgs);
            console.log(`\n🔒 Tabella ${table.name}: permessi riallineati`);
        }

        for (const column of table.attributes) {
            try {
                await createColumn(table.id, column);
                console.log(`   ➕ ${column.key}`);
            } catch (e) {
                if (!exists(e)) throw new Error(`Colonna ${table.id}.${column.key}: ${e.message}`);
            }
        }

        // Aspettiamo sempre: così un errore su una colonna emerge subito.
        await waitForColumns(table.id);
        for (const index of table.indexes) {
            try {
                await tablesDB.createIndex({ databaseId: DB_ID, tableId: table.id, ...index });
                console.log(`   🔎 indice ${index.key}`);
            } catch (e) {
                if (!exists(e)) throw new Error(`Indice ${table.id}.${index.key}: ${e.message}`);
            }
        }
    }
}

async function setupBuckets() {
    console.log('\n🗂️  Storage');
    for (const b of buckets) {
        const args = {
            bucketId: b.id, name: b.name, permissions: BUCKET_PERMISSIONS, fileSecurity: true,
            enabled: true, maximumFileSize: b.maxSizeMB * 1024 * 1024,
            allowedFileExtensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'],
        };
        try {
            await storage.createBucket(args);
            console.log(`   ✅ Bucket creato: ${b.name}`);
        } catch (e) {
            if (!exists(e)) throw e;
            await storage.updateBucket(args);
            console.log(`   🔒 Bucket ${b.name}: permessi riallineati`);
        }
    }
}

async function deployFunction() {
    console.log('\n⚙️  Function "api"');
    const settings = {
        functionId: FUNCTION_ID,
        name: 'SwimWaveUp API',
        runtime: process.env.APPWRITE_FUNCTION_RUNTIME || 'node-22',
        execute: ['users'], // solo utenti loggati
        timeout: 15,
        entrypoint: 'src/main.js',
        commands: 'npm install --omit=dev',
        scopes: ['databases.read', 'tables.read', 'rows.read', 'rows.write'],
        logging: true,
        enabled: true,
    };
    try {
        await functions.create(settings);
        console.log('   ✅ Function creata');
    } catch (e) {
        if (!exists(e)) throw e;
        await functions.update(settings);
        console.log('   🔄 Impostazioni aggiornate');
    }

    // Impacchetta functions/api (senza node_modules) e la carica come nuova versione.
    const tmp = mkdtempSync(path.join(tmpdir(), 'swimwaveup-'));
    const archive = path.join(tmp, 'api.tar.gz');
    try {
        execFileSync('tar', ['-czf', archive, '--exclude=node_modules', '-C', path.join(ROOT, 'functions', 'api'), '.']);
        const deployment = await functions.createDeployment({
            functionId: FUNCTION_ID,
            code: InputFile.fromPath(archive, 'api.tar.gz'),
            activate: true,
            entrypoint: settings.entrypoint,
            commands: settings.commands,
        });
        console.log(`   🚀 Deploy avviato (${deployment.$id}). Lo stato della build è visibile in Console → Functions.`);
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

async function main() {
    console.log('🚀 Configurazione Appwrite per SwimWaveUp…');
    await setupDatabase();
    await setupBuckets();
    if (!process.argv.includes('--skip-function')) await deployFunction();
    console.log('\n🎉 Setup completato.');
}

main().catch((e) => {
    console.error('\n❌ Setup interrotto:', e.message);
    process.exit(1);
});
