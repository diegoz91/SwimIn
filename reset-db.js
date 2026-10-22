/**
 * ⚠️  CANCELLA TUTTO: database, bucket, Function "api" e tutti gli utenti Auth.
 * Da usare solo sull'ambiente di test. Dopo il reset lancia `npm run setup-db`.
 *
 * Uso: npm run reset-db -- --yes
 */
import dotenv from 'dotenv';
import { assertNodeAppwriteVersion } from './scripts/check-sdk.js';
import { Client, Functions, Query, Storage, TablesDB, Users } from 'node-appwrite';

dotenv.config({ path: '.env.setup' });
assertNodeAppwriteVersion();

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
    console.error('❌ Mancano le credenziali in .env.setup');
    process.exit(1);
}
if (!process.argv.includes('--yes')) {
    console.error(`⚠️  Questo script cancella TUTTI i dati del progetto ${APPWRITE_PROJECT_ID}.`);
    console.error('   Per confermare lancia: npm run reset-db -- --yes');
    process.exit(1);
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
const tablesDB = new TablesDB(client);
const storage = new Storage(client);
const functions = new Functions(client);
const users = new Users(client);

const DB_ID = 'swimwaveup_db';
const BUCKETS = ['avatars', 'post_media'];
const FUNCTION_ID = 'api';

const ignore404 = (label) => (e) => {
    if (e?.code === 404) console.log(`⏩ ${label}: non presente`);
    else console.error(`❌ ${label}: ${e.message}`);
};

async function reset() {
    console.log('🧹 Reset di SwimWaveUp…');

    await tablesDB.delete({ databaseId: DB_ID }).then(() => console.log('✅ Database eliminato'), ignore404('Database'));

    for (const bucketId of BUCKETS) {
        await storage.deleteBucket({ bucketId }).then(() => console.log(`✅ Bucket ${bucketId} eliminato`), ignore404(`Bucket ${bucketId}`));
    }

    await functions.delete({ functionId: FUNCTION_ID }).then(() => console.log('✅ Function api eliminata'), ignore404('Function api'));

    // Gli utenti vanno eliminati a pagine: list() ne restituisce al massimo 100 per volta.
    let deleted = 0;
    for (;;) {
        const { users: page } = await users.list({ queries: [Query.limit(100)] });
        if (page.length === 0) break;
        for (const user of page) {
            await users.delete({ userId: user.$id });
            deleted++;
        }
    }
    console.log(`✅ Utenti Auth eliminati: ${deleted}`);

    console.log('\n🎉 Reset completato. Prossimo passo: npm run setup-db');
}

reset().catch((e) => {
    console.error('❌ Reset interrotto:', e.message);
    process.exit(1);
});
