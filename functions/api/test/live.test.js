/** Test delle dirette video (LiveKit finto): token per ruolo, durata, OBS/Prism, palco, webhook. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApi } from '../src/main.js';
import { signLiveToken, verifyLiveToken, verifyLiveWebhook, LIVE_MINUTES } from '../src/live.js';

const SECRET = 'segreto-di-prova-abbastanza-lungo';
const KEY = 'APIprova';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) { const q = JSON.parse(raw); if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute])); if (q.method === 'limit') lim = q.values[0]; }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};

const rejects = async (p, status, code) => {
  try { await p; assert.fail('doveva fallire'); } catch (e) { assert.equal(e.status, status, e.message); if (code) assert.equal(e.code, code); }
};

test('token e firma dei webhook', () => {
  const t = signLiveToken(SECRET, { iss: KEY, sub: 'anna', exp: Math.floor(Date.now() / 1000) + 60 });
  assert.equal(verifyLiveToken(t, SECRET).sub, 'anna');
  assert.equal(verifyLiveToken(t, 'altro'), null);
  assert.equal(verifyLiveToken(signLiveToken(SECRET, { exp: 1 }), SECRET), null); // scaduto
  const body = '{"event":"room_finished"}';
  const sha256 = crypto.createHash('sha256').update(body).digest('base64');
  const auth = signLiveToken(SECRET, { iss: KEY, sha256, exp: Math.floor(Date.now() / 1000) + 60 });
  assert.ok(verifyLiveWebhook(body, auth, KEY, SECRET));
  assert.ok(!verifyLiveWebhook(body + ' ', auth, KEY, SECRET));
  assert.ok(!verifyLiveWebhook(body, auth, 'altra-chiave', SECRET));
});

test('dirette video: ruoli, durata, OBS/Prism, palco, chiusura', async () => {
  const { db, col } = makeDb();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    calls.push({ url, body, auth: init.headers?.Authorization });
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
    if (url.endsWith('.Ingress/CreateIngress')) return json(body.input_type === 'RTMP_INPUT' ? { ingress_id: 'IN_rtmp', url: 'rtmps://prova.rtmp.livekit.cloud/x', stream_key: 'chiave-segreta' } : { ingress_id: 'IN_whip', url: 'https://prova.whip.livekit.cloud/w', stream_key: 'token-whip' });
    return json({});
  };
  const users = { get: async () => ({ labels: [] }), delete: async () => {} };
  const api = createApi(db, { users, fetchImpl, live: { url: 'wss://prova.livekit.cloud', apiKey: KEY, apiSecret: SECRET } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('anna'); P('bob'); P('carla'); P('dario', { premiumUntil: new Date(Date.now() + 86400000).toISOString() });

  // Base: stanza video da 60 minuti.
  const room = await api.createLiveRoom('anna', { title: 'Corso di primo soccorso in vasca' });
  assert.equal(room.video, true);
  const minutes = Math.round((new Date(room.endsAt) - new Date(room.startedAt)) / 60000);
  assert.equal(minutes, LIVE_MINUTES.base);

  // Chi conduce pubblica; il pubblico solo guarda; chi non è entrato non riceve token.
  const host = await api.getLiveAccess('anna', { roomId: room.$id });
  assert.equal(host.canPublish, true);
  const hostClaims = verifyLiveToken(host.token, SECRET);
  assert.deepEqual([hostClaims.iss, hostClaims.sub, hostClaims.video.room, hostClaims.video.canPublish], [KEY, 'anna', room.$id, true]);
  await rejects(api.getLiveAccess('bob', { roomId: room.$id }), 403);
  await api.joinLiveRoom('bob', { roomId: room.$id, role: 'listener' });
  const viewer = await api.getLiveAccess('bob', { roomId: room.$id });
  assert.equal(viewer.canPublish, false);
  assert.equal(verifyLiveToken(viewer.token, SECRET).video.canPublish, false);

  // OBS/Prism: solo chi conduce, e solo con Premium.
  await rejects(api.createLiveIngress('bob', { roomId: room.$id }), 403);
  await rejects(api.createLiveIngress('anna', { roomId: room.$id }), 402, 'premium_required');
  await rejects(api.getLiveIngress('bob', { roomId: room.$id }), 403);

  // Palco: i permessi della persona collegata si aggiornano subito.
  await api.setLiveSpeaker('anna', { roomId: room.$id, userId: 'bob', onStage: true });
  const upd = calls.find((c) => c.url.endsWith('.RoomService/UpdateParticipant'));
  assert.deepEqual([upd.body.identity, upd.body.permission.can_publish], ['bob', true]);
  assert.equal((await api.getLiveAccess('bob', { roomId: room.$id })).canPublish, true);

  // Premium: 4 ore e trasmissione con OBS (RTMP) o WHIP; la chiave la vede solo chi conduce.
  const pro = await api.createLiveRoom('dario', { title: 'Acquagym dal vivo' });
  assert.equal(Math.round((new Date(pro.endsAt) - new Date(pro.startedAt)) / 60000), LIVE_MINUTES.premium);
  const rtmp = await api.createLiveIngress('dario', { roomId: pro.$id, kind: 'rtmp' });
  assert.deepEqual([rtmp.serverUrl, rtmp.streamKey], ['rtmps://prova.rtmp.livekit.cloud/x', 'chiave-segreta']);
  assert.equal(col('live_private')[pro.$id].$permissions.length, 0); // nessun permesso per i client
  assert.ok(!JSON.stringify(col('live_rooms')[pro.$id]).includes('chiave-segreta')); // mai sulla riga pubblica
  const whip = await api.createLiveIngress('dario', { roomId: pro.$id, kind: 'whip' });
  assert.equal(whip.kind, 'whip');
  assert.ok(calls.some((c) => c.url.endsWith('.Ingress/DeleteIngress') && c.body.ingress_id === 'IN_rtmp')); // il vecchio si cancella
  assert.equal(calls.filter((c) => c.url.endsWith('.Ingress/CreateIngress')).at(-1).body.enable_transcoding, false);
  assert.equal((await api.getLiveIngress('dario', { roomId: pro.$id })).streamKey, 'token-whip');
  await rejects(api.createLiveIngress('dario', { roomId: pro.$id, kind: 'srt' }), 400);

  // Chiusura: stanza video cancellata, ingresso eliminato, dati privati rimossi.
  await api.endLiveRoom('dario', { roomId: pro.$id });
  assert.ok(calls.some((c) => c.url.endsWith('.RoomService/DeleteRoom') && c.body.room === pro.$id));
  assert.ok(calls.some((c) => c.url.endsWith('.Ingress/DeleteIngress') && c.body.ingress_id === 'IN_whip'));
  assert.equal(col('live_private')[pro.$id], undefined);
  await rejects(api.getLiveAccess('dario', { roomId: pro.$id }), 409);

  // Durata superata: niente token, la stanza si chiude; e se ne può aprire subito un'altra.
  col('live_rooms')[room.$id].endsAt = new Date(Date.now() - 1000).toISOString();
  await rejects(api.getLiveAccess('bob', { roomId: room.$id }), 409);
  assert.equal(col('live_rooms')[room.$id].status, 'ended');
  col('live_rooms')[room.$id].status = 'active';
  const again = await api.createLiveRoom('anna', { title: 'Seconda parte del corso' });
  assert.equal(col('live_rooms')[room.$id].status, 'ended');
  await rejects(api.createLiveRoom('anna', { title: 'Terza' }), 409); // una alla volta

  // Webhook firmato: la stanza video si è svuotata, si chiude anche quella SwimIn.
  const body = JSON.stringify({ event: 'room_finished', room: { name: again.$id } });
  const auth = signLiveToken(SECRET, { iss: KEY, sha256: crypto.createHash('sha256').update(body).digest('base64'), exp: Math.floor(Date.now() / 1000) + 60 });
  await rejects(api._liveWebhook(body, 'Bearer falso'), 400);
  await api._liveWebhook(body, `Bearer ${auth}`);
  assert.equal(col('live_rooms')[again.$id].status, 'ended');

  // Ogni chiamata a LiveKit è firmata con la chiave del progetto.
  assert.ok(calls.every((c) => verifyLiveToken(c.auth, SECRET)?.iss === KEY));
});

test('senza LiveKit configurato: stanze solo chat, nessun token', async () => {
  const { db, col } = makeDb();
  const api = createApi(db, { users: { get: async () => ({ labels: [] }) } });
  col('profiles').anna = { $id: 'anna', userId: 'anna', userType: 'professional', firstName: 'Anna', connections: [] };
  const room = await api.createLiveRoom('anna', { title: 'Domande sul brevetto' });
  assert.equal(room.video, false);
  assert.equal(room.endsAt, undefined);
  await rejects(api.getLiveAccess('anna', { roomId: room.$id }), 503, 'live_unavailable');
  await api.endLiveRoom('anna', { roomId: room.$id });
  assert.equal(col('live_rooms')[room.$id].status, 'ended');
});
