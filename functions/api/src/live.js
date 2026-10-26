/**
 * Dirette video di Bordo vasca live con LiveKit (https://livekit.io).
 *
 * La stanza SwimIn (tabella live_rooms) resta la fonte di verità: chi conduce, chi è sul palco,
 * chi è tra il pubblico. LiveKit trasporta audio e video; la Function firma i token di accesso
 * (permessi diversi per chi conduce, chi è sul palco e chi guarda), crea gli ingressi per
 * OBS Studio e Prism Live Studio (RTMP o WHIP) e chiude le stanze.
 * Nessun SDK: token JWT firmati qui e API Twirp di LiveKit via fetch.
 * La chiave di trasmissione sta in live_private (nessun permesso per i client) e la vede solo chi conduce.
 */
import crypto from 'node:crypto';
import { isPremium } from './billing.js';

/** Durata massima di una diretta video, in minuti. */
export const LIVE_MINUTES = { base: 60, premium: 240 };
const TOKEN_GRACE_S = 10 * 60;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');

/** Token JWT HS256 nel formato di LiveKit (iss = API key, sub = identità, video = permessi). */
export function signLiveToken(secret, payload) {
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Legge e verifica un token firmato con il segreto (null se non valido o scaduto). */
export function verifyLiveToken(token, secret, now = Date.now()) {
  const parts = String(token || '').replace(/^Bearer\s+/i, '').split('.');
  if (parts.length !== 3 || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (claims.exp && claims.exp * 1000 < now) return null;
    if (claims.nbf && claims.nbf * 1000 > now + 60_000) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Webhook di LiveKit: token nell'header Authorization con l'hash SHA-256 del corpo. */
export function verifyLiveWebhook(rawBody, authHeader, apiKey, secret, now = Date.now()) {
  const claims = verifyLiveToken(authHeader, secret, now);
  if (!claims || claims.iss !== apiKey) return false;
  const hash = crypto.createHash('sha256').update(rawBody).digest('base64');
  return claims.sha256 === hash;
}

export function liveActions({ find, get, create, update, remove = async () => null, fail, C, displayName, config = {}, fetchImpl = fetch, log = () => {} }) {
  const { url = '', apiKey = '', apiSecret = '' } = config;
  const ready = !!(url && apiKey && apiSecret);
  const httpUrl = url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '');
  const nowS = () => Math.floor(Date.now() / 1000);

  /** Chiamata alle API server di LiveKit (Twirp, JSON). */
  const lk = async (service, method, body, grants) => {
    const token = signLiveToken(apiSecret, { iss: apiKey, sub: 'swimin-api', nbf: nowS() - 10, exp: nowS() + 600, video: grants });
    const res = await fetchImpl(`${httpUrl}/twirp/livekit.${service}/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      log(`LiveKit ${service}/${method}: ${data?.msg || res.status}`);
      fail(502, 'Il servizio video non risponde: riprova tra poco.');
    }
    return data;
  };

  const requireReady = () => {
    if (!ready) fail(503, 'Le dirette video non sono ancora attive: per ora puoi usare chat e palco.', 'live_unavailable');
  };

  const isOver = (room) => !!room.endsAt && Date.now() > new Date(room.endsAt).getTime();
  const participants = (room) => [room.hostId, ...(room.speakers || []), ...(room.listeners || [])];

  /** Chiude la stanza video: scollega tutti e cancella l'ingresso OBS/Prism. Non blocca mai la chiusura SwimIn. */
  const closeVideo = async (roomId) => {
    if (!ready) return;
    const priv = await find(C.livePrivate, roomId);
    if (priv?.ingressId) {
      await lk('Ingress', 'DeleteIngress', { ingress_id: priv.ingressId }, { ingressAdmin: true }).catch((e) => log(`ingresso ${priv.ingressId}: ${e?.message || e}`));
    }
    if (priv) await remove(C.livePrivate, roomId).catch((e) => log(`live_private ${roomId}: ${e?.message || e}`));
    await lk('RoomService', 'DeleteRoom', { room: roomId }, { roomCreate: true }).catch((e) => log(`stanza video ${roomId}: ${e?.message || e}`));
  };

  const endRoom = async (room) => {
    const ended = await update(C.liveRooms, room.$id, { status: 'ended', speakers: [], listeners: [] });
    if (room.video) await closeVideo(room.$id);
    return ended;
  };

  return {
    /** Le dirette video sono configurate? E per quanti minuti può trasmettere chi chiama. */
    _liveConfig: (profile) => ({ video: ready, minutes: isPremium(profile) ? LIVE_MINUTES.premium : LIVE_MINUTES.base }),
    _endRoom: endRoom,
    _isOver: isOver,

    /**
     * Accesso alla stanza video: token con i permessi del proprio ruolo.
     * Chi conduce e chi è sul palco pubblicano (fotocamera, microfono, schermo), il pubblico guarda.
     */
    async getLiveAccess(me, { roomId } = {}) {
      requireReady();
      if (typeof roomId !== 'string' || !roomId) fail(400, 'Stanza non valida.');
      const room = await get(C.liveRooms, roomId);
      if (room.status !== 'active') fail(409, 'La diretta è terminata.');
      if (!room.video) fail(409, 'Questa stanza è solo chat e palco.');
      if (isOver(room)) {
        await endRoom(room);
        fail(409, 'La diretta ha raggiunto la durata massima ed è stata chiusa.');
      }
      if (!participants(room).includes(me)) fail(403, 'Entra nella stanza per guardare la diretta.');
      const profile = await get(C.profiles, me);
      const canPublish = room.hostId === me || (room.speakers || []).includes(me);
      const exp = Math.floor(new Date(room.endsAt).getTime() / 1000) + TOKEN_GRACE_S;
      const token = signLiveToken(apiSecret, {
        iss: apiKey,
        sub: me,
        name: displayName(profile),
        metadata: JSON.stringify({ avatar: profile.avatar || profile.logo || '', host: room.hostId === me }),
        nbf: nowS() - 10,
        exp,
        video: {
          room: roomId,
          roomJoin: true,
          canSubscribe: true,
          canPublish,
          canPublishData: canPublish,
          ...(canPublish ? { canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'] } : {}),
        },
      });
      return { url, token, canPublish, endsAt: room.endsAt };
    },

    /**
     * Chi conduce trasmette da OBS Studio o Prism Live Studio: crea (o rigenera) l'ingresso.
     * RTMP funziona con entrambi; WHIP (solo OBS) ha meno ritardo e non va ricodificato.
     * Incluso in Premium: la ricodifica del video ha un costo al minuto.
     */
    async createLiveIngress(me, { roomId, kind = 'rtmp' } = {}) {
      requireReady();
      if (!['rtmp', 'whip'].includes(kind)) fail(400, 'Tipo di trasmissione non valido.');
      const room = await get(C.liveRooms, roomId);
      if (room.hostId !== me) fail(403, 'Solo chi conduce può trasmettere con OBS o Prism.');
      if (room.status !== 'active' || !room.video) fail(409, 'La diretta non è attiva.');
      const profile = await get(C.profiles, me);
      if (!isPremium(profile)) fail(402, 'Trasmettere con OBS Studio o Prism Live Studio è incluso in SwimIn Premium. Dal browser puoi andare in diretta anche con il piano Base.', 'premium_required');

      const old = await find(C.livePrivate, roomId);
      if (old?.ingressId) await lk('Ingress', 'DeleteIngress', { ingress_id: old.ingressId }, { ingressAdmin: true }).catch((e) => log(`ingresso vecchio: ${e?.message || e}`));
      const ingress = await lk('Ingress', 'CreateIngress', {
        input_type: kind === 'rtmp' ? 'RTMP_INPUT' : 'WHIP_INPUT',
        name: `SwimIn ${roomId}`,
        room_name: roomId,
        participant_identity: `ingress-${me}`,
        participant_name: displayName(profile),
        participant_metadata: JSON.stringify({ avatar: profile.avatar || profile.logo || '', host: true, ingress: true }),
        // WHIP da OBS arriva già in H.264/Opus: nessuna ricodifica (e nessun costo di transcodifica).
        ...(kind === 'whip' ? { enable_transcoding: false } : {}),
      }, { ingressAdmin: true });
      const row = {
        ingressId: ingress.ingress_id || ingress.ingressId || '',
        kind,
        serverUrl: ingress.url || '',
        streamKey: ingress.stream_key || ingress.streamKey || '',
      };
      if (!row.ingressId || !row.serverUrl) fail(502, 'Il servizio video non ha restituito i dati di trasmissione.');
      if (old) await update(C.livePrivate, roomId, row);
      else await create(C.livePrivate, row, [], roomId);
      return row;
    },

    /** Dati di trasmissione già creati (solo chi conduce). */
    async getLiveIngress(me, { roomId } = {}) {
      const room = await get(C.liveRooms, roomId);
      if (room.hostId !== me) fail(403, 'Solo chi conduce vede i dati di trasmissione.');
      const priv = await find(C.livePrivate, roomId);
      return priv ? { ingressId: priv.ingressId, kind: priv.kind, serverUrl: priv.serverUrl, streamKey: priv.streamKey } : null;
    },

    /** Dopo un cambio di palco: aggiorna i permessi della persona già collegata alla stanza video. */
    async _syncStagePermission(room, userId, onStage) {
      if (!ready || !room.video) return;
      await lk('RoomService', 'UpdateParticipant', {
        room: room.$id,
        identity: userId,
        permission: { can_subscribe: true, can_publish: onStage, can_publish_data: onStage, ...(onStage ? { can_publish_sources: ['CAMERA', 'MICROPHONE', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'] } : {}) },
      }, { room: room.$id, roomAdmin: true }).catch((e) => log(`permessi palco ${userId}: ${e?.message || e}`)); // non ancora collegata: vale il prossimo token
    },

    /** Webhook di LiveKit: quando la stanza video si svuota e chiude, si chiude anche la stanza SwimIn. */
    async _liveWebhook(rawBody, authHeader) {
      if (!ready || !verifyLiveWebhook(rawBody, authHeader, apiKey, apiSecret)) fail(400, 'Firma non valida.');
      const event = JSON.parse(rawBody);
      if (event.event === 'room_finished' && event.room?.name) {
        const room = await find(C.liveRooms, event.room.name);
        if (room && room.status === 'active' && room.video) await endRoom(room);
      }
      return { received: true };
    },
  };
}
