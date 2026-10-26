/**
 * Test delle notifiche push ed email: cifratura Web Push (decifrata come farebbe
 * il browser), firma VAPID, preferenze e recapito dalle azioni della Function.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApi } from '../src/main.js';
import { encryptPayload, generateVapidKeys, vapidAuthorization } from '../src/webpush.js';
import { parsePrefs, targetUrl, emailHtml } from '../src/push.js';

/** Sottoscrizione come la crea il browser, con la chiave privata per decifrare. */
const browserSubscription = (endpoint = 'https://fcm.googleapis.com/fcm/send/abc') => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
};

/** Decifra un corpo aes128gcm lato "browser" (RFC 8291). */
const decrypt = (body, { ecdh, auth }) => {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]);
  assert.equal(plain[plain.length - 1], 2, 'delimitatore di ultimo record');
  return plain.subarray(0, plain.length - 1).toString();
};

test('cifratura Web Push e firma VAPID', () => {
  const b = browserSubscription();
  const body = encryptPayload(JSON.stringify({ title: 'Ciao', body: 'àèì' }), b.sub);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.deepEqual(JSON.parse(decrypt(body, b)), { title: 'Ciao', body: 'àèì' });

  const keys = generateVapidKeys();
  const header = vapidAuthorization(b.sub.endpoint, { ...keys, subject: 'mailto:a@b.it' }, 1_700_000_000_000);
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.exp, 1_700_000_000 + 12 * 3600);
  const pub = Buffer.from(keys.publicKey, 'base64url');
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('preferenze, destinazioni ed email', () => {
  const p = parsePrefs(JSON.stringify({ messages: { push: false }, social: { email: true } }));
  assert.deepEqual(p.messages, { push: false, email: false });
  assert.deepEqual(p.social, { push: true, email: true });
  assert.deepEqual(p.jobs, { push: true, email: true });
  assert.deepEqual(parsePrefs('rotto').connections, { push: true, email: true });
  assert.equal(targetUrl('like', 'p1'), '/post/p1');
  assert.equal(targetUrl('sos', 'j1'), '/jobs/j1');
  assert.equal(targetUrl('application', 'j1'), '/jobs/j1?candidati=nuove');
  assert.equal(targetUrl('message', 'anna'), '/messages?u=anna');
  const html = emailHtml({ title: '<b>', body: 'x & y', url: '/network', appUrl: 'https://swimin.it/' });
  assert.ok(html.includes('&lt;b&gt;') && html.includes('x &amp; y') && html.includes('https://swimin.it/network'));
});

test('recapito dalle azioni della Function', async () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) { const q = JSON.parse(raw); if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute])); if (q.method === 'limit') lim = q.values[0]; }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return d; },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  const sent = [];
  let nextStatus = 201;
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return { status: nextStatus }; };
  const emails = [];
  const messaging = { createEmail: async (m) => emails.push(m) };
  const api = createApi(db, { vapid: { ...generateVapidKeys(), subject: 'mailto:a@b.it' }, messaging, fetchImpl, appUrl: 'https://swimin.it' });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna', { province: 'MI', availability: ['sab-mattina'] }); P('bob', { province: 'MI', availability: ['sab-sera'], premiumUntil: new Date(Date.now() + 86400000).toISOString() });
  P('carla', { province: 'MI', availability: ['sab-mattina'], personType: 'enthusiast' }); P('dino', { province: 'TO', availability: ['sab-mattina'] });
  P('piscina', { userType: 'structure', structureName: 'Piscina Blu' });
  const rejects = async (p, status) => { try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); } };

  const cfg = await api.getPushConfig('anna');
  assert.ok(cfg.publicKey && cfg.emailAvailable && cfg.devices === 0);

  const a = browserSubscription('https://fcm.googleapis.com/fcm/send/anna');
  await rejects(api.savePushSubscription('anna', { ...a.sub, endpoint: 'http://insicuro.it/x' }), 400);
  await rejects(api.savePushSubscription('anna', { ...a.sub, p256dh: 'corta' }), 400);
  await api.savePushSubscription('anna', a.sub);
  await api.savePushSubscription('anna', a.sub); // stessa sottoscrizione: nessun doppione
  assert.equal(Object.keys(col('push_subscriptions')).length, 1);
  assert.deepEqual(Object.values(col('push_subscriptions'))[0].$permissions, []);

  // Messaggio: push con il nome del mittente, niente email (predefinito per i messaggi).
  await api.sendMessage('bob', { receiverId: 'anna', content: 'Ci sei sabato?' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(sent[0].init.headers.Authorization.startsWith('vapid t='));
  const payload = JSON.parse(decrypt(sent[0].init.body, a));
  assert.deepEqual([payload.title, payload.body, payload.url], ['bob', 'Ci sei sabato?', '/messages?u=bob']);
  assert.equal(emails.length, 0);

  // Silenziato: nessuna push.
  col('blocks').m1 = { $id: 'm1', blockerId: 'anna', blockedId: 'bob', kind: 'mute' };
  await api.sendMessage('bob', { receiverId: 'anna', content: 'ancora io' });
  assert.equal(sent.length, 1);
  delete col('blocks').m1;

  // Collegamento: push ed email (predefiniti).
  await api.sendConnectionRequest('bob', { receiverId: 'anna' });
  assert.equal(sent.length, 2);
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].users, ['anna']);
  assert.ok(emails[0].html && emails[0].content.includes('https://swimin.it/network'));

  // Preferenze: niente push per i collegamenti.
  await rejects(api.updateNotificationPrefs('anna', {}), 400);
  const prefs = await api.updateNotificationPrefs('anna', { prefs: { connections: { push: false, email: false } } });
  assert.deepEqual(prefs.connections, { push: false, email: false });
  assert.deepEqual(prefs.messages, { push: true, email: false });
  await api.sendConnectionRequest('dino', { receiverId: 'anna' });
  assert.equal(sent.length, 2);
  assert.equal(emails.length, 1);

  // Sottoscrizione scaduta (410): viene eliminata.
  nextStatus = 410;
  await rejects(api.sendTestPush('anna'), 409);
  assert.equal(Object.keys(col('push_subscriptions')).length, 0);
  nextStatus = 201;

  // SOS: avvisa solo i professionisti della provincia disponibili in quella fascia.
  const saturday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  const job = await api.createJob('piscina', { structureId: 'piscina', structureName: 'Piscina Blu', title: 'Assistente bagnante', description: 'Turno urgente in vasca grande', role: 'assistente_bagnanti', city: 'Milano', province: 'mi', isSOS: true, sosDate: saturday, sosShift: '08:00–12:00' });
  assert.equal(job.notified, 1);
  const sos = Object.values(col('notifications')).filter((n) => n.type === 'sos');
  assert.deepEqual(sos.map((n) => n.userId), ['anna']);
  assert.ok(sos[0].content.includes('Piscina Blu'));

  // Eliminazione dei dispositivi.
  await api.savePushSubscription('anna', a.sub);
  assert.deepEqual(await api.deletePushSubscription('bob', { endpoint: a.sub.endpoint }), { deleted: false });
  assert.deepEqual(await api.deletePushSubscription('anna', { endpoint: a.sub.endpoint }), { deleted: true });
});
